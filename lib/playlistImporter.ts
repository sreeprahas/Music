import type { Playlist, Track } from '@/types';
import { getThumbnailUrl } from './ytmusicFormat';
import { getAllYouTubePlaylistTracks } from './youtube/playlists';
import { matchSpotifyTrack } from './matching/spotify-youtube';
import { getPlaylistGraphQl, getPlaylistTracksGraphQl } from './spotify/graphqlApi';
import { normalizePlaylist, normalizePlaylistItems } from './spotify/normalize';

export interface PlaylistPreviewTrack {
  title: string;
  artist: string;
  duration?: number;
  videoId?: string;
  thumbnailUrl?: string;
  spotifyId?: string;
}

export async function previewPlaylistUrl(rawUrl: string): Promise<{ title: string; coverUrl?: string; tracks: PlaylistPreviewTrack[]; isPublic: boolean }> {
  const url = new URL(rawUrl);
  if (isSpotifyUrl(url)) {
    const id = extractSpotifyPlaylistId(url.toString());
    if (!id) throw new Error('Could not extract a Spotify playlist id from that URL');
    const [spotifyPlaylist, items] = await Promise.all([getPlaylistGraphQl(id), getPlaylistTracksGraphQl(id)]);
    const normalized = normalizePlaylist(spotifyPlaylist, rawUrl);
    const tracks = normalizePlaylistItems(items, normalized.id);
    return { title: normalized.title, coverUrl: normalized.thumbnailUrl || undefined, isPublic: spotifyPlaylist.public !== false, tracks: tracks.map(toPreview) };
  }
  if (!isYouTubeUrl(url)) throw new Error('Only public YouTube and Spotify playlist URLs are supported');
  const id = extractYouTubePlaylistId(url);
  if (!id) throw new Error('Could not extract a YouTube playlist id from that URL');
  const imported = await getAllYouTubePlaylistTracks(id);
  return { title: imported.title || 'YouTube playlist', coverUrl: imported.items[0]?.videoId ? getThumbnailUrl(imported.items[0].videoId, imported.items[0].title) : undefined, isPublic: true, tracks: imported.items.map((item) => ({ title: item.title, artist: item.channel || 'Unknown artist', duration: item.duration, videoId: item.videoId, thumbnailUrl: getThumbnailUrl(item.videoId, item.title) })) };
}

export async function importPlaylistUrl(rawUrl: string): Promise<{ playlist: Playlist; tracks: Track[] }> {
  const url = new URL(rawUrl);
  if (isSpotifyUrl(url)) return importSpotify(rawUrl);
  if (!isYouTubeUrl(url)) throw new Error('Only public YouTube and Spotify playlist URLs are supported');
  const id = extractYouTubePlaylistId(url);
  if (!id) throw new Error('Could not extract a YouTube playlist id from that URL');
  const imported = await getAllYouTubePlaylistTracks(id);
  if (!imported.items.length) throw new Error('No playable tracks were found in that playlist URL');
  const now = new Date().toISOString();
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tracks = imported.items.map((item, position) => ({ videoId: item.videoId, playlistItemId: item.playlistItemId, title: item.title, artist: item.channel || 'Unknown artist', thumbnailUrl: getThumbnailUrl(item.videoId, item.title), duration: item.duration, position, playlistId: localId, source: 'youtube' as const, sourceTrackId: item.videoId, dateAdded: now }));
  return { playlist: { id: localId, title: imported.title || 'Imported playlist', description: 'Imported from YouTube', thumbnailUrl: tracks[0]?.thumbnailUrl || '', trackCount: tracks.length, importedAt: now, createdAt: now, sourceUrl: rawUrl, source: 'youtube', sourcePlaylistId: id, sourceRevision: revision(tracks) }, tracks };
}

async function importSpotify(rawUrl: string): Promise<{ playlist: Playlist; tracks: Track[] }> {
  const id = extractSpotifyPlaylistId(rawUrl);
  if (!id) throw new Error('Could not extract a Spotify playlist id from that URL');
  const [spotifyPlaylist, items] = await Promise.all([getPlaylistGraphQl(id), getPlaylistTracksGraphQl(id)]);
  const playlist = normalizePlaylist(spotifyPlaylist, rawUrl);
  const spotifyTracks = normalizePlaylistItems(items, playlist.id);
  const resolved: Track[] = [];
  for (const track of spotifyTracks) {
    const match = await matchSpotifyTrack(track);
    if (!match.videoId) continue;
    resolved.push({ ...track, videoId: match.videoId, source: 'spotify', sourceTrackId: track.spotifyId, thumbnailUrl: getThumbnailUrl(match.videoId, track.title) });
  }
  if (!resolved.length) throw new Error('Spotify tracks were found, but none could be matched on YouTube Music.');
  const now = new Date().toISOString();
  return { playlist: { ...playlist, source: 'spotify', sourcePlaylistId: id, sourceRevision: spotifyPlaylist.snapshot_id || revision(resolved), thumbnailUrl: resolved[0].thumbnailUrl, trackCount: resolved.length }, tracks: resolved.map((track, position) => ({ ...track, position, dateAdded: now })) };
}

function toPreview(track: Track): PlaylistPreviewTrack { return { title: track.title, artist: track.artist, duration: track.duration, spotifyId: track.spotifyId, thumbnailUrl: track.thumbnailUrl }; }
function revision(tracks: Track[]): string { return tracks.map((track) => track.sourceTrackId || track.spotifyId || track.videoId).join('|'); }
function isYouTubeUrl(url: URL): boolean { return url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com') || url.hostname === 'youtu.be'; }
function isSpotifyUrl(url: URL): boolean { return url.hostname === 'open.spotify.com' || url.hostname.endsWith('.spotify.com'); }
function extractSpotifyPlaylistId(url: string): string | null { return url.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/)?.[1] || null; }
function extractYouTubePlaylistId(url: URL): string | null { return url.searchParams.get('list') || null; }
