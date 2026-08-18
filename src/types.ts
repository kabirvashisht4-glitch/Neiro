import type { VisualizerMode } from 'neiro-visualizer'

export type Track = {
  id: string
  url: string
  fileName: string
  title: string
  artist: string
  album: string
  artwork: string | null
  size: number
  duration: number | null
}

export { VISUALIZER_MODES } from 'neiro-visualizer'
export type { Frame, VisualizerMode } from 'neiro-visualizer'

export type RepeatMode = 'off' | 'all' | 'one'

export type Settings = {
  volume: number
  mode: VisualizerMode
  hue: number
  eq: number[]
  rate: number
  shuffle: boolean
  repeat: RepeatMode
}
