import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from 'neiro-visualizer'
import { DropZone } from './components/DropZone'
import { Equalizer } from './components/Equalizer'
import {
  ExpandIcon,
  KeyboardIcon,
  ListIcon,
  MicIcon,
  SlidersIcon,
} from './components/Icons'
import { Playlist } from './components/Playlist'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { TransportBar } from './components/TransportBar'
import { VisualizerCanvas } from './components/VisualizerCanvas'
import { readTags } from './lib/id3'
import { prettyName } from './lib/format'
import { loadSettings, saveSettings } from './lib/storage'
import { VISUALIZER_MODES } from 'neiro-visualizer'
import type { VisualizerMode } from 'neiro-visualizer'
import type { RepeatMode, Settings, Track } from './types'

const AUDIO_EXTENSIONS = /\.(mp3|wav|flac|ogg|oga|m4a|mp4|aac|opus|weba|webm|aiff?)$/i

function makeId(): string {
  return crypto.randomUUID?.() ?? `t${Date.now()}${Math.random().toString(16).slice(2)}`
}

/** Reads a track's duration without disturbing the main player. */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = new Audio()
    probe.preload = 'metadata'
    const done = (value: number | null) => {
      probe.src = ''
      resolve(value)
    }
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? probe.duration : null)
    probe.onerror = () => done(null)
    probe.src = url
  })
}

/** Object URLs need revoking; URLs the CLI serves must be left alone. */
function release(track: Track): void {
  if (track.url.startsWith('blob:')) URL.revokeObjectURL(track.url)
  if (track.artwork?.startsWith('blob:')) URL.revokeObjectURL(track.artwork)
}

type ServerTrack = { id: string; url: string; fileName: string; title: string; size: number }

/**
 * When the page is served by `neiro-cli`, /api/tracks lists the folder it was
 * pointed at. Anywhere else the fetch simply 404s and we stay drag-and-drop only.
 */
