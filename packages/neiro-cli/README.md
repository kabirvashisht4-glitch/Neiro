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
neiro stop
neiro status

  -p, --port <n>    Port to listen on         (default: 4173)
      --host <h>    Host to bind              (default: 127.0.0.1)
      --depth <n>   How deep to scan folders  (default: 8)
  -d, --daemon      Keep running after you close the terminal
      --no-open     Do not open a browser
  -h, --help        Show this help
  -v, --version     Show the version
```

With no folder it plays the current directory.

```bash
neiro                     # the current folder
neiro ~/Music -p 8080     # a specific port
neiro ~/Music --daemon    # leave it running in the background
neiro stop                # stop the background server
```

## Playlists and resume

Make playlists in the player and they are saved to disk, not to the browser tab.
Play counts and your last position are kept too, so quitting mid-track and coming
back later picks up where you were.

Everything lives in a single readable file:

```
~/.neiro/library.json
```

One entry per folder you have opened, so two libraries never collide. Playlist
entries are keyed by a hash of the file's path inside the library, which means
adding or removing files never renumbers anything — and if you delete a track from
disk, it quietly drops out of any playlist that referenced it.

Set `NEIRO_HOME` to keep that file somewhere else.

## Running in the background

```bash
neiro ~/Music --daemon   # detaches; closing the terminal will not stop it
neiro status             # folder, url and pid
neiro stop               # shut it down
```

The background process is fully detached (reparented to init), and writes its log
to `~/.neiro/daemon.log`. Only one instance runs at a time — starting a second
tells you which one is already up.

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
