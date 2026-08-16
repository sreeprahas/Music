import type { Playlist, Track, UserProfile } from '@/types';
import { oauthConfig, tokenFromSession, ytmusicCall } from './ytmusicBridge';

export function cleanArtistName(artist?: string): string { return (artist || '').replace(/\s*-\s*Topic$/i, '').replace(/\s+Topic$/i, '').trim(); }
type SessionToken = { accessToken: string; refreshToken: string; expiresAt: number };
async function call<T>(session: SessionToken, request: Record<string, unknown>): Promise<T> { return ytmusicCall<T>({ ...request, oauth: oauthConfig(), token: tokenFromSession(session) }); }

export async function getUserProfile(accessToken: string): Promise<UserProfile> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google profile request failed (${response.status})`);
  const data = await response.json(); return { name: data.name || '', email: data.email || '', picture: data.picture || '' };
}
export async function getPlaylists(session: SessionToken): Promise<Playlist[]> {
  const r = await call<{ playlists: Playlist[] }>(session, { action: 'playlists' });
  return r.playlists.filter((p) => p.id !== 'LL' && p.id !== 'LM');
}

export async function getPlaylistTracks(session: SessionToken, playlistId: string, maxTracks = 0): Promise<Track[]> {
  const r = await call<{ tracks: Track[] }>(session, { action: 'playlist', playlist_id: playlistId });
  const tracks = r.tracks;
  return (maxTracks > 0 ? tracks.slice(0, maxTracks) : tracks).map((t, i) => ({ ...t, artist: cleanArtistName(t.artist), position: i }));
}
export async function createPlaylist(session: SessionToken, title: string, description = ''): Promise<string> { const r = await call<{ playlist_id: string }>(session, { action: 'create', title, description }); return r.playlist_id; }
export async function editPlaylist(session: SessionToken, playlistId: string, data: { title?: string; description?: string }) { return call(session, { action: 'edit', playlist_id: playlistId, ...data }); }
export async function deletePlaylist(session: SessionToken, playlistId: string) { return call(session, { action: 'delete', playlist_id: playlistId }); }
export async function addPlaylistItem(session: SessionToken, playlistId: string, videoId: string) { return call(session, { action: 'add', playlist_id: playlistId, video_id: videoId }); }
export async function removePlaylistItem(session: SessionToken, playlistId: string, videoId?: string, playlistItemId?: string) { return call(session, { action: 'remove', playlist_id: playlistId, video_id: videoId, playlist_item_id: playlistItemId }); }
export async function reorderPlaylist(session: SessionToken, playlistId: string, videoIds: string[]) { return call(session, { action: 'reorder', playlist_id: playlistId, video_ids: videoIds }); }
export function formatDuration(seconds: number): string { if (!seconds) return ''; const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60; return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }
