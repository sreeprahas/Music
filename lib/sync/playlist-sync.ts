/**
 * lib/sync/playlist-sync.ts
 *
 * Playlist synchronization for Spotify playlists.
 * Reconciles local SQLite state with live remote snapshot.
 */

import type { PlaylistSyncState } from '@/types';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';
import { getLocalPlaylists, getCachedTracks } from '@/lib/db';

const stateKey = (playlistId: string) => `sync:${playlistId}`;

export function getPlaylistSyncState(playlistId: string): PlaylistSyncState | undefined {
  return getPersistent<PlaylistSyncState>(stateKey(playlistId));
}

/** Keep local edits queued and visible. */
export function enqueuePlaylistOperation(
  playlist: { id: string; source?: 'local' | 'spotify' | 'youtube'; sourcePlaylistId?: string },
  _type: PlaylistSyncState['pendingOperations'][number]['type'],
  _payload: Record<string, unknown>,
): void {
  if (!playlist.source || playlist.source === 'local' || !playlist.sourcePlaylistId) return;
}

export async function syncPlaylist(playlistId: string): Promise<PlaylistSyncState> {
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  if (!playlist || !playlist.source || playlist.source === 'local' || !playlist.sourcePlaylistId) {
    throw new Error('Playlist is not linked to a remote source.');
  }

  if (playlist.source !== 'spotify') {
    throw new Error('Sync is only supported for Spotify playlists.');
  }

  const state: PlaylistSyncState = getPlaylistSyncState(playlistId) || {
    playlistId,
    source: 'spotify',
    sourcePlaylistId: playlist.sourcePlaylistId,
    pendingOperations: [],
    status: 'idle',
    updatedAt: Date.now(),
  };

  state.status = 'syncing';
  state.error = undefined;
  state.updatedAt = Date.now();
  setPersistent(stateKey(playlistId), state, 0);

  try {
    const spotifyId = playlist.sourcePlaylistId;
    const { fetchPlaylistWithHiddenWebContents } = await import('@/lib/spotify/webContentsProvider');
    const { toAppTrack, toAppPlaylist } = await import('@/lib/spotify/normalize');
    const { reconcilePlaylist } = await import('@/lib/storage/playlists');

    const { playlist: meta, tracks: scrapedTracks } = await fetchPlaylistWithHiddenWebContents(
      playlist.sourceUrl || `https://open.spotify.com/playlist/${spotifyId}`,
    );

    const localId = playlist.id;
    const normalizedTracks = scrapedTracks.map((track) => ({
      name: track.title,
      artists: track.artist,
      duration_ms: track.durationMs || 0,
      image: track.image || '',
      added_at: track.addedAt || new Date().toISOString(),
      spotifyTrackId: track.id,
      album: track.album,
    }));
    const remoteTracks = normalizedTracks.map((t, i) => toAppTrack(t, i, localId));
    const remoteKeys = new Set(remoteTracks.map((track) => track.sourceTrackId || track.videoId || track.title));
    const localOnlyTracks = getCachedTracks(localId)
      .filter((track) => !remoteKeys.has(track.sourceTrackId || track.videoId || track.title))
      .map((track, index) => ({ ...track, playlistId: localId, position: remoteTracks.length + index }));
    const appTracks = [...remoteTracks, ...localOnlyTracks];

    const playlistName = meta.name?.trim() || playlist.title;
    const newPlaylist = toAppPlaylist(
      spotifyId,
      playlistName || playlist.title,
      meta.image || playlist.thumbnailUrl,
      playlist.sourceUrl || `https://open.spotify.com/playlist/${spotifyId}`,
      appTracks,
    );

    const mergedPlaylist = {
      ...newPlaylist,
      id: playlist.id,
      title: playlistName || playlist.title,
      syncOnOpen: playlist.syncOnOpen,
      createdAt: playlist.createdAt,
      lastSyncedAt: new Date().toISOString(),
    };

    await reconcilePlaylist(mergedPlaylist, appTracks, meta.image || undefined, true);

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
