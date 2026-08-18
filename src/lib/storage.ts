import type { Settings } from '../types'

const KEY = 'neiro.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.8,
  mode: 'bars',
  hue: 152,
  eq: [0, 0, 0, 0, 0],
  rate: 1,
  shuffle: false,
  repeat: 'off',
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      eq:
        Array.isArray(parsed.eq) && parsed.eq.length === DEFAULT_SETTINGS.eq.length
          ? parsed.eq.map((n) => (Number.isFinite(n) ? n : 0))
          : DEFAULT_SETTINGS.eq,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}
