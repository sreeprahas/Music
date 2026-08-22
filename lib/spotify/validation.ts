/**
 * Input validation helpers for Spotify identifiers.
 *
 * Spotify playlist IDs are Base-62 strings of up to ~30 characters.
 * We validate strictly to avoid using user-controlled input as part of URL paths.
 */

const SPOTIFY_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const PLAYLIST_URL_RE = /open\.spotify\.com\/playlist\/([A-Za-z0-9]{10,40})/;

/** Extract a Spotify playlist ID from a URL string. Returns null if not found. */
export function extractPlaylistId(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const match = PLAYLIST_URL_RE.exec(rawUrl);
  return match ? match[1] : null;
}

/** Return the ID unchanged or throw if it doesn't look like a valid Spotify ID. */
export function requireSpotifyId(id: string): string {
  if (!SPOTIFY_ID_RE.test(id)) {
    throw new Error(`Invalid Spotify identifier: "${id.slice(0, 40)}"`);
  }
  return id;
}

/** Validate a search query is not excessively long. */
export function boundedQuery(query: string, maxLength = 200): string {
  if (query.length > maxLength) throw new Error('Search query is too long');
  return query;
}

/** Check whether a URL looks like a Spotify playlist URL (browser-safe). */
export function isSpotifyPlaylistUrl(rawUrl: string): boolean {
  return PLAYLIST_URL_RE.test(rawUrl);
}
