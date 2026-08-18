import { useRef } from 'react'
import { MusicIcon } from './Icons'

type Props = {
  onFiles: (files: FileList | null) => void
  compact?: boolean
}

export function DropZone({ onFiles, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus"
      multiple
      className="hidden"
      onChange={(event) => {
        onFiles(event.target.files)
        event.target.value = ''
      }}
    />
  )

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-[var(--accent)] hover:text-white"
        >
          Add files
        </button>
        {picker}
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-8 py-16 text-center backdrop-blur-sm transition hover:border-[var(--accent)]/60">
      <span className="accent-glow mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <MusicIcon className="h-9 w-9" />
      </span>
      <h2 className="text-2xl font-semibold tracking-tight">Drop your music anywhere</h2>
      <p className="mt-2 max-w-sm text-sm text-white/50">
        MP3, WAV, FLAC, OGG, M4A — decoded and analysed entirely in your browser. Nothing is
        uploaded.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="accent-glow mt-8 rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-semibold text-black transition hover:brightness-110"
      >
        Browse files
      </button>
      {picker}
    </div>
  )
}
