/**
 * lib/youtube/types.ts
 *
 * Types for the Python ytmusicapi sidecar RPC protocol and YouTube Music domain models.
 */

export interface SidecarRequest<T = Record<string, unknown>> {
  requestId: string;
  operation: string;
  arguments: T;
}

export interface SidecarResponse<T = unknown> {
  requestId: string;
  success: boolean;
  data?: T;
  error?: string;
  errorType?: string;
}

export interface SidecarStatus {
  status: 'ready' | 'starting' | 'stopped' | 'error';
  authenticated: boolean;
  authFile?: string | null;
  version?: string;
  error?: string;
}

export interface SidecarAuthStatus {
  authenticated: boolean;
  valid: boolean;
  authFile?: string | null;
  libraryPlaylistsCount?: number;
  message?: string;
  error?: string;
}

export interface YouTubeArtistSummary {
  name: string;
  id?: string;
}

export interface YouTubeAlbumSummary {
  name: string;
  id?: string;
}

export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubeCandidate {
  videoId: string;
  playlistItemId?: string;
  title: string;
  channel?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  duration?: number;
  durationSeconds?: number;
  thumbnails?: string[];
  viewCount?: number;
  isExplicit?: boolean;
  year?: string | number;
  relevance?: number;
  resultType?: 'song' | 'video' | 'album' | 'artist' | 'playlist';
  category?: string;
}

export interface ResolvedAudio {
  videoId: string;
  streamUrl: string;
  mimeType: string;
  bitrate?: number;
  contentLength?: number;
  expiresAt?: number;
  hasCipher?: boolean;
}

export interface YouTubePlaylistMeta {
  id: string;
  title: string;
  description?: string;
  author?: { name: string; id?: string };
  thumbnails?: string[];
  trackCount?: number;
  privacy?: string;
}

export interface YouTubePlaylistDetails {
  id: string;
  title: string;
  description?: string;
  author?: { name: string; id?: string };
  thumbnails?: string[];
  trackCount?: number;
  tracks: YouTubeCandidate[];
  continuation?: string;
}

export interface YouTubeUserPlaylist {
  playlistId: string;
  title: string;
  thumbnails?: string[];
  count?: number;
  description?: string;
}
