import { useEffect, useRef, useState } from 'react'
import { formatBytes, formatTime } from '../lib/format'
import type { Playlist as SavedPlaylist } from '../lib/library'
import type { Track } from '../types'
import { CloseIcon, MusicIcon, PlusIcon } from './Icons'
import { DropZone } from './DropZone'

type Props = {
  tracks: Track[]
  currentId: string | null
  isPlaying: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onFiles: (files: FileList | null) => void
  /** Saved playlists, when the CLI is serving the library. */
  playlists?: SavedPlaylist[]
  /** Set while viewing one playlist rather than the whole library. */
  activePlaylistId?: string | null
  onAddToPlaylist?: (playlistId: string, trackId: string) => void
}

export function Playlist({
  tracks,
  currentId,
  isPlaying,
  onSelect,
  onRemove,
  onClear,
  onFiles,
  playlists = [],
  activePlaylistId = null,
  onAddToPlaylist,
}: Props) {
  // Which row's "add to playlist" menu is open, if any.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menuFor === null) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuFor(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuFor])

  const canAdd = playlists.length > 0 && onAddToPlaylist !== undefined
  const known = tracks.filter((track) => track.duration != null)
  const total = known.reduce((sum, track) => sum + (track.duration ?? 0), 0)

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            {playlists.find((p) => p.id === activePlaylistId)?.name ?? 'Queue'}
          </h2>
          <p className="text-xs text-white/40">
            {tracks.length} track{tracks.length === 1 ? '' : 's'}
            {known.length > 0 && ` · ${formatTime(total)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropZone onFiles={onFiles} compact />
          {tracks.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-red-400/60 hover:text-red-300"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <ol className="flex-1 space-y-1 overflow-y-auto p-2">
        {tracks.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-white/35">
            {activePlaylistId
              ? 'This playlist is empty. Add tracks from All tracks.'
              : 'Your queue is empty. Drop files anywhere on the page.'}
          </li>
        )}
        {tracks.map((track, index) => {
          const isCurrent = track.id === currentId
          return (
            <li key={track.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(track.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(track.id)
                  }
                }}
                className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                  isCurrent ? 'bg-[var(--accent-soft)]' : 'hover:bg-white/5'
                }`}
              >
                <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-white/35">
                  {isCurrent && isPlaying ? (
                    <span className="equalizer-bars" aria-label="Now playing">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    index + 1
                  )}
                </span>

                {track.artwork ? (
                  <img
                    src={track.artwork}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/30">
                    <MusicIcon className="h-4 w-4" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm ${isCurrent ? 'text-[var(--accent)]' : 'text-white/90'}`}
                  >
                    {track.title}
                  </span>
                  <span className="block truncate text-xs text-white/40">
                    {track.artist}
                    {track.album ? ` — ${track.album}` : ''} · {formatBytes(track.size)}
                  </span>
                </span>

                <span className="shrink-0 text-xs tabular-nums text-white/40">
                  {track.duration != null ? formatTime(track.duration) : '--:--'}
                </span>

                {canAdd && (
                  <span className="relative shrink-0">
                    <button
                      type="button"
                      aria-label={`Add ${track.title} to a playlist`}
                      aria-expanded={menuFor === track.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuFor((open) => (open === track.id ? null : track.id))
                      }}
                      className="rounded-full p-1 text-white/25 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                    </button>

                    {menuFor === track.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-white/15 bg-neutral-900 py-1 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className="px-3 py-1 text-[10px] tracking-wider text-white/35 uppercase">
                          Add to
                        </p>
                        {playlists.map((playlist) => (
                          <button
                            key={playlist.id}
                            type="button"
                            onClick={() => {
                              onAddToPlaylist?.(playlist.id, track.id)
                              setMenuFor(null)
                            }}
                            className="block w-full truncate px-3 py-1.5 text-left text-xs text-white/75 transition hover:bg-white/10 hover:text-white"
                          >
                            {playlist.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}

                <button
                  type="button"
                  aria-label={`Remove ${track.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(track.id)
                  }}
                  className="shrink-0 rounded-full p-1 text-white/25 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
