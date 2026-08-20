/**
 * Strongly-typed Spotify GraphQL data models.
 *
 * These mirror the normalized Spotify GraphQL response shapes for the objects this app
 * actually uses. They are intentionally minimal — we only model fields we read.
 *
 * Normalization into the app's internal `Track`/`Playlist` types happens in
 * `lib/spotify/normalize.ts`, not here. UI components depend on the internal
 * models, never on these Spotify-specific shapes.
 */

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  email?: string;
  product?: string; // 'free' | 'premium' | 'open'
  images?: SpotifyImage[];
  uri: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
  images?: SpotifyImage[];
  genres?: string[];
  popularity?: number;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type?: string;
  release_date?: string;
  images?: SpotifyImage[];
  artists?: SpotifyArtist[];
  uri: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit?: boolean;
  artists: SpotifyArtist[];
  album?: SpotifyAlbum;
  preview_url?: string | null;
  external_ids?: { isrc?: string };
  popularity?: number;
}

/** A playlist track entry wraps a track (or episode) with metadata. */
export interface SpotifyPlaylistItem {
  added_at?: string;
  added_by?: { id: string; uri: string };
  is_local?: boolean;
  track: SpotifyTrack | null; // null when the track is no longer available
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  owner?: { id: string; display_name: string | null; uri: string };
  images?: SpotifyImage[];
  snapshot_id?: string;
  collaborative?: boolean;
  public?: boolean | null;
  uri: string;
  tracks?: { href: string; total: number; next?: string | null };
}

/** Generic Spotify paging wrapper. */
export interface SpotifyPaging<T> {
  href: string;
  items: T[];
  limit: number;
  offset: number;
  total: number;
  next: string | null;
  previous: string | null;
}

/** Normalized Spotify GraphQL error response body. */
export interface SpotifyGraphQlErrorBody {
  error: {
    status: number;
    message: string;
    reason?: string;
  };
}

