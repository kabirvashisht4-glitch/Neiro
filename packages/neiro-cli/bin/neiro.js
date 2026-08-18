#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { openSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNeiroServer } from '../lib/server.js'
import { scan } from '../lib/scan.js'
import { Store, neiroHome } from '../lib/store.js'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = createRequire(import.meta.url)('../package.json')

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', bold: '\x1b[1m', amber: '\x1b[38;5;214m', red: '\x1b[31m', off: '\x1b[0m' }
  : { dim: '', bold: '', amber: '', red: '', off: '' }

const HELP = `
${C.bold}neiro${C.off} — play a folder of music in your browser, with a live spectrum.

${C.bold}USAGE${C.off}
  neiro [folder] [options]
  neiro stop
  neiro status

${C.bold}OPTIONS${C.off}
  -p, --port <n>    Port to listen on            ${C.dim}(default: 4173)${C.off}
      --host <h>    Host to bind                 ${C.dim}(default: 127.0.0.1)${C.off}
      --depth <n>   How deep to scan folders     ${C.dim}(default: 8)${C.off}
  -d, --daemon      Keep running after you close the terminal
      --no-open     Do not open a browser
  -h, --help        Show this help
  -v, --version     Show the version

${C.bold}EXAMPLES${C.off}
  neiro                     ${C.dim}# play the current folder${C.off}
  neiro ~/Music             ${C.dim}# play a music library${C.off}
  neiro ~/Music -p 8080     ${C.dim}# on a specific port${C.off}
  neiro ~/Music --daemon    ${C.dim}# leave it running in the background${C.off}
  neiro stop                ${C.dim}# stop the background server${C.off}

Playlists, play counts and your resume position are saved to
${C.dim}~/.neiro/library.json${C.off}. Audio is streamed from disk — never copied or uploaded.
`

function parseArgs(argv) {
  const opts = { dir: null, port: 4173, host: '127.0.0.1', depth: 8, open: true, daemon: false }
  if (argv[0] === 'stop') return { command: 'stop' }
  if (argv[0] === 'status') return { command: 'status' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') return { help: true }
    if (a === '-v' || a === '--version') return { version: true }
    if (a === '-d' || a === '--daemon') opts.daemon = true
    else if (a === '--no-open') opts.open = false
    else if (a === '-p' || a === '--port') opts.port = Number(argv[++i])
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7))
    else if (a === '--host') opts.host = argv[++i]
    else if (a.startsWith('--host=')) opts.host = a.slice(7)
    else if (a === '--depth') opts.depth = Number(argv[++i])
    else if (a.startsWith('--depth=')) opts.depth = Number(a.slice(8))
    else if (a.startsWith('-')) return { error: `Unknown option: ${a}` }
    else if (opts.dir === null) opts.dir = a
    else return { error: `Unexpected argument: ${a}` }
  }
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    return { error: `Invalid port: ${opts.port}` }
  }
  return opts
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
}

/** Prefer the copy bundled into the published package; fall back to a repo build. */
async function findUi() {
  const candidates = [
    resolve(here, '../ui'),
    resolve(here, '../../../dist'),
  ]
  for (const dir of candidates) {
    const ok = await stat(resolve(dir, 'index.html')).then((s) => s.isFile()).catch(() => false)
    if (ok) return dir
  }
  return null
}

function listen(server, port, host) {
  return new Promise((res, rej) => {
    server.once('error', rej)
    server.listen(port, host, () => res(server.address()))
  })
}

const fmtSize = (n) =>
  n >= 1 << 30 ? (n / (1 << 30)).toFixed(1) + ' GB'
  : n >= 1 << 20 ? (n / (1 << 20)).toFixed(1) + ' MB'
  : Math.max(1, Math.round(n / 1024)) + ' KB'

const pidFile = () => join(neiroHome(), 'daemon.json')
const logFile = () => join(neiroHome(), 'daemon.log')

async function readDaemon() {
  try {
    const info = JSON.parse(await readFile(pidFile(), 'utf8'))
    // A pid alone proves nothing — signal 0 checks the process is really alive.
    process.kill(info.pid, 0)
    return info
  } catch {
    return null
  }
}

/** Re-exec ourselves detached, so closing the terminal cannot take the server down. */
async function startDaemon(argv) {
  const running = await readDaemon()
  if (running) {
    console.error(
      `${C.red}Neiro is already running${C.off} (pid ${running.pid}) at ${C.amber}${running.url}${C.off}\n` +
      `Run ${C.bold}neiro stop${C.off} first.`,
    )
    process.exitCode = 1
    return
  }

  await mkdir(neiroHome(), { recursive: true })
  const out = openSync(logFile(), 'a')
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), ...argv.filter((a) => a !== '-d' && a !== '--daemon'), '--no-open'],
    { detached: true, stdio: ['ignore', out, out], env: { ...process.env, NEIRO_DAEMON: '1' } },
  )
  child.unref()

  // Wait for the child to advertise itself, so we can report a real URL.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100))
    const info = await readDaemon()
    if (info && info.pid === child.pid) {
      process.stdout.write(
        `\n  ${C.bold}NEIRO${C.amber}.${C.off} running in the background\n\n` +
        `  ${C.dim}folder${C.off}  ${info.root}\n` +
        `  ${C.dim}url${C.off}     ${C.amber}${info.url}${C.off}\n` +
        `  ${C.dim}pid${C.off}     ${info.pid}\n\n` +
        `  ${C.dim}Closing this terminal will not stop it. Run ${C.off}${C.bold}neiro stop${C.off}${C.dim} when you are done.${C.off}\n\n`,
      )
      openBrowser(info.url)
      return
    }
  }

  console.error(`${C.red}The background server did not start.${C.off} See ${logFile()}`)
  process.exitCode = 1
}