async function fetchLibrary(): Promise<Track[]> {
  try {
    const response = await fetch('/api/tracks')
    if (!response.ok) return []
    const data = (await response.json()) as { tracks?: ServerTrack[] }
    if (!Array.isArray(data.tracks)) return []
    return data.tracks.map((track) => ({
      id: `srv-${track.id}`,
      url: track.url,
      fileName: track.fileName,
      title: track.title || prettyName(track.fileName),
      artist: 'Unknown artist',
      album: '',
      artwork: null,
      size: track.size,
      duration: null,
    }))
  } catch {
    return []
  }
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [panel, setPanel] = useState<'queue' | 'eq'>('queue')
  const [panelOpen, setPanelOpen] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings)

  const audioRef = useRef<HTMLAudioElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<AudioEngine | null>(null)
  const dragDepth = useRef(0)
  const autoPlayRef = useRef(false)

  const current = tracks.find((track) => track.id === currentId) ?? null

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((value) => (value === message ? null : value)), 4000)
  }, [])

  /* ---------------------------------------------------------------- audio */

  const ensureEngine = useCallback(async () => {
    if (!engineRef.current && audioRef.current) {
      try {
        const engine = new AudioEngine()
        engine.attach(audioRef.current)
        engineRef.current = engine
      } catch {
        flash('Web Audio is unavailable in this browser — playback works, visuals will not.')
        return null
      }
    }
    await engineRef.current?.resume()
    return engineRef.current
  }, [flash])

  const select = useCallback((id: string, autoPlay = true) => {
    autoPlayRef.current = autoPlay
    setCurrentId(id)
  }, [])

  // Load the selected track into the single <audio> element.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.src !== current.url) {
      audio.src = current.url
      audio.load()
      setTime(0)
      setDuration(current.duration ?? 0)
    }
    if (autoPlayRef.current) {
      autoPlayRef.current = false
      void ensureEngine().then(() => audio.play().catch(() => flash('Playback was blocked.')))
    }
  }, [current, ensureEngine, flash])

  // Settings -> engine / element.
  useEffect(() => {
    const engine = engineRef.current
    const value = muted ? 0 : settings.volume
    if (engine) engine.setVolume(value)
    else if (audioRef.current) audioRef.current.volume = value
  }, [settings.volume, muted, isPlaying])

  useEffect(() => {
    engineRef.current?.setEqAll(settings.eq)
  }, [settings.eq, isPlaying])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = settings.rate
  }, [settings.rate, currentId])

  useEffect(() => {
    document.documentElement.style.setProperty('--hue', String(settings.hue))
  }, [settings.hue])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  /* ------------------------------------------------------------- playlist */

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return
      const list = Array.from(files)
      const accepted = list.filter(
        (file) => file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name),
      )
      if (accepted.length === 0) {
        flash('No playable audio in that drop — try MP3, WAV, FLAC, OGG or M4A.')
        return
      }
      if (accepted.length < list.length) {
        flash(`Skipped ${list.length - accepted.length} non-audio file(s).`)
      }

      const added = accepted.map((file) => ({
        file,
        track: {
          id: makeId(),
          url: URL.createObjectURL(file),
          fileName: file.name,
          title: prettyName(file.name),
          artist: 'Unknown artist',
          album: '',
          artwork: null,
          size: file.size,
          duration: null,
        } satisfies Track,
      }))

      setTracks((prev) => {
        const next = [...prev, ...added.map((entry) => entry.track)]
        if (!currentId) select(added[0].track.id, prev.length === 0)
        return next
      })

      // Enrich asynchronously: ID3 tags first, then duration.
      for (const { file, track } of added) {
        void readTags(file).then((tags) => {
          const artwork = tags.artwork ? URL.createObjectURL(tags.artwork) : null
          setTracks((prev) =>
            prev.map((item) =>
              item.id === track.id
                ? {
                    ...item,
                    title: tags.title || item.title,
                    artist: tags.artist || item.artist,
                    album: tags.album || item.album,
                    artwork: artwork ?? item.artwork,
                  }
                : item,
            ),
          )
        })
        void probeDuration(track.url).then((value) => {
          if (value == null) return
          setTracks((prev) =>
            prev.map((item) => (item.id === track.id ? { ...item, duration: value } : item)),
          )
        })
      }
    },
    [currentId, flash, select],
  )

  const removeTrack = useCallback(
    (id: string) => {
      setTracks((prev) => {
        const target = prev.find((track) => track.id === id)
        if (target) release(target)
        const next = prev.filter((track) => track.id !== id)
        if (id === currentId) {
          const audio = audioRef.current
          if (audio) {
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
          }
          setIsPlaying(false)
          setTime(0)
          setDuration(0)
          setCurrentId(next.length > 0 ? next[0].id : null)
          autoPlayRef.current = false
        }
        return next
      })
    },
    [currentId],
  )

  const clearAll = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setTracks((prev) => {
      prev.forEach(release)
      return []
    })
    setCurrentId(null)
    setIsPlaying(false)
    setTime(0)
    setDuration(0)
  }, [])

  /* ------------------------------------------------------------ transport */

  const stopMic = useCallback(() => {
    engineRef.current?.disableMic()
    setMicOn(false)
  }, [])

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !currentId) return
    if (micOn) stopMic()
    await ensureEngine()
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        flash('Playback was blocked by the browser.')
      }
    } else {
      audio.pause()
    }
  }, [currentId, ensureEngine, flash, micOn, stopMic])

  const skip = useCallback(
    (delta: number) => {
      if (tracks.length === 0) return
      const index = tracks.findIndex((track) => track.id === currentId)
      let next: number
      if (settings.shuffle && tracks.length > 1) {
        do {
          next = Math.floor(Math.random() * tracks.length)
        } while (next === index)
      } else {
        next = (index + delta + tracks.length) % tracks.length
      }
      select(tracks[next].id, true)
    },
    [currentId, select, settings.shuffle, tracks],
  )

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration))
    setTime(audio.currentTime)
  }, [])

  const handleEnded = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (settings.repeat === 'one') {
      audio.currentTime = 0
      void audio.play()
      return
    }
    const index = tracks.findIndex((track) => track.id === currentId)
    const isLast = index === tracks.length - 1
    if (isLast && settings.repeat === 'off' && !settings.shuffle) {
      setIsPlaying(false)
      return
    }
    skip(1)
  }, [currentId, settings.repeat, settings.shuffle, skip, tracks])

  const toggleMic = useCallback(async () => {
    if (micOn) {
      stopMic()
      return
    }
    const engine = await ensureEngine()
    if (!engine) return
    try {
      audioRef.current?.pause()
      await engine.enableMic()
      setMicOn(true)
    } catch {
      flash('Microphone access was denied.')
    }
  }, [ensureEngine, flash, micOn, stopMic])

  const toggleFullscreen = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stage.requestFullscreen().catch(() => flash('Fullscreen was refused.'))
  }, [flash])

  const cycleMode = useCallback(() => {
    const index = VISUALIZER_MODES.findIndex((option) => option.id === settings.mode)
    update({ mode: VISUALIZER_MODES[(index + 1) % VISUALIZER_MODES.length].id })
  }, [settings.mode, update])

  const cycleRepeat = useCallback(() => {
    const order: RepeatMode[] = ['off', 'all', 'one']
    update({ repeat: order[(order.indexOf(settings.repeat) + 1) % order.length] })
  }, [settings.repeat, update])

  /* ------------------------------------------------------------ shortcuts */

  const commands = useRef({ togglePlay, skip, seek, cycleMode, cycleRepeat, toggleFullscreen })
  commands.current = { togglePlay, skip, seek, cycleMode, cycleRepeat, toggleFullscreen }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) {
        return
      }
      const audio = audioRef.current
      const jump = event.shiftKey ? 30 : 5
      const api = commands.current

      switch (event.key) {
        case ' ':
          event.preventDefault()
          void api.togglePlay()
          break
        case 'ArrowRight':
          event.preventDefault()
          if (audio) api.seek(audio.currentTime + jump)
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (audio) api.seek(audio.currentTime - jump)
          break
        case 'ArrowUp':
          event.preventDefault()
          setSettings((prev) => ({ ...prev, volume: Math.min(1, prev.volume + 0.05) }))
          setMuted(false)
          break
        case 'ArrowDown':
          event.preventDefault()
          setSettings((prev) => ({ ...prev, volume: Math.max(0, prev.volume - 0.05) }))
          break
        case 'Escape':
          setShowShortcuts(false)
          break
        default: {
          const key = event.key.toLowerCase()
          if (key === 'n') api.skip(1)
          else if (key === 'p') api.skip(-1)
          else if (key === 'm') setMuted((value) => !value)
          else if (key === 's') setSettings((prev) => ({ ...prev, shuffle: !prev.shuffle }))
          else if (key === 'l') api.cycleRepeat()
          else if (key === 'v') api.cycleMode()
          else if (key === 'f') api.toggleFullscreen()
          else if (key === '?') setShowShortcuts((value) => !value)
          else if (/^[0-9]$/.test(key) && audio && Number.isFinite(audio.duration)) {
            api.seek((Number(key) / 10) * audio.duration)
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /* --------------------------------------------------------- server library */

  useEffect(() => {
    let cancelled = false
    void fetchLibrary().then((library) => {
      if (cancelled || library.length === 0) return
      setTracks((prev) => (prev.length > 0 ? prev : library))
      setCurrentId((prev) => prev ?? library[0].id)
      for (const track of library) {
        void probeDuration(track.url).then((value) => {
          if (value == null) return
          setTracks((prev) =>
            prev.map((item) => (item.id === track.id ? { ...item, duration: value } : item)),
          )
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  /* --------------------------------------------------------- media session */

  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: current.artwork ? [{ src: current.artwork }] : [],
    })
    navigator.mediaSession.setActionHandler('play', () => void togglePlay())
    navigator.mediaSession.setActionHandler('pause', () => void togglePlay())
    navigator.mediaSession.setActionHandler('nexttrack', () => skip(1))
    navigator.mediaSession.setActionHandler('previoustrack', () => skip(-1))
  }, [current, skip, togglePlay])

  /* ------------------------------------------------------------- lifecycle */

  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  useEffect(() => {
    return () => {
      tracksRef.current.forEach(release)
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  /* ------------------------------------------------------------------ view */

  const hasTracks = tracks.length > 0

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-[#0a0a0b] text-white"
      onDragEnter={(event) => {
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        addFiles(event.dataTransfer.files)
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            NEIRO<span className="text-[var(--accent)]">.</span>
          </h1>
          <span className="hidden text-xs text-white/35 sm:inline">
            audio player &amp; visualizer
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleMic()}
            aria-pressed={micOn}
            title="Visualize microphone input"
            className={`rounded-full p-2 transition ${
              micOn
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-white/50 hover:bg-white/5 hover:text-white'
            }`}
          >
            <MicIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Fullscreen visualizer (F)"
            className="rounded-full p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
          >
            <ExpandIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts (?)"
            className="rounded-full p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
          >
            <KeyboardIcon className="h-4 w-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <button
            type="button"
            onClick={() => {
              setPanel('queue')
              setPanelOpen((open) => (panel === 'queue' ? !open : true))
            }}
            aria-pressed={panelOpen && panel === 'queue'}
            title="Queue"
            className={`rounded-full p-2 transition ${
              panelOpen && panel === 'queue'
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:bg-white/5 hover:text-white'
            }`}
          >
            <ListIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPanel('eq')
              setPanelOpen((open) => (panel === 'eq' ? !open : true))
            }}
            aria-pressed={panelOpen && panel === 'eq'}
            title="Equalizer & visuals"
            className={`rounded-full p-2 transition ${
              panelOpen && panel === 'eq'
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:bg-white/5 hover:text-white'
            }`}
          >
            <SlidersIcon className="h-4 w-4" />
          </button>
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={stageRef} className="relative min-h-[240px] flex-1 bg-black">
          <VisualizerCanvas
            engineRef={engineRef}
            mode={settings.mode}
            hue={settings.hue}
            active={isPlaying || micOn}
          />

          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {current && (
                  <>
                    <p className="truncate text-lg font-semibold drop-shadow-lg sm:text-2xl">
                      {current.title}
                    </p>
                    <p className="truncate text-sm text-white/60">{current.artist}</p>
                  </>
                )}
                {micOn && (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs text-red-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                    Live microphone input
                  </p>
                )}
              </div>

              <div className="pointer-events-auto flex shrink-0 gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur">
                {VISUALIZER_MODES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => update({ mode: option.id as VisualizerMode })}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      settings.mode === option.id
                        ? 'bg-[var(--accent)] text-black'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {!hasTracks && (
              <div className="pointer-events-auto flex flex-1 items-center justify-center py-6">
                <DropZone onFiles={addFiles} />
              </div>
            )}
          </div>

          {dragging && (
            <div className="absolute inset-0 z-20 m-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] text-sm font-medium backdrop-blur-sm">
              Release to add to the queue
            </div>
          )}
        </div>

        {panelOpen && (
          <aside className="h-[42vh] w-full shrink-0 overflow-hidden border-t border-white/10 bg-[#0d0d0f] lg:h-auto lg:w-[360px] lg:border-t-0 lg:border-l">
            {panel === 'queue' ? (
              <Playlist
                tracks={tracks}
                currentId={currentId}
                isPlaying={isPlaying}
                onSelect={(id) => select(id, true)}
                onRemove={removeTrack}
                onClear={clearAll}
                onFiles={addFiles}
              />
            ) : (
              <Equalizer
                gains={settings.eq}
                onGains={(eq) => update({ eq })}
                hue={settings.hue}
                onHue={(hue) => update({ hue })}
                mode={settings.mode}
                onMode={(mode) => update({ mode })}
                rate={settings.rate}
                onRate={(rate) => update({ rate })}
              />
            )}
          </aside>
        )}
      </main>

      <TransportBar
        track={current}
        isPlaying={isPlaying}
        time={time}
        duration={duration}
        volume={settings.volume}
        muted={muted}
        shuffle={settings.shuffle}
        repeat={settings.repeat}
        rate={settings.rate}
        disabled={!current}
        onPlayPause={() => void togglePlay()}
        onNext={() => skip(1)}
        onPrev={() => skip(-1)}
        onSeek={seek}
        onVolume={(volume) => {
          update({ volume })
          if (volume > 0) setMuted(false)
        }}
        onToggleMute={() => setMuted((value) => !value)}
        onToggleShuffle={() => update({ shuffle: !settings.shuffle })}
        onCycleRepeat={cycleRepeat}
      />

      {notice && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-neutral-900/95 px-4 py-2 text-xs text-white/80 shadow-xl">
          {notice}
        </div>
      )}

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      <audio
        ref={audioRef}
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration
          setDuration(Number.isFinite(value) ? value : 0)
          event.currentTarget.playbackRate = settings.rate
        }}
        onError={() => {
          if (currentId) flash('That file could not be decoded by this browser.')
        }}
      />
    </div>
  )
}
