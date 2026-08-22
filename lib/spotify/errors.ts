/**
 * Spotify embed + guest-token error classes.
 *
 * These replace the previous OAuth/Web API error hierarchy. Only the subset
 * of error types actually used by the new implementation is defined here.
 */

// ─── Spotify errors ──────────────────────────────────────────────────────────

export class SpotifyEmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyEmbedError';
  }
}

export class SpotifyGuestTokenError extends Error {
  constructor(message = 'Failed to obtain Spotify guest token') {
    super(message);
    this.name = 'SpotifyGuestTokenError';
  }
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

export class SpotifyNotFoundError extends SpotifyApiError {
  constructor(message = 'Spotify playlist not found') {
    super(message, 404);
    this.name = 'SpotifyNotFoundError';
  }
}

export class SpotifyRateLimitError extends SpotifyApiError {
  constructor(
    message = 'Spotify rate limit exceeded',
    public readonly retryAfterMs = 0,
  ) {
    super(message, 429);
    this.name = 'SpotifyRateLimitError';
  }
}

/** Convert any error to a UI-safe message string. */
export function toUiMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'An unknown error occurred';
}

// ─── Shared non-Spotify errors ───────────────────────────────────────────────

/** Thrown when an audio download fails. */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

/** Thrown when YouTube video resolution fails. */
export class YouTubeResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YouTubeResolutionError';
  }
}
