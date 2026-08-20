import type { PlaylistSyncState, Track } from '@/types';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';
import { getCachedPlaylists, getCachedTracks, setCachedTracks, upsertLocalPlaylist } from '@/lib/db';
import { getPlaylistGraphQl, getPlaylistTracksGraphQl } from '@/lib/spotify/graphqlApi';
import { normalizePlaylistItems } from '@/lib/spotify/normalize';
import { getAllYouTubePlaylistTracks } from '@/lib/youtube/playlists';
import { canonicalRevision } from './conflicts';

const stateKey = (playlistId: string) => `sync:${playlistId}`;
const READ_ONLY_MESSAGE = 'GraphQL-only mode cannot write playlist mutations without a configured provider mutation contract.';

export function getPlaylistSyncState(playlistId: string): PlaylistSyncState | undefined { return getPersistent<PlaylistSyncState>(stateKey(playlistId)); }

/** Keep local edits queued and visible; never pretend that a provider write succeeded. */
export function enqueuePlaylistOperation(playlist: { id: string; source?: 'local' | 'spotify' | 'youtube'; sourcePlaylistId?: string }, type: PlaylistSyncState['pendingOperations'][number]['type'], payload: Record<string, unknown>): void {
  if (!playlist.source || playlist.source === 'local' || !playlist.sourcePlaylistId) return;
  const existing = getPlaylistSyncState(playlist.id) || { playlistId: playlist.id, source: playlist.source, sourcePlaylistId: playlist.sourcePlaylistId, pendingOperations: [], status: 'idle' as const, updatedAt: Date.now() };
  existing.pendingOperations.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, payload, createdAt: Date.now(), attempts: 0 });
  existing.status = 'readonly';
  existing.error = READ_ONLY_MESSAGE;
  existing.updatedAt = Date.now();
  setPersistent(stateKey(playlist.id), existing, 0);
}

export async function syncPlaylist(playlistId: string): Promise<PlaylistSyncState> {
  const playlist = getCachedPlaylists().find((item) => item.id === playlistId);
  if (!playlist || !playlist.source || playlist.source === 'local' || !playlist.sourcePlaylistId) throw new Error('Playlist is not linked to a platform source.');
  const state = getPlaylistSyncState(playlistId) || { playlistId, source: playlist.source, sourcePlaylistId: playlist.sourcePlaylistId, pendingOperations: [], status: 'idle' as const, updatedAt: Date.now() };
  state.status = 'syncing'; state.error = undefined; state.updatedAt = Date.now(); setPersistent(stateKey(playlistId), state, 0);
  try {
    const remote = await readRemote(playlist.source, playlist.sourcePlaylistId);
    state.remoteRevision = remote.revision;
    if (state.pendingOperations.length) {
      state.status = 'readonly';
      state.error = READ_ONLY_MESSAGE;
      state.updatedAt = Date.now();
      setPersistent(stateKey(playlistId), state, 0);
      return state;
    }
    const localTracks = getCachedTracks(playlistId) || [];
    const tracks = preserveResolvedIdentities(remote.tracks, localTracks);
    setCachedTracks(playlistId, tracks);
    upsertLocalPlaylist({ ...playlist, sourceRevision: remote.revision, syncStatus: 'idle', syncError: undefined, lastSyncedAt: new Date().toISOString() });
    state.lastCommonRevision = remote.revision;
    state.status = 'idle'; state.updatedAt = Date.now(); setPersistent(stateKey(playlistId), state, 0);
    return state;
  } catch (error) {
    state.status = 'error'; state.error = error instanceof Error ? error.message : 'Playlist synchronization failed'; state.updatedAt = Date.now(); setPersistent(stateKey(playlistId), state, 0); throw error;
  }
}

async function readRemote(source: 'spotify' | 'youtube', sourcePlaylistId: string): Promise<{ tracks: Track[]; revision: string }> {
  if (source === 'spotify') {
    const [playlist, items] = await Promise.all([getPlaylistGraphQl(sourcePlaylistId, true), getPlaylistTracksGraphQl(sourcePlaylistId, true)]);
    const tracks = normalizePlaylistItems(items, `spotify-${sourcePlaylistId}`);
    return { tracks, revision: playlist.snapshot_id || canonicalRevision(tracks) };
  }
  const result = await getAllYouTubePlaylistTracks(sourcePlaylistId);
  const tracks = result.items.map((item, position) => ({ videoId: item.videoId, playlistItemId: item.playlistItemId, title: item.title, artist: item.channel || 'Unknown artist', duration: item.duration, thumbnailUrl: item.thumbnails?.[0] || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`, position, source: 'youtube' as const, sourceTrackId: item.videoId }));
  return { tracks, revision: canonicalRevision(tracks) };
}

function preserveResolvedIdentities(remote: Track[], local: Track[]): Track[] {
  const localBySource = new Map(local.map((track) => [track.sourceTrackId || track.spotifyId || track.videoId, track]));
  return remote.map((track, position) => {
    const key = track.sourceTrackId || track.spotifyId || track.videoId;
    const previous = localBySource.get(key);
    return previous?.videoId && previous.videoId !== track.videoId ? { ...track, videoId: previous.videoId, youtubeId: previous.youtubeId, thumbnailUrl: previous.thumbnailUrl, position } : { ...track, position };
  });
}
