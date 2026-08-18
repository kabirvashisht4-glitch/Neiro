import { useEffect, useRef, useState } from 'react'
import type { Playlist } from '../lib/library'
import { CloseIcon, PlusIcon } from './Icons'

type Props = {
  playlists: Playlist[]
  activeId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
}

/**
 * Playlist switcher for the queue panel. "All tracks" is the library itself;
 * every other chip narrows the queue to a saved playlist.
 */
export function PlaylistBar({ playlists, activeId, onSelect, onCreate, onDelete }: Props) {
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (naming) inputRef.current?.focus()
  }, [naming])

  const commit = () => {
    const name = draft.trim()
    if (name) onCreate(name)
    setDraft('')
    setNaming(false)
  }

  const chip = 'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition'

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-3 py-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeId === null}
        className={`${chip} ${
          activeId === null
            ? 'bg-[var(--accent)] text-black'
            : 'text-white/55 hover:bg-white/5 hover:text-white'
        }`}
      >
        All tracks
      </button>

      {playlists.map((playlist) => {
        const active = playlist.id === activeId
        return (
          <span
            key={playlist.id}
            className={`group flex items-center rounded-full ${
              active ? 'bg-[var(--accent)]' : 'hover:bg-white/5'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(playlist.id)}
              aria-pressed={active}
              className={`${chip} ${active ? 'text-black' : 'text-white/55 hover:text-white'}`}
            >
              {playlist.name}
              <span className={active ? 'ml-1.5 text-black/50' : 'ml-1.5 text-white/30'}>
                {playlist.trackIds.length}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete playlist ${playlist.name}`}
              onClick={() => onDelete(playlist.id)}
              className={`mr-1 rounded-full p-0.5 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 ${
                active ? 'text-black/60 hover:text-black' : 'text-white/35 hover:text-red-300'
              }`}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </span>
        )
      })}

      {naming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') {
              setDraft('')
              setNaming(false)
            }
          }}
          placeholder="Playlist name"
          maxLength={80}
          className="w-32 rounded-full border border-[var(--accent)] bg-black/40 px-3 py-1 text-xs text-white outline-none placeholder:text-white/30"
        />
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          title="New playlist"
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-white/45 transition hover:bg-white/5 hover:text-white"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New
        </button>
      )}
    </div>
  )
}
