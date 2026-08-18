/**
 * Spotify configuration — centralized constants for the Spotify service layer.
 *
 * The app fetches Spotify metadata via the spotdl bridge (lib/spotdl/bridge.ts),
 * which drives the spotdl Python package through a persistent subprocess. No
 * user login, no developer API key, no Premium subscription, and no client
 * secret is required — spotdl ships with a public low-privilege client.
 *
 * These constants are retained for compatibility with any code that still
 * references them; the actual request timeouts and retries are governed by
 * lib/spotdl/config.ts now.
 */

/** Spotify Web API base (retained for reference; the bridge handles requests). */
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/** Public web player URL (retained for reference; no longer scraped). */
export const SPOTIFY_OPEN_SEARCH = 'https://open.spotify.com/search';

/** Default request timeout for Spotify API calls (ms). */
export const SPOTIFY_REQUEST_TIMEOUT_MS = 15000;

/** Maximum retries for transient (5xx, network) errors. */
export const SPOTIFY_MAX_RETRIES = 2;
