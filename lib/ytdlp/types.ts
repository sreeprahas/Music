/**
 * Shared yt-dlp types.
 *
 * These types describe the media-resolution layer's inputs and outputs.
 * They are intentionally small — the canonical track representation lives in
 * `types/index.ts` (`Track`), and Spotify-specific shapes live in
 * `lib/spotify/models.ts`.
 */

/** A YouTube search candidate returned by the resolver. */
export interface YouTubeCandidate {
  videoId: string;
  title: string;
  channel?: string;
  duration?: number;
  viewCount?: number;
  /** Computed match score (higher = better). */
  score: number;
}

/** Minimal track shape required to resolve a YouTube video. */
export interface ResolvableTrack {
  title: string;
  artist: string;
  duration?: number;
}

/** Result of resolving a track to a playable YouTube video. */
export interface ResolvedVideo {
  videoId: string;
  /** True when the result came from the Spotify→YouTube cache. */
  cached: boolean;
}

/** A resolved direct audio stream URL. */
export interface ResolvedStream {
  videoId: string;
  streamUrl: string;
  source: string;
}
