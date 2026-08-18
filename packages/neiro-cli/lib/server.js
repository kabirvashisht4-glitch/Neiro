import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.weba': 'audio/webm',
  '.webm': 'audio/webm',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
}

const mime = (p) => MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'

/**
 * Serve one file, honouring a single Range request so the player can seek
 * without downloading the whole track first.
 */
async function sendFile(req, res, path) {
  let info
  try {
    info = await stat(path)
    if (!info.isFile()) throw new Error('not a file')
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not found')
    return
  }

  const type = mime(path)
  const range = req.headers.range

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m) {
      let start = m[1] === '' ? null : Number(m[1])
      let end = m[2] === '' ? null : Number(m[2])

      if (start === null) {
        // suffix form: "bytes=-500" means the last 500 bytes
        const len = end ?? 0
        start = Math.max(0, info.size - len)
        end = info.size - 1
      } else {
        end = end === null ? info.size - 1 : Math.min(end, info.size - 1)
      }

      if (start > end || start >= info.size) {
        res.writeHead(416, { 'content-range': `bytes */${info.size}` })
        res.end()
        return
      }

      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${info.size}`,
        'accept-ranges': 'bytes',
      })
      if (req.method === 'HEAD') return res.end()
      createReadStream(path, { start, end }).pipe(res)
      return
    }
  }

  res.writeHead(200, {
    'content-type': type,
    'content-length': info.size,
    'accept-ranges': 'bytes',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(path).pipe(res)
}

/** Read a JSON body, capped so a stray request can't exhaust memory. */
function readJson(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function json(res, code, body) {
  const payload = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/**
 * @param {object} options
 * @param {Array}  options.tracks  from scan()
 * @param {string} options.uiDir   directory holding the built player
 * @param {string} options.root    the folder that was scanned (shown in the UI)
 * @param {import('./store.js').Store} options.store  persisted playlists and stats
 */
export function createNeiroServer({ tracks, uiDir, root, store }) {
  // Tracks are addressed by a stable id, never by a client-supplied path, so
  // there is no traversal surface on the audio route.
  const byId = new Map(tracks.map((t) => [t.id, t]))

  return createServer(async (req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      res.writeHead(400)
      res.end('Bad request')
      return
    }

    if (pathname === '/api/tracks') {
      json(res, 200, {
        root,
        tracks: tracks.map((t) => ({
          id: t.id,
          url: `/audio/${t.id}`,
          fileName: t.fileName,
          title: t.title,
          rel: t.rel,
          size: t.size,
          plays: store?.state.stats[t.id]?.plays ?? 0,
        })),
        playlists: store?.listPlaylists() ?? [],
        resume: store?.state.resume ?? null,
      })
      return
    }

    if (store) {
      // ── playlists ──────────────────────────────────────────────
      if (pathname === '/api/playlists') {
        if (req.method === 'GET') return json(res, 200, { playlists: store.listPlaylists() })
        if (req.method === 'POST') {
          let body
          try {
            body = await readJson(req)
          } catch (err) {
            return json(res, 400, { error: err.message })
          }
          return json(res, 201, { playlist: store.createPlaylist(body.name, body.trackIds ?? []) })
        }
        return json(res, 405, { error: 'Use GET or POST' })
      }

      const playlistMatch = /^\/api\/playlists\/([\w-]+)(\/tracks)?$/.exec(pathname)
      if (playlistMatch) {
        const [, id, tracksSuffix] = playlistMatch
        let body = {}
        if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
          try {
            body = await readJson(req)
          } catch (err) {
            return json(res, 400, { error: err.message })
          }
        }

        if (tracksSuffix) {
          if (req.method === 'POST') {
            const updated = store.addToPlaylist(id, body.trackIds ?? [])
            return updated
              ? json(res, 200, { playlist: updated })
              : json(res, 404, { error: 'No such playlist' })
          }
          if (req.method === 'DELETE') {
            const trackId = new URL(req.url, 'http://localhost').searchParams.get('trackId')
            const updated = store.removeFromPlaylist(id, trackId)
            return updated
              ? json(res, 200, { playlist: updated })
              : json(res, 404, { error: 'No such playlist' })
          }
          return json(res, 405, { error: 'Use POST or DELETE' })
        }

        if (req.method === 'PATCH' || req.method === 'PUT') {
          const updated = store.updatePlaylist(id, body)
          return updated
            ? json(res, 200, { playlist: updated })
            : json(res, 404, { error: 'No such playlist' })
        }
        if (req.method === 'DELETE') {
          return store.deletePlaylist(id)
            ? json(res, 200, { ok: true })
            : json(res, 404, { error: 'No such playlist' })
        }
        return json(res, 405, { error: 'Use PATCH or DELETE' })
      }

      // ── playback state ─────────────────────────────────────────
      if (pathname === '/api/state' && req.method === 'PUT') {
        let body
        try {
          body = await readJson(req)
        } catch (err) {
          return json(res, 400, { error: err.message })
        }
        return json(res, 200, { resume: store.setResume(body.trackId ?? null, body.position) })
      }

      const playedMatch = /^\/api\/tracks\/([\w-]+)\/played$/.exec(pathname)
      if (playedMatch && req.method === 'POST') {
        return json(res, 200, { stats: store.markPlayed(playedMatch[1]) })
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }

    if (pathname.startsWith('/audio/')) {
      const track = byId.get(pathname.slice('/audio/'.length))
      if (!track) {
        json(res, 404, { error: 'No such track' })
        return
      }
      await sendFile(req, res, track.path)
      return
    }

    // Static player. Unknown paths fall back to index.html so the app owns routing.
    const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
    const candidate = rel === '' ? 'index.html' : rel
    const full = join(uiDir, candidate)

    if (!full.startsWith(uiDir)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    const exists = await stat(full).then((s) => s.isFile()).catch(() => false)
    await sendFile(req, res, exists ? full : join(uiDir, 'index.html'))
  })
}
