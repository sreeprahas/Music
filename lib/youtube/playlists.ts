/**
 * lib/youtube/playlists.ts
 *
 * YouTube Music playlist operations using persistent Python sidecar.
 */

import { youtubeSidecar } from './sidecar-client';
import { toPlaylistDetails, toAppPlaylist } from './adapter';
import type { YouTubeCandidate, YouTubePlaylistDetails, YouTubeUserPlaylist } from './types';
import type { Playlist } from '@/types';

export async function getYouTubePlaylistDetails(
  playlistId: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<YouTubePlaylistDetails> {
  const res = await youtubeSidecar.execute<{ playlist: any }>(
    'get_playlist',
    { playlistId, limit },
    20_000,
    signal,
  );
  return toPlaylistDetails(res?.playlist || {});
}

export async function getAllYouTubePlaylistTracks(
  playlistId: string,
  signal?: AbortSignal,
): Promise<{ title?: string; items: YouTubeCandidate[] }> {
  const details = await getYouTubePlaylistDetails(playlistId, undefined, signal);
  return {
    title: details.title,
    items: details.tracks,
  };
}

export async function getUserYouTubePlaylists(limit = 100): Promise<Playlist[]> {
  const res = await youtubeSidecar.execute<{ playlists: YouTubeUserPlaylist[]; total: number }>(
    'get_user_playlists',
    { limit },
    20_000,
  );
  const rawList = Array.isArray(res?.playlists) ? res.playlists : [];
  return rawList.map(toAppPlaylist);
}

export async function createYouTubePlaylist(
  title: string,
  description = '',
  privacyStatus: 'PUBLIC' | 'UNLISTED' | 'PRIVATE' = 'PRIVATE',
  videoIds?: string[],
): Promise<string> {
  const res = await youtubeSidecar.execute<{ playlistId: string; success: boolean }>(
    'create_playlist',
    { title, description, privacyStatus, videoIds },
    20_000,
  );
  return res.playlistId;
}

export async function editYouTubePlaylist(
  playlistId: string,
  options: {
    title?: string;
    description?: string;
    privacyStatus?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
    moveItem?: [string, string];
  },
): Promise<any> {
  return youtubeSidecar.execute(
    'edit_playlist',
    {
      playlistId,
      title: options.title,
      description: options.description,
      privacyStatus: options.privacyStatus,
      moveItem: options.moveItem,
    },
    20_000,
  );
}

export async function deleteYouTubePlaylist(playlistId: string): Promise<boolean> {
  const res = await youtubeSidecar.execute<{ result: any; success: boolean }>(
    'delete_playlist',
    { playlistId },
    20_000,
  );
  return Boolean(res?.success);
}

export async function addTracksToYouTubePlaylist(
  playlistId: string,
  videoIds: string[],
  duplicates = false,
): Promise<any> {
  return youtubeSidecar.execute(
    'add_playlist_items',
    { playlistId, videoIds, duplicates },
    20_000,
  );
}

export async function removeTracksFromYouTubePlaylist(
  playlistId: string,
  videos: Array<{ videoId: string; setVideoId: string }>,
): Promise<any> {
  return youtubeSidecar.execute(
    'remove_playlist_items',
    { playlistId, videos },
    20_000,
  );
}
