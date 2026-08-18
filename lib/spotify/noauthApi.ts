/**
 * Spotify service layer — search & playlist fetching.
 *
 * This module is the stable public surface the rest of the app imports. It
 * used to be backed by the anonymous `noauth` guest-token client; it is now
 * backed by the spotdl bridge (lib/spotdl/bridge.ts), which fetches the same
 * Spotify metadata via the spotdl Python package through a persistent
 * subprocess.
 *
 * The function signatures and return types are UNCHANGED so every caller
 * (API routes, dualSearch, playlistImporter, normalize) keeps working without
 * modification. The underlying implementation is the only thing that changed.
 *
 * See lib/spotdl/bridge.ts for the subprocess/Python plumbing and
 * lib/spotify/normalize.ts for the conversion into the app's internal
 * Track/Playlist models.
 */

import {
  searchTracksNoauth as spotdlSearchTracks,
  getPlaylistNoauth as spotdlGetPlaylist,
  getPlaylistTracksNoauth as spotdlGetPlaylistTracks,
  getTrackNoauth as spotdlGetTrack,
  getAlbumNoauth as spotdlGetAlbum,
} from '../spotdl/bridge';
import type {
  SpotifyTrack,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifyPaging,
  SpotifyAlbum,
} from './models';

/** Search Spotify for tracks. */
export function searchTracksNoauth(
  query: string,
  limit = 20,
): Promise<SpotifyPaging<SpotifyTrack>> {
  return spotdlSearchTracks(query, limit);
}

/** Fetch a single playlist's metadata. */
export function getPlaylistNoauth(playlistId: string): Promise<SpotifyPlaylist> {
  return spotdlGetPlaylist(playlistId);
}

/** Fetch ALL tracks in a playlist (paginates past the 100-item cap). */
export function getPlaylistTracksNoauth(
  playlistId: string,
): Promise<SpotifyPlaylistItem[]> {
  return spotdlGetPlaylistTracks(playlistId);
}

/** Fetch a single track by its Spotify id. */
export function getTrackNoauth(trackId: string): Promise<SpotifyTrack> {
  return spotdlGetTrack(trackId);
}

/** Fetch a single album and its tracks by its Spotify id. */
export function getAlbumNoauth(
  albumId: string,
): Promise<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }> {
  return spotdlGetAlbum(albumId);
}
