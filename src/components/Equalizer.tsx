import { EQ_BANDS, EQ_PRESETS, VISUALIZER_MODES } from 'neiro-visualizer'
import type { VisualizerMode } from 'neiro-visualizer'

type Props = {
  gains: number[]
  onGains: (gains: number[]) => void
  hue: number
  onHue: (hue: number) => void
  mode: VisualizerMode
  onMode: (mode: VisualizerMode) => void
  rate: number
  onRate: (rate: number) => void
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`
}

export function Equalizer({ gains, onGains, hue, onHue, mode, onMode, rate, onRate }: Props) {
  const setBand = (index: number, value: number) => {
    const next = gains.slice()
    next[index] = value
    onGains(next)
  }

  const activePreset = Object.entries(EQ_PRESETS).find(([, preset]) =>
    preset.every((value, i) => value === gains[i]),
  )?.[0]

  return (
    <section className="flex h-full flex-col overflow-y-auto p-4">
      <h2 className="text-sm font-semibold tracking-tight">Equalizer</h2>
      <p className="text-xs text-white/40">Five biquad bands, applied before the analyser.</p>

      <div className="mt-4 flex items-end justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-4">
        {EQ_BANDS.map((band, index) => (
          <label key={band} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-[11px] tabular-nums text-white/50">
              {gains[index] > 0 ? '+' : ''}
              {gains[index]}
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={gains[index]}
              onChange={(event) => setBand(index, Number(event.target.value))}
              className="range-vertical"
              aria-label={`${bandLabel(band)} hertz`}
            />
            <span className="text-[11px] text-white/40">{bandLabel(band)}</span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(EQ_PRESETS).map(([name, preset]) => (
          <button
            key={name}
            type="button"
            onClick={() => onGains(preset.slice())}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              activePreset === name
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-white/15 text-white/60 hover:border-white/35 hover:text-white'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <h2 className="mt-7 text-sm font-semibold tracking-tight">Visualizer</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {VISUALIZER_MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onMode(option.id)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
              mode === option.id
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="text-xs text-white/50">Accent hue</span>
        <input
          type="range"
          min={0}
          max={359}
          value={hue}
          onChange={(event) => onHue(Number(event.target.value))}
          className="range hue-range mt-2 w-full"
          aria-label="Accent hue"
        />
      </label>

      <h2 className="mt-7 text-sm font-semibold tracking-tight">Playback speed</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {RATES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onRate(value)}
            className={`rounded-full border px-3 py-1.5 text-xs tabular-nums transition ${
              rate === value
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-white/15 text-white/60 hover:border-white/35 hover:text-white'
            }`}
          >
            {value}×
          </button>
        ))}
      </div>
    </section>
  )
}
