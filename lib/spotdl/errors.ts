/**
 * spotdl bridge errors — mapped onto the existing Spotify error hierarchy so
 * the UI's `toUiMessage()` (lib/spotify/errors.ts) continues to work unchanged.
 *
 * The bridge never surfaces raw Python tracebacks. Each failure is classified
 * into one of the existing error codes the UI already understands.
 */

import {
  SpotifyApiError,
  SpotifyNotFoundError,
  SpotifyRateLimitError,
  SpotifyAuthenticationError,
} from '../spotify/errors';

/** Python interpreter could not be found. */
export class PythonNotFoundError extends Error {
  readonly code = 'python_not_found';
  constructor(message = 'Python is not installed or could not be found.') {
    super(message);
    this.name = 'PythonNotFoundError';
  }
}

/** spotdl package is not installed in the discovered Python environment. */
export class SpotdlNotInstalledError extends Error {
  readonly code = 'spotdl_not_installed';
  constructor(message = 'The spotdl package is not installed in the configured Python environment.') {
    super(message);
    this.name = 'SpotdlNotInstalledError';
  }
}

/** The worker process crashed or failed to initialize. */
export class SpotdlProcessError extends Error {
  readonly code: string;
  constructor(message: string, code = 'spotdl_process_error') {
    super(message);
    this.name = 'SpotdlProcessError';
    this.code = code;
  }
}

/** An operation timed out (startup or activity timeout). */
export class SpotdlTimeoutError extends Error {
  readonly code = 'spotdl_timeout';
  constructor(message = 'The Spotify metadata operation timed out.') {
    super(message);
    this.name = 'SpotdlTimeoutError';
  }
}

/** The operation was cancelled by the caller. */
export class SpotdlCancelledError extends Error {
  readonly code = 'spotdl_cancelled';
  constructor(message = 'The Spotify metadata operation was cancelled.') {
    super(message);
    this.name = 'SpotdlCancelledError';
  }
}

/**
 * Map a worker-reported error code onto the existing Spotify error hierarchy.
 * The UI consumes these via `toUiMessage()` and never sees Python tracebacks.
 */
export function mapWorkerError(code: string, message: string): Error {
  switch (code) {
    case 'spotify_not_found':
      return new SpotifyNotFoundError(message || 'Spotify resource not found');
    case 'spotify_rate_limit':
      return new SpotifyRateLimitError(0, message || 'Spotify rate limit exceeded');
    case 'spotify_invalid_url':
      return new SpotifyApiError(message || 'Invalid Spotify URL', 400, 'spotify_invalid_url');
    case 'spotify_network':
      return new SpotifyApiError(message || 'Network error contacting Spotify', 0, 'spotify_network');
    case 'spotify_auth_error':
    case 'spotdl_init_error':
      return new SpotifyAuthenticationError(message || 'Spotify authentication failed');
    case 'spotdl_timeout':
      return new SpotdlTimeoutError(message);
    case 'spotdl_cancelled':
      return new SpotdlCancelledError(message);
    default:
      return new SpotifyApiError(
        message || 'Spotify metadata operation failed',
        0,
        code || 'spotify_api_error',
      );
  }
}
