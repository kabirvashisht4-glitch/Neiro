export type VisualizerMode = 'bars' | 'wave' | 'radial' | 'orbit'

export const VISUALIZER_MODES: { id: VisualizerMode; label: string }[] = [
  { id: 'bars', label: 'Bars' },
  { id: 'wave', label: 'Wave' },
  { id: 'radial', label: 'Radial' },
  { id: 'orbit', label: 'Orbit' },
]

/** One frame of analysis, as handed to {@link Visualizer.draw}. */
export type Frame = {
  /** Byte frequency data from an `AnalyserNode`. */
  freq: Uint8Array
  /** Byte time-domain data from an `AnalyserNode`. */
  wave: Uint8Array
  /** RMS of the waveform, 0–1. */
  level: number
  /** False while showing stand-in data, so renderers can stay calm. */
  active: boolean
}
