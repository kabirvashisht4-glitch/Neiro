import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const VERSION = 1

/** `NEIRO_HOME` exists so tests (and curious users) can point this somewhere safe. */
export function neiroHome() {
  return process.env.NEIRO_HOME || join(homedir(), '.neiro')
}

const libraryFile = () => join(neiroHome(), 'library.json')

/** One library per scanned folder, keyed by path so two folders never collide. */
const libraryKey = (root) => createHash('sha1').update(root).digest('hex').slice(0, 12)

function emptyLibrary(root) {
  return { root, playlists: [], stats: {}, resume: null }
}

async function readAll() {
  try {
    const raw = await readFile(libraryFile(), 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || data.version !== VERSION) {
      return { version: VERSION, libraries: {} }
    }
    return { version: VERSION, libraries: data.libraries ?? {} }
  } catch {
    // Missing or corrupt file: start clean rather than crash the server.
    return { version: VERSION, libraries: {} }
  }
}

/**
 * Persisted playlists, play counts and resume position for one folder.
 *
 * Writes are debounced and atomic (temp file + rename), so a burst of updates
 * costs one write and an interrupted save can never truncate the real file.
 */
export class Store {
  #root
  #key
  #data = null
  #timer = null
  #writing = Promise.resolve()

  constructor(root) {
    this.#root = root
    this.#key = libraryKey(root)
  }

  async load() {
    const all = await readAll()
    this.#data = all.libraries[this.#key] ?? emptyLibrary(this.#root)
    this.#data.root = this.#root
    this.#data.playlists ??= []
    this.#data.stats ??= {}
    return this
  }

  get state() {
    return this.#data
  }

  #save() {
    if (this.#timer) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.#writing = this.#writing.then(() => this.#flush()).catch(() => {})
    }, 250)
    this.#timer.unref?.()
  }

  async #flush() {
    const all = await readAll()
    all.libraries[this.#key] = this.#data
    const target = libraryFile()
    const tmp = `${target}.${process.pid}.tmp`
    await mkdir(dirname(target), { recursive: true })
    await writeFile(tmp, JSON.stringify(all, null, 2))
    await rename(tmp, target)
  }

  /** Write anything still pending — used on shutdown. */
  async flushNow() {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    await this.#writing
    await this.#flush()
  }

  /* ─────────────────────────────────────────────── playlists */

  listPlaylists() {
    return this.#data.playlists
  }

  createPlaylist(name, trackIds = []) {
    const playlist = {
      id: randomUUID().slice(0, 8),
      name: String(name || 'New playlist').slice(0, 120),
      trackIds: [...new Set(trackIds)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.#data.playlists.push(playlist)
    this.#save()
    return playlist
  }

  updatePlaylist(id, patch) {
    const playlist = this.#data.playlists.find((p) => p.id === id)
    if (!playlist) return null
    if (typeof patch.name === 'string') playlist.name = patch.name.slice(0, 120)
    if (Array.isArray(patch.trackIds)) playlist.trackIds = [...new Set(patch.trackIds)]
    playlist.updatedAt = new Date().toISOString()
    this.#save()
    return playlist
  }

  deletePlaylist(id) {
    const before = this.#data.playlists.length
    this.#data.playlists = this.#data.playlists.filter((p) => p.id !== id)
    if (this.#data.playlists.length === before) return false
    this.#save()
    return true
  }

  /** Add without disturbing existing order, and without duplicating. */
  addToPlaylist(id, trackIds) {
    const playlist = this.#data.playlists.find((p) => p.id === id)
    if (!playlist) return null
    const seen = new Set(playlist.trackIds)
    for (const trackId of trackIds) {
      if (!seen.has(trackId)) {
        playlist.trackIds.push(trackId)
        seen.add(trackId)
      }
    }
    playlist.updatedAt = new Date().toISOString()
    this.#save()
    return playlist
  }

  removeFromPlaylist(id, trackId) {
    const playlist = this.#data.playlists.find((p) => p.id === id)
    if (!playlist) return null
    playlist.trackIds = playlist.trackIds.filter((t) => t !== trackId)
    playlist.updatedAt = new Date().toISOString()
    this.#save()
    return playlist
  }

  /* ─────────────────────────────────────────────── stats & resume */

  markPlayed(trackId) {
    const entry = this.#data.stats[trackId] ?? { plays: 0, lastPlayedAt: null }
    entry.plays += 1
    entry.lastPlayedAt = new Date().toISOString()
    this.#data.stats[trackId] = entry
    this.#save()
    return entry
  }

  setResume(trackId, position) {
    this.#data.resume =
      trackId == null ? null : { trackId, position: Math.max(0, Number(position) || 0) }
    this.#save()
    return this.#data.resume
  }

  /** Drop playlist entries and stats whose files are gone. */
  prune(validIds) {
    const valid = new Set(validIds)
    let changed = false
    for (const playlist of this.#data.playlists) {
      const kept = playlist.trackIds.filter((id) => valid.has(id))
      if (kept.length !== playlist.trackIds.length) {
        playlist.trackIds = kept
        changed = true
      }
    }
    for (const id of Object.keys(this.#data.stats)) {
      if (!valid.has(id)) {
        delete this.#data.stats[id]
        changed = true
      }
    }
    if (this.#data.resume && !valid.has(this.#data.resume.trackId)) {
      this.#data.resume = null
      changed = true
    }
    if (changed) this.#save()
    return changed
  }
}
