import { formatTime } from '../lib/format'
import type { RepeatMode, Track } from '../types'
import {
  MusicIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from './Icons'

type Props = {
  track: Track | null
  isPlaying: boolean
  time: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  rate: number
  disabled: boolean
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (seconds: number) => void
  onVolume: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
}

function fill(percent: number): string {
  return `linear-gradient(to right, var(--accent) ${percent}%, rgb(255 255 255 / 0.14) ${percent}%)`
}

export function TransportBar(props: Props) {
  const {
    track,
    isPlaying,
    time,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    rate,
    disabled,
    onPlayPause,
    onNext,
    onPrev,
    onSeek,
    onVolume,
    onToggleMute,
    onToggleShuffle,
    onCycleRepeat,
  } = props

  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <span className="w-11 shrink-0 text-right text-xs tabular-nums text-white/50">
          {formatTime(time)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(time, duration || 0)}
          disabled={disabled || duration === 0}
          onChange={(event) => onSeek(Number(event.target.value))}
          style={{ background: fill(progress) }}
          className="range flex-1"
          aria-label="Seek"
        />
        <span className="w-11 shrink-0 text-xs tabular-nums text-white/50">
          {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {track?.artwork ? (
            <img src={track.artwork} alt="" className="h-11 w-11 rounded-lg object-cover" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 text-white/30">
              <MusicIcon className="h-5 w-5" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {track ? track.title : 'Nothing loaded'}
            </span>
            <span className="block truncate text-xs text-white/40">
              {track ? track.artist : 'Drop a file to begin'}
              {rate !== 1 && track ? ` · ${rate}×` : ''}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleShuffle}
            aria-pressed={shuffle}
            aria-label="Shuffle"
            title="Shuffle (S)"
            className={`hidden rounded-full p-2 transition sm:block ${
              shuffle ? 'text-[var(--accent)]' : 'text-white/45 hover:text-white'
            }`}
          >
            <ShuffleIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onPrev}
            disabled={disabled}
            aria-label="Previous track"
            title="Previous (P)"
            className="rounded-full p-2 text-white/70 transition hover:text-white disabled:opacity-30"
          >
            <PrevIcon />
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            disabled={disabled}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title="Play / pause (Space)"
            className="accent-glow flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-black transition hover:brightness-110 disabled:opacity-30"
          >
            {isPlaying ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={disabled}
            aria-label="Next track"
            title="Next (N)"
            className="rounded-full p-2 text-white/70 transition hover:text-white disabled:opacity-30"
          >
            <NextIcon />
          </button>
          <button
            type="button"
            onClick={onCycleRepeat}
            aria-label={`Repeat: ${repeat}`}
            title="Repeat (L)"
            className={`hidden rounded-full p-2 transition sm:block ${
              repeat === 'off' ? 'text-white/45 hover:text-white' : 'text-[var(--accent)]'
            }`}
          >
            <RepeatIcon className="h-4 w-4" one={repeat === 'one'} />
          </button>
        </div>

        <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title="Mute (M)"
            className="rounded-full p-2 text-white/60 transition hover:text-white"
          >
            <VolumeIcon className="h-4 w-4" muted={muted || volume === 0} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            style={{ background: fill((muted ? 0 : volume) * 100) }}
            className="range w-28"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  )
}
