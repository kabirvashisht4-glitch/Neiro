import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'

export const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.ogg', '.oga', '.m4a',
  '.mp4', '.aac', '.opus', '.weba', '.webm', '.aif', '.aiff',
])

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.cache', '.Trash'])

/** "03 - Some Song.mp3" -> "Some Song" */
export function prettyName(fileName) {
  return basename(fileName, extname(fileName))
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/_+/g, ' ')
    .trim()
}

/**
 * Walk `root` for playable audio. Returns entries sorted by relative path so a
 * numbered album stays in album order.
 *
 * Symlinked directories are not followed — a loop would otherwise hang the scan.
 */
export async function scan(root, { maxDepth = 8 } = {}) {
  const base = resolve(root)
  const found = []

  async function walk(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable directory — skip rather than abort the whole scan
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(full, depth + 1)
      } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        found.push(full)
      }
    }
  }

  const info = await stat(base)
  if (info.isFile()) {
    found.push(base)
  } else {
    await walk(base, 0)
  }

  found.sort((a, b) => relative(base, a).localeCompare(relative(base, b), undefined, { numeric: true }))

  return Promise.all(
    found.map(async (path, i) => {
      const s = await stat(path).catch(() => null)
      return {
        id: String(i),
        path,
        fileName: basename(path),
        title: prettyName(path),
        rel: relative(base, path) || basename(path),
        size: s ? s.size : 0,
      }
    }),
  )
}
