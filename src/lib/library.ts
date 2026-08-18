import type { Track } from '../types'
import { prettyName } from './format'

export type Playlist = {
  id: string
  name: string
  trackIds: string[]
  createdAt: string
  updatedAt: string
}

export type Resume = { trackId: string; position: number } | null

export type LibrarySnapshot = {
  tracks: Track[]
  playlists: Playlist[]
  resume: Resume
}

type WireTrack = {
  id: string
  url: string
  fileName: string
  title: string
  size: number
  plays: number
}

/**
 * The server hands back ids that are stable across rescans; the app prefixes
 * them so a served track can never collide with a dropped file's random id.
 */
export const SERVER_PREFIX = 'srv-'

export const isServerTrack = (id: string) => id.startsWith(SERVER_PREFIX)
const toAppId = (id: string) => `${SERVER_PREFIX}${id}`
const toServerId = (id: string) => id.slice(SERVER_PREFIX.length)

function toTrack(wire: WireTrack): Track {
  return {
    id: toAppId(wire.id),
    url: wire.url,
    fileName: wire.fileName,
    title: wire.title || prettyName(wire.fileName),
    artist: 'Unknown artist',
    album: '',
    artwork: null,
    size: wire.size,
    duration: null,
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

/**
 * Read the library the CLI is serving. Anywhere else this simply fails and the
 * app stays drag-and-drop only.
 */
export async function loadLibrary(): Promise<LibrarySnapshot | null> {
  const data = await send<{ tracks?: WireTrack[]; playlists?: Playlist[]; resume?: Resume }>(
    '/api/tracks',
  )
  if (!data || !Array.isArray(data.tracks) || data.tracks.length === 0) return null
  return {
    tracks: data.tracks.map(toTrack),
    playlists: data.playlists ?? [],
    resume: data.resume
      ? { trackId: toAppId(data.resume.trackId), position: data.resume.position }
      : null,
  }
}

export async function createPlaylist(name: string, trackIds: string[] = []) {
  const data = await send<{ playlist: Playlist }>('/api/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, trackIds: trackIds.map(toServerId) }),
  })
  return data?.playlist ?? null
}

export async function renamePlaylist(id: string, name: string) {
  const data = await send<{ playlist: Playlist }>(`/api/playlists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  return data?.playlist ?? null
}

export async function deletePlaylist(id: string) {
  return (await send<{ ok: true }>(`/api/playlists/${id}`, { method: 'DELETE' })) !== null
}

export async function addToPlaylist(id: string, trackIds: string[]) {
  const data = await send<{ playlist: Playlist }>(`/api/playlists/${id}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ trackIds: trackIds.map(toServerId) }),
  })
  return data?.playlist ?? null
}

export async function removeFromPlaylist(id: string, trackId: string) {
  const data = await send<{ playlist: Playlist }>(
    `/api/playlists/${id}/tracks?trackId=${encodeURIComponent(toServerId(trackId))}`,
    { method: 'DELETE' },
  )
  return data?.playlist ?? null
}

export function markPlayed(trackId: string): void {
  if (!isServerTrack(trackId)) return
  void send(`/api/tracks/${toServerId(trackId)}/played`, { method: 'POST' })
}

export function saveResume(trackId: string | null, position: number): void {
  if (trackId !== null && !isServerTrack(trackId)) return
  void send('/api/state', {
    method: 'PUT',
    body: JSON.stringify({
      trackId: trackId === null ? null : toServerId(trackId),
      position,
    }),
  })
}

/** Playlist entries are server ids; the queue holds prefixed app ids. */
export const playlistTrackIds = (playlist: Playlist) => playlist.trackIds.map(toAppId)
