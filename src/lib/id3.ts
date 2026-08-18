/**
 * Minimal ID3v2 (2.2 / 2.3 / 2.4) tag reader — no dependencies.
 * Pulls title / artist / album plus the embedded cover art (APIC / PIC).
 * Anything malformed simply yields an empty result; playback never depends on it.
 */

export type AudioTags = {
  title?: string
  artist?: string
  album?: string
  artwork?: Blob
}

const TEXT_FRAMES: Record<string, keyof AudioTags> = {
  TIT2: 'title',
  TPE1: 'artist',
  TALB: 'album',
  TT2: 'title',
  TP1: 'artist',
  TAL: 'album',
}

function decode(bytes: Uint8Array, encoding: number): string {
  const labels = ['latin1', 'utf-16', 'utf-16be', 'utf-8']
  const label = labels[encoding] ?? 'latin1'
  try {
    return new TextDecoder(label).decode(bytes).replace(/\0+$/, '').trim()
  } catch {
    return new TextDecoder('latin1').decode(bytes).replace(/\0+$/, '').trim()
  }
}

function syncSafe(view: DataView, offset: number): number {
  return (
    (view.getUint8(offset) << 21) |
    (view.getUint8(offset + 1) << 14) |
    (view.getUint8(offset + 2) << 7) |
    view.getUint8(offset + 3)
  )
}

/** Index of the string terminator for the given text encoding, searching from `start`. */
function terminatorAt(bytes: Uint8Array, start: number, encoding: number): number {
  const wide = encoding === 1 || encoding === 2
  for (let i = start; i < bytes.length - (wide ? 1 : 0); i += wide ? 2 : 1) {
    if (bytes[i] === 0 && (!wide || bytes[i + 1] === 0)) return i
  }
  return bytes.length
}

function parsePicture(body: Uint8Array<ArrayBuffer>, isV22: boolean): Blob | undefined {
  const encoding = body[0]
  let cursor = 1
  let mime = 'image/jpeg'

  if (isV22) {
    // v2.2 uses a fixed 3-character format identifier ("JPG" / "PNG").
    const format = decode(body.subarray(1, 4), 0).toUpperCase()
    mime = format === 'PNG' ? 'image/png' : 'image/jpeg'
    cursor = 4
  } else {
    const end = terminatorAt(body, cursor, 0)
    mime = decode(body.subarray(cursor, end), 0) || mime
    cursor = end + 1
  }

  cursor += 1 // picture type byte
  cursor = terminatorAt(body, cursor, encoding) + (encoding === 1 || encoding === 2 ? 2 : 1)
  if (cursor >= body.length) return undefined
  return new Blob([body.subarray(cursor)], { type: mime })
}

export async function readTags(file: File): Promise<AudioTags> {
  const tags: AudioTags = {}
  try {
    // The tag lives at the head of the file; 4 MB is plenty for text + cover art.
    const head = await file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer()
    const bytes = new Uint8Array(head)
    const view = new DataView(head)
    if (bytes.length < 10) return tags
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return tags // "ID3"

    const major = bytes[3]
    const flags = bytes[4]
    const tagSize = syncSafe(view, 6)
    let cursor = 10

    if (major === 4 && (flags & 0x40) !== 0) cursor += syncSafe(view, cursor) // extended header
    const end = Math.min(10 + tagSize, bytes.length)
    const idLength = major === 2 ? 3 : 4
    const headerLength = major === 2 ? 6 : 10

    while (cursor + headerLength <= end) {
      const id = decode(bytes.subarray(cursor, cursor + idLength), 0)
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break // padding or garbage — stop here

      let size: number
      if (major === 2) {
        size = (bytes[cursor + 3] << 16) | (bytes[cursor + 4] << 8) | bytes[cursor + 5]
      } else if (major === 4) {
        size = syncSafe(view, cursor + 4)
      } else {
        size = view.getUint32(cursor + 4)
      }
      if (size <= 0 || cursor + headerLength + size > end) break

      const body = bytes.subarray(cursor + headerLength, cursor + headerLength + size)
      const field = TEXT_FRAMES[id]
      if (field && field !== 'artwork') {
        const value = decode(body.subarray(1), body[0])
        if (value) tags[field] = value
      } else if (id === 'APIC' || id === 'PIC') {
        const picture = parsePicture(body, id === 'PIC')
        if (picture && picture.size > 0) tags.artwork = picture
      }
      cursor += headerLength + size
    }
  } catch {
    /* unreadable tag — fall back to the file name */
  }
  return tags
}
