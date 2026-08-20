/**
 * Structured Spotify + YouTube error hierarchy.
 *
 * Every error carries a UI-safe `message` and a machine-readable `code`.
 * Errors NEVER carry secrets (tokens, client_secret, PKCE verifier, cookies).
 */

/** Base class for Spotify GraphQL transport errors. */
export class SpotifyGraphQlError extends Error {
  /** HTTP status code (0 for network failures). */
  readonly status: number;
  /** Machine-readable error code. */
  readonly code: string;
  /** Retry-After header value in ms, when present (0 = unknown). */
  readonly retryAfterMs: number;

  constructor(message: string, status: number, code = 'spotify_api_error', retryAfterMs = 0) {
    super(message);
    this.name = 'SpotifyGraphQlError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/** 401 — access token is missing, invalid, or expired. */
export class SpotifyAuthenticationError extends SpotifyGraphQlError {
  constructor(message = 'Spotify authentication required') {
    super(message, 401, 'spotify_auth_error');
    this.name = 'SpotifyAuthenticationError';
  }
}

/** 403 — token valid but lacks the required scope, or action forbidden. */
export class SpotifyAuthorizationError extends SpotifyGraphQlError {
  constructor(message = 'Spotify authorization insufficient for this action') {
    super(message, 403, 'spotify_authorization_error');
    this.name = 'SpotifyAuthorizationError';
  }
}

/** Access token expired — distinct from invalid so the client can refresh. */
export class SpotifyTokenExpiredError extends SpotifyGraphQlError {
  constructor(message = 'Spotify access token expired') {
    super(message, 401, 'spotify_token_expired');
    this.name = 'SpotifyTokenExpiredError';
  }
}

/** 429 — rate limited. Always carries retryAfterMs. */
export class SpotifyRateLimitError extends SpotifyGraphQlError {
  constructor(retryAfterMs: number, message = 'Spotify rate limit exceeded') {
    super(message, 429, 'spotify_rate_limit', retryAfterMs);
    this.name = 'SpotifyRateLimitError';
  }
}

/** 404 — resource not found. */
export class SpotifyNotFoundError extends SpotifyGraphQlError {
  constructor(message = 'Spotify resource not found') {
    super(message, 404, 'spotify_not_found');
    this.name = 'SpotifyNotFoundError';
  }
}

/** YouTube errors — media resolution / download / stream. */
export class YouTubeError extends Error {
  readonly code: string;
  constructor(message: string, code = 'youtube_error') {
    super(message);
    this.name = 'YouTubeError';
    this.code = code;
  }
}

/** YouTube search/resolution failed entirely. */
export class YouTubeResolutionError extends YouTubeError {
  constructor(message = 'Failed to resolve a YouTube match') {
    super(message, 'youtube_resolution_error');
    this.name = 'YouTubeResolutionError';
  }
}

/** Download failed. */
export class DownloadError extends YouTubeError {
  constructor(message = 'Download failed') {
    super(message, 'download_error');
    this.name = 'DownloadError';
  }
}

/** Stream URL extraction failed. */
export class StreamResolutionError extends YouTubeError {
  constructor(message = 'Failed to extract audio stream URL') {
    super(message, 'stream_resolution_error');
    this.name = 'StreamResolutionError';
  }
}

/** Convert a raw error into a UI-safe message (no secrets leaked). */
export function toUiMessage(error: unknown): string {
  if (error instanceof SpotifyRateLimitError) {
    const secs = Math.ceil(error.retryAfterMs / 1000);
    return secs > 0 ? `Spotify is rate-limiting this app. Try again in ${secs}s.` : 'Spotify is rate-limiting this app. Please wait and retry.';
  }
  if (error instanceof SpotifyAuthenticationError) return 'Spotify is temporarily unavailable. Please try again in a moment.';
  if (error instanceof SpotifyAuthorizationError) return 'Your Spotify account lacks permission for this action.';
  if (error instanceof SpotifyNotFoundError) return 'This Spotify resource was not found.';
  if (error instanceof SpotifyGraphQlError) return error.message;
  if (error instanceof YouTubeResolutionError) return 'Could not find a matching YouTube video for this track.';
  if (error instanceof DownloadError) return error.message;
  if (error instanceof StreamResolutionError) return 'Could not start playback for this track.';
  if (error instanceof YouTubeError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
