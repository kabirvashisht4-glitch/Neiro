# Neiro

A local-first audio player and visualizer. Drop a file in and it is decoded, equalized
and rendered entirely inside the browser tab — no account, no upload, no server. The
spectrum you see is the signal you hear.

```bash
npm install
npm run dev
```

## What's in here

| Path | What it is |
| --- | --- |
| `src/` | The React 19 + TypeScript player |
| `site/` | The standalone marketing site — one self-contained HTML file, no build step |
| `packages/neiro-visualizer/` | The audio engine and canvas renderer, published to npm |
| `packages/neiro-cli/` | `neiro`, a zero-dependency CLI that plays a folder in your browser |

## The player

Drag audio anywhere onto the page, or use the queue's **Add files**. Supports MP3, WAV,
FLAC, OGG, M4A, Opus and anything else the browser can decode.

- **Four visualizer modes** — bars, wave, radial and orbit, each rendered on canvas at
  device pixel ratio.
- **Five-band equalizer** — shelving and peaking biquads at 60 Hz, 250 Hz, 1 kHz, 4 kHz
  and 12 kHz, with presets.
- **Microphone input** — visualize a live source with the output muted, so nothing
  loops back.
- **ID3 tags** — a dependency-free parser reads title, artist, album and cover art.
- **Media Session** — hardware play buttons and lock-screen controls work.
- **Adjustable hue** — one slider recolors the whole interface and every visualizer.

Settings persist to `localStorage`; audio never does.

### Keyboard

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` `→` | Seek 5 s (hold `⇧` for 30 s) |
| `↑` `↓` | Volume |
| `N` / `P` | Next / previous track |
| `M` | Mute |
| `S` | Shuffle |
| `L` | Cycle repeat |
| `V` | Cycle visualizer mode |
| `F` | Fullscreen the stage |
| `0`–`9` | Jump to 0–90% |
| `?` | Shortcut reference |

## The signal chain

```
<audio> ──► 5× BiquadFilter ──► AnalyserNode ──► GainNode ──► destination
microphone ──────────────────►
```

The analyser sits **after** the equalizer, so the bars react to the filters, and
**before** the output gain, so microphone input can be visualized with the speakers
silent — no feedback loop.

## The CLI

Play any folder of music in your browser:

```bash
npx neiro-cli ~/Music
```

It indexes the folder, serves the player on localhost and streams files straight off
disk with HTTP range support, so seeking is instant. Tracks are addressed by index
rather than path, and the server binds to `127.0.0.1` by default.

See [`packages/neiro-cli`](packages/neiro-cli) for all options.

## The library

The engine is published on its own, framework-agnostic and dependency-free:

```bash
npm i neiro-visualizer
```

```ts
import { AudioEngine, Visualizer } from 'neiro-visualizer'
```

See [`packages/neiro-visualizer`](packages/neiro-visualizer) for the API.

The app consumes this package from source via a Vite alias and a `tsconfig` path, so
there is one implementation and no build-order dependency between them.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Start the player with HMR |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run build:lib` | Build `neiro-visualizer` to its `dist/` for publishing |
| `npm run typecheck` | `tsc --noEmit` across the app and the package |
| `npm run lint` | Oxlint |
| `npm run neiro -- <folder>` | Run the CLI from the repo against a folder |

The marketing site in `site/` is a single static file — open it directly, or serve the
folder with anything.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind v4 · Web Audio API · Canvas 2D.
No runtime dependencies beyond React.

## License

MIT
