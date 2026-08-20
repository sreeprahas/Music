/**
 * Spotify configuration — centralized constants for the Spotify service layer.
 *
 * Spotify GraphQL configuration. The query document and endpoint are supplied
 * by deployment and are the only provider transport used by this app.
 *
 * These constants are shared by the server-side Spotify adapter.
 */

export const SPOTIFY_GRAPHQL_ENDPOINT = process.env.SPOTIFY_GRAPHQL_ENDPOINT || '';
export const SPOTIFY_GRAPHQL_QUERY = process.env.SPOTIFY_GRAPHQL_QUERY || '';

/** Default request timeout for Spotify GraphQL calls (ms). */
export const SPOTIFY_REQUEST_TIMEOUT_MS = 15000;

/** Maximum retries for transient (5xx, network) errors. */
export const SPOTIFY_MAX_RETRIES = 2;
