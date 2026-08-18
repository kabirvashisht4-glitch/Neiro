import { CloseIcon } from './Icons'

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek 5 seconds'],
  ['⇧ ← / →', 'Seek 30 seconds'],
  ['↑ / ↓', 'Volume'],
  ['N / P', 'Next / previous track'],
  ['M', 'Mute'],
  ['S', 'Shuffle'],
  ['L', 'Repeat mode'],
  ['V', 'Cycle visualizer'],
  ['F', 'Fullscreen visualizer'],
  ['0–9', 'Jump to 0–90% of the track'],
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <dl className="mt-4 space-y-2">
          {SHORTCUTS.map(([keys, description]) => (
            <div key={keys} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-white/60">{description}</dt>
              <dd>
                <kbd className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
