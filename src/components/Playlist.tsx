import { formatBytes, formatTime } from '../lib/format'
import type { Track } from '../types'
import { CloseIcon, MusicIcon } from './Icons'
import { DropZone } from './DropZone'

type Props = {
  tracks: Track[]
  currentId: string | null
  isPlaying: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onFiles: (files: FileList | null) => void
}

export function Playlist({
  tracks,
  currentId,
  isPlaying,
  onSelect,
  onRemove,
  onClear,
  onFiles,
}: Props) {
  const known = tracks.filter((track) => track.duration != null)
  const total = known.reduce((sum, track) => sum + (track.duration ?? 0), 0)

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Queue</h2>
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
            Your queue is empty. Drop files anywhere on the page.
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
