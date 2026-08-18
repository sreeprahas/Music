/**
 * Normalize Spotify API responses into the app's internal models.
 *
 * The app has ONE canonical track representation (`types/index.ts` Track).
 * Spotify-specific fields are preserved as optional extensions so the UI never
 * depends on Spotify's response shapes directly.
 */

import type { Track, Playlist } from '../../types';
import type {
  SpotifyTrack,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
} from './models';

/** Pick the largest available image URL from a Spotify image array. */
function pickLargestImage(images?: { url: string; width: number | null }[]): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
}

/** Convert a Spotify track into the internal Track model. */
export function normalizeTrack(
  spotifyTrack: SpotifyTrack,
  position = 0,
  playlistId?: string,
): Track {
  const artists = spotifyTrack.artists || [];
  const artistName = artists.map((a) => a.name).join(', ') || 'Unknown artist';
  const album = spotifyTrack.album;
  const albumName = album?.name;
  const albumImage = pickLargestImage(album?.images);

  return {
    // Primary key remains the YouTube video ID once resolved; until then we
    // use the Spotify ID as a placeholder so the track is addressable.
    videoId: '',
    title: spotifyTrack.name,
    artist: artistName,
    album: albumName,
    // Use the album artwork as the thumbnail until a YouTube thumbnail is
    // resolved. The /api/thumbnail endpoint will proxy this URL.
    thumbnailUrl: albumImage || '',
    duration: Math.round(spotifyTrack.duration_ms / 1000),
    position,
    playlistId,
    // Spotify-specific extensions (optional, not in the base Track type yet).
    ...({ spotifyId: spotifyTrack.id, spotifyUri: spotifyTrack.uri } as object),
  } as Track;
}

/** Convert a list of Spotify playlist items into internal Track models. */
export function normalizePlaylistItems(
  items: SpotifyPlaylistItem[],
  playlistId?: string,
): Track[] {
  const tracks: Track[] = [];
  let position = 0;
  for (const item of items) {
    // Skip null tracks (deleted/unavailable) and local files.
    if (!item.track || item.is_local) continue;
    tracks.push(normalizeTrack(item.track, position, playlistId));
    position++;
  }
  return tracks;
}

/** Convert a Spotify playlist into the internal Playlist model. */
export function normalizePlaylist(
  spotifyPlaylist: SpotifyPlaylist,
  sourceUrl?: string,
): Playlist {
  const coverUrl = pickLargestImage(spotifyPlaylist.images);
  const nowIso = new Date().toISOString();
  return {
    id: `spotify-${spotifyPlaylist.id}`,
    title: spotifyPlaylist.name,
    description: spotifyPlaylist.description || `Imported from Spotify`,
    thumbnailUrl: coverUrl || '',
    trackCount: spotifyPlaylist.tracks?.total ?? 0,
    importedAt: nowIso,
    createdAt: nowIso,
    sourceUrl: sourceUrl || `https://open.spotify.com/playlist/${spotifyPlaylist.id}`,
    // Spotify-specific extensions.
    ...({ spotifyId: spotifyPlaylist.id, spotifyOwnerId: spotifyPlaylist.owner?.id } as object),
  } as Playlist;
}
