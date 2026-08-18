# neiro-cli

Play a folder of music in your browser, with a live spectrum, a five-band EQ and four
visualizer modes. Files are streamed straight off your disk to your own browser —
nothing is copied, uploaded or phoned home. **Zero dependencies.**

```bash
npx neiro-cli ~/Music
```

Or install it once:

```bash
npm i -g neiro-cli
neiro ~/Music
```

## Usage

```
neiro [folder] [options]

  -p, --port <n>    Port to listen on         (default: 4173)
      --host <h>    Host to bind              (default: 127.0.0.1)
      --depth <n>   How deep to scan folders  (default: 8)
      --no-open     Do not open a browser
  -h, --help        Show this help
  -v, --version     Show the version
```

With no folder it plays the current directory.

```bash
neiro                     # the current folder
neiro ~/Music -p 8080     # a specific port
neiro ~/Music --no-open   # print the URL, open it yourself
```

## What it does

1. Walks the folder for `mp3`, `wav`, `flac`, `ogg`, `oga`, `m4a`, `mp4`, `aac`,
   `opus`, `weba`, `webm`, `aif` and `aiff`, skipping dotfiles, `node_modules` and
   friends. Results are sorted naturally, so numbered album tracks stay in order.
2. Serves the Neiro player on localhost and exposes the list at `/api/tracks`.
3. Streams each file with HTTP range support, so seeking is instant and a long
   track never has to download in full first.

Tracks are addressed by index rather than by path, so a request can't reach outside
the folder you pointed at. The server binds to `127.0.0.1` unless you say otherwise.

## Keyboard

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

## See also

- [`neiro-visualizer`](https://www.npmjs.com/package/neiro-visualizer) — the audio
  engine and canvas renderer as a standalone, framework-agnostic ES module.

## License

MIT
