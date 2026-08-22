/**
 * Playlist synchronization for YouTube and Spotify playlists.
 *
 * For Spotify: compares current Spotify playlist against local SQLite snapshot,
 * reconciles track membership, updates metadata, and reconciles thumbnails.
 *
 * For YouTube: syncs remote playlist revisions.
 */

import type { PlaylistSyncState, Track } from '@/types';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';
import { getLocalPlaylists, getCachedTracks, setCachedTracks, upsertLocalPlaylist } from '@/lib/db';
import { getAllYouTubePlaylistTracks } from '@/lib/youtube/playlists';
import { canonicalRevision } from './conflicts';

const stateKey = (playlistId: string) => `sync:${playlistId}`;

export function getPlaylistSyncState(playlistId: string): PlaylistSyncState | undefined {
  return getPersistent<PlaylistSyncState>(stateKey(playlistId));
}

/** Keep local edits queued and visible; never pretend that a provider write succeeded. */
export function enqueuePlaylistOperation(
  playlist: { id: string; source?: 'local' | 'spotify' | 'youtube'; sourcePlaylistId?: string },
  type: PlaylistSyncState['pendingOperations'][number]['type'],
  payload: Record<string, unknown>,
): void {
  if (!playlist.source || playlist.source === 'local' || playlist.source === 'spotify' || !playlist.sourcePlaylistId) return;
  const existing = getPlaylistSyncState(playlist.id) || {
    playlistId: playlist.id,
    source: 'youtube' as const,
    sourcePlaylistId: playlist.sourcePlaylistId,
    pendingOperations: [],
    status: 'idle' as const,
    updatedAt: Date.now(),
  };
  existing.pendingOperations.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  });
  existing.status = 'readonly';
  existing.error = 'Remote playlist mutations are not part of the local sync queue.';
  existing.updatedAt = Date.now();
  setPersistent(stateKey(playlist.id), existing, 0);
}

export async function syncPlaylist(playlistId: string): Promise<PlaylistSyncState> {
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  if (!playlist || !playlist.source || playlist.source === 'local' || !playlist.sourcePlaylistId) {
    throw new Error('Playlist is not linked to a remote YouTube or Spotify source.');
  }

  const source = playlist.source as 'youtube' | 'spotify';
  const state: PlaylistSyncState = getPlaylistSyncState(playlistId) || {
    playlistId,
    source,
    sourcePlaylistId: playlist.sourcePlaylistId,
    pendingOperations: [],
    status: 'idle',
    updatedAt: Date.now(),
  };

  state.status = 'syncing';
  state.error = undefined;
  state.updatedAt = Date.now();
  setPersistent(stateKey(playlistId), state, 0);

  if (source === 'spotify') {
    try {
      const spotifyId = playlist.sourcePlaylistId;
      const { fetchGuestToken } = await import('@/lib/spotify/guestToken');
      const { fetchPlaylistMeta, fetchAllPlaylistTracks } = await import('@/lib/spotify/apiClient');
      const { toAppTrack, toAppPlaylist } = await import('@/lib/spotify/normalize');
      const { reconcilePlaylist } = await import('@/lib/storage/playlists');

      // Fetch fresh Spotify data
      const { accessToken } = await fetchGuestToken(spotifyId);
      const meta = await fetchPlaylistMeta(spotifyId, accessToken);
      const rawTracks = await fetchAllPlaylistTracks(spotifyId, accessToken);

      const localId = playlist.id;
      const appTracks = rawTracks.map((t, i) => toAppTrack(t, i, localId));
      const newPlaylist = toAppPlaylist(
        spotifyId,
        meta.name || playlist.title,
        meta.image || playlist.thumbnailUrl,
        playlist.sourceUrl || `https://open.spotify.com/playlist/${spotifyId}`,
        appTracks,
      );

      const mergedPlaylist = {
        ...newPlaylist,
        id: playlist.id,
        createdAt: playlist.createdAt,
        lastSyncedAt: new Date().toISOString(),
      };

      // Reconcile with SQLite (instant persistence + background artwork)
      await reconcilePlaylist(mergedPlaylist, appTracks, meta.image || undefined, true);

      state.status = 'idle';
      state.updatedAt = Date.now();
      setPersistent(stateKey(playlistId), state, 0);
      return state;
    } catch (error) {
      state.status = 'error';
      state.error = error instanceof Error ? error.message : 'Spotify playlist synchronization failed';
      state.updatedAt = Date.now();
      setPersistent(stateKey(playlistId), state, 0);
      throw error;
    }
  }

  // YouTube flow unchanged
  try {
    const remote = await readYouTubeRemote(playlist.sourcePlaylistId);
    state.remoteRevision = remote.revision;

    if (state.pendingOperations.length) {
      state.status = 'readonly';
      state.error = 'Remote playlist mutations are not part of the local sync queue.';
      state.updatedAt = Date.now();
      setPersistent(stateKey(playlistId), state, 0);
      return state;
    }

    const localTracks = getCachedTracks(playlistId) || [];
    const tracks = preserveResolvedIdentities(remote.tracks, localTracks);
    setCachedTracks(playlistId, tracks);
    upsertLocalPlaylist({
      ...playlist,
      sourceRevision: remote.revision,
      syncStatus: 'idle',
      syncError: undefined,
      lastSyncedAt: new Date().toISOString(),
    });
    state.lastCommonRevision = remote.revision;
    state.status = 'idle';
    state.updatedAt = Date.now();
    setPersistent(stateKey(playlistId), state, 0);
    return state;
  } catch (error) {
    state.status = 'error';
    state.error = error instanceof Error ? error.message : 'Playlist synchronization failed';
    state.updatedAt = Date.now();
    setPersistent(stateKey(playlistId), state, 0);
    throw error;
  }
}

async function readYouTubeRemote(sourcePlaylistId: string): Promise<{ tracks: Track[]; revision: string }> {
  const result = await getAllYouTubePlaylistTracks(sourcePlaylistId);
  const tracks = result.items.map((item, position) => ({
    videoId: item.videoId,
    playlistItemId: item.playlistItemId,
    title: item.title,
    artist: item.channel || 'Unknown artist',
    duration: item.duration,
    thumbnailUrl: item.thumbnails?.[0] || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
    position,
    source: 'youtube' as const,
    sourceTrackId: item.videoId,
  }));
  return { tracks, revision: canonicalRevision(tracks) };
}

function preserveResolvedIdentities(remote: Track[], local: Track[]): Track[] {
  const localBySource = new Map(local.map((track) => [track.sourceTrackId || track.videoId, track]));
  return remote.map((track, position) => {
    const key = track.sourceTrackId || track.videoId;
    const previous = localBySource.get(key);
    return previous?.videoId && previous.videoId !== track.videoId
      ? { ...track, videoId: previous.videoId, thumbnailUrl: previous.thumbnailUrl, position }
      : { ...track, position };
  });
}
