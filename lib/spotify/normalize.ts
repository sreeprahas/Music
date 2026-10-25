/**
 * Normalize raw Spotify data (from embed or internal API) into the app's Track
 * and Playlist types.
 *
 * Spotify identity is the stable app-level track identity; audio retrieval is
 * delegated to the configured SpotiFLAC service.
 */

import type { Playlist, Track } from '@/types';
import type { NormalizedTrack } from './apiClient';
import type { EmbedPreviewResult } from './embed';

/** Convert a NormalizedTrack (from apiClient) into the app's Track schema. */
export function toAppTrack(
  track: NormalizedTrack,
  position: number,
  playlistId: string,
): Track {
  return {
    videoId: track.spotifyTrackId,
    title: track.name,
    artist: track.artists,
    thumbnailUrl: track.image,
    duration: track.duration_ms > 0 ? Math.round(track.duration_ms / 1000) : undefined,
    position,
    dateAdded: track.added_at,
    playlistId,
    source: 'spotify',
    sourceTrackId: track.spotifyTrackId,
    album: track.album || undefined,
  };
}

/** Build a Playlist record from Spotify metadata and the normalized tracks. */
export function toAppPlaylist(
  playlistId: string,
  name: string,
  image: string,
  sourceUrl: string,
  tracks: Track[],
): Playlist {
  const now = new Date().toISOString();
  return {
    id: `spotify-${playlistId}`,
    title: name,
    description: '',
    thumbnailUrl: image || tracks[0]?.thumbnailUrl || '',
    trackCount: tracks.length,
    importedAt: now,
    createdAt: now,
    sourceUrl,
    source: 'spotify',
    sourcePlaylistId: playlistId,
  };
}

/** Format embed preview tracks for the Phase 1 API response. */
export function formatPreviewResponse(embed: EmbedPreviewResult) {
  return {
    playlistName: embed.playlistName,
    coverImage: embed.coverImage,
    totalTracks: embed.totalTracks,
    tracks: embed.tracks.map((t) => ({
      name: t.name,
      artists: t.artists,
      image: t.image,
      duration_ms: t.duration_ms,
    })),
  };
}
