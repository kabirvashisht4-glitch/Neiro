#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNeiroServer } from '../lib/server.js'
import { scan } from '../lib/scan.js'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = createRequire(import.meta.url)('../package.json')

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', bold: '\x1b[1m', amber: '\x1b[38;5;214m', red: '\x1b[31m', off: '\x1b[0m' }
  : { dim: '', bold: '', amber: '', red: '', off: '' }

const HELP = `
${C.bold}neiro${C.off} — play a folder of music in your browser, with a live spectrum.

${C.bold}USAGE${C.off}
  neiro [folder] [options]

${C.bold}OPTIONS${C.off}
  -p, --port <n>    Port to listen on            ${C.dim}(default: 4173)${C.off}
      --host <h>    Host to bind                 ${C.dim}(default: 127.0.0.1)${C.off}
      --depth <n>   How deep to scan folders     ${C.dim}(default: 8)${C.off}
      --no-open     Do not open a browser
  -h, --help        Show this help
  -v, --version     Show the version

${C.bold}EXAMPLES${C.off}
  neiro                     ${C.dim}# play the current folder${C.off}
  neiro ~/Music             ${C.dim}# play a music library${C.off}
  neiro ~/Music -p 8080     ${C.dim}# on a specific port${C.off}

Files are streamed from disk to your own browser. Nothing is copied or uploaded.
`

function parseArgs(argv) {
  const opts = { dir: null, port: 4173, host: '127.0.0.1', depth: 8, open: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') return { help: true }
    if (a === '-v' || a === '--version') return { version: true }
    if (a === '--no-open') opts.open = false
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

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) return void process.stdout.write(HELP)
  if (opts.version) return void console.log(pkg.version)
  if (opts.error) {
    console.error(`${C.red}${opts.error}${C.off}\nRun ${C.bold}neiro --help${C.off} for usage.`)
    process.exitCode = 1
    return
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

  const server = createNeiroServer({ tracks, uiDir, root })

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
    `  ${C.dim}url${C.off}     ${C.amber}${url}${C.off}\n\n` +
    `  ${C.dim}Streaming from disk — nothing is uploaded. Ctrl+C to stop.${C.off}\n\n`,
  )

  if (opts.open) openBrowser(url)

  const shutdown = () => {
    server.close(() => process.exit(0))
    // Don't let a half-open audio stream hold the process hostage.
    setTimeout(() => process.exit(0), 500).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
