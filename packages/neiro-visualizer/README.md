# neiro-visualizer

The audio engine and canvas renderer behind [Neiro](https://github.com/) — a local-first
audio player and visualizer. Framework-agnostic, typed, **zero dependencies**.

```bash
npm i neiro-visualizer
```

## What you get

- **`AudioEngine`** — an `AudioContext` wired as
  `source → 5-band biquad EQ → AnalyserNode → gain → destination`, plus optional
  microphone input that reaches the analyser but never the speakers (no feedback loop).
- **`Visualizer`** — a canvas 2D renderer with four modes (`bars`, `wave`, `radial`,
  `orbit`) that keeps smoothing, peak-hold and particle state between frames.

## Quick start

```ts
import { AudioEngine, Visualizer } from 'neiro-visualizer'

const audio = document.querySelector('audio')!
const canvas = document.querySelector('canvas')!
const ctx = canvas.getContext('2d')!

const engine = new AudioEngine()
engine.attach(audio)          // safe to call repeatedly; only wires once
await engine.resume()         // must follow a user gesture

const viz = new Visualizer()

function frame() {
  requestAnimationFrame(frame)
  const level = engine.sample()   // fills engine.freq / engine.wave, returns RMS
  viz.draw(ctx, canvas.width, canvas.height, 'bars', 152, {
    freq: engine.freq,
    wave: engine.wave,
    level,
    active: true,
  })
}
frame()
```

## AudioEngine

| Member | Description |
| --- | --- |
| `attach(el)` | Wire an `HTMLAudioElement` into the graph. An element may only be connected once, so this is a no-op on repeat calls. |
| `resume()` | Resume a suspended context. Browsers require a user gesture first. |
| `sample()` | Read the analyser once per frame. Fills `freq` and `wave`, returns waveform RMS (0–1). |
| `setVolume(v)` | Output gain, 0–1, ramped to avoid clicks. |
| `setEq(i, dB)` / `setEqAll(gains)` | Band gain in decibels. |
| `enableMic()` / `disableMic()` | Visualize live input. Output is muted while the mic is active. |
| `micActive` | Whether the microphone is currently routed in. |
| `dispose()` | Stop the mic and close the context. |

Bands are exported as `EQ_BANDS` (`60, 250, 1000, 4000, 12000` Hz) with ready-made
`EQ_PRESETS` (`Flat`, `Bass`, `Vocal`, `Treble`, `Lounge`).

## Visualizer

```ts
viz.draw(ctx, width, height, mode, hue, frame)
```

`mode` is one of `VISUALIZER_MODES`; `hue` is a CSS hue in degrees, so the whole palette
shifts from a single number. `frame` is `{ freq, wave, level, active }` — feed it stand-in
data when nothing is playing and the canvas keeps breathing.

Pass CSS pixel `width`/`height` and scale the context by `devicePixelRatio` yourself:

```ts
const dpr = Math.min(devicePixelRatio, 2)
canvas.width = Math.round(cssWidth * dpr)
canvas.height = Math.round(cssHeight * dpr)
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
```

## License

MIT