async function stopDaemon() {
  const info = await readDaemon()
  if (!info) {
    console.log('Neiro is not running.')
    await rm(pidFile(), { force: true })
    return
  }
  process.kill(info.pid, 'SIGTERM')
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50))
    try {
      process.kill(info.pid, 0)
    } catch {
      break // gone
    }
  }
  await rm(pidFile(), { force: true })
  console.log(`Stopped Neiro (pid ${info.pid}).`)
}

async function daemonStatus() {
  const info = await readDaemon()
  if (!info) {
    console.log('Neiro is not running.')
    process.exitCode = 1
    return
  }
  process.stdout.write(
    `  ${C.bold}running${C.off}\n` +
    `  ${C.dim}folder${C.off}  ${info.root}\n` +
    `  ${C.dim}url${C.off}     ${C.amber}${info.url}${C.off}\n` +
    `  ${C.dim}pid${C.off}     ${info.pid}\n`,
  )
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) return void process.stdout.write(HELP)
  if (opts.version) return void console.log(pkg.version)
  if (opts.command === 'stop') return stopDaemon()
  if (opts.command === 'status') return daemonStatus()
  if (opts.error) {
    console.error(`${C.red}${opts.error}${C.off}\nRun ${C.bold}neiro --help${C.off} for usage.`)
    process.exitCode = 1
    return
  }

  if (opts.daemon && !process.env.NEIRO_DAEMON) {
    return startDaemon(process.argv.slice(2))
  }

  const root = resolve(opts.dir ?? process.cwd())
  const exists = await stat(root).catch(() => null)
  if (!exists) {
    console.error(`${C.red}No such folder:${C.off} ${root}`)
    process.exitCode = 1
    return
  }

  const uiDir = await findUi()
  if (!uiDir) {
    console.error(
      `${C.red}The player UI is missing.${C.off}\n` +
      `Expected a built app next to the CLI. From the repo root, run:\n\n  npm run build\n`,
    )
    process.exitCode = 1
    return
  }

  process.stdout.write(`${C.dim}Scanning ${root}…${C.off}\n`)
  const tracks = await scan(root, { maxDepth: opts.depth })

  if (tracks.length === 0) {
    console.error(
      `${C.red}No audio found in${C.off} ${root}\n` +
      `${C.dim}Looked for mp3, wav, flac, ogg, m4a, opus and friends, ${opts.depth} levels deep.${C.off}`,
    )
    process.exitCode = 1
    return
  }

  const store = await new Store(root).load()
  store.prune(tracks.map((t) => t.id))

  const server = createNeiroServer({ tracks, uiDir, root, store })

  let address
  try {
    address = await listen(server, opts.port, opts.host)
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`${C.red}Port ${opts.port} is already in use.${C.off} Try ${C.bold}--port ${opts.port + 1}${C.off}.`)
      process.exitCode = 1
      return
    }
    throw err
  }

  const total = tracks.reduce((sum, t) => sum + t.size, 0)
  const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${address.port}`

  process.stdout.write(
    `\n  ${C.bold}NEIRO${C.amber}.${C.off}  ${C.dim}v${pkg.version}${C.off}\n\n` +
    `  ${C.dim}folder${C.off}  ${root}\n` +
    `  ${C.dim}tracks${C.off}  ${tracks.length} · ${fmtSize(total)}\n` +
    `  ${C.dim}saved${C.off}   ${store.listPlaylists().length} playlist(s)\n` +
    `  ${C.dim}url${C.off}     ${C.amber}${url}${C.off}\n\n` +
    `  ${C.dim}Streaming from disk — nothing is uploaded. Ctrl+C to stop.${C.off}\n\n`,
  )

  if (process.env.NEIRO_DAEMON) {
    await mkdir(neiroHome(), { recursive: true })
    await writeFile(pidFile(), JSON.stringify({ pid: process.pid, url, root, port: address.port }))
  }

  if (opts.open) openBrowser(url)

  const shutdown = async () => {
    server.close()
    try {
      await store.flushNow()
      if (process.env.NEIRO_DAEMON) await rm(pidFile(), { force: true })
    } catch { /* best effort — never block the exit */ }
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  // Don't let a half-open audio stream hold the process hostage.
  process.on('SIGHUP', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
