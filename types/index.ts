export interface Track {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumbnailUrl: string;
  duration?: number;
  position: number;
  dateAdded?: string;
  playlistItemId?: string;
  downloaded?: boolean;
  playlistId?: string;
  sourcePlaylistId?: string;
  /** Spotify track ID (when the track originated from Spotify). */
  spotifyId?: string;
  /** Spotify track URI (spotify:track:...). */
  spotifyUri?: string;
  /** Spotify album and primary artist identities for browsing. */
  spotifyAlbumId?: string;
  spotifyArtistId?: string;
  /** Cached YouTube video ID resolved from Spotify metadata. */
  youtubeId?: string;
  /** Stable source identity used by linked playlist synchronization. */
  sourceTrackId?: string;
  /** Source platform for this track when it belongs to a linked playlist. */
  source?: 'spotify' | 'youtube' | 'local';
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  thumbnailUrls?: string[];
  thumbnailVideoIds?: string[];
  trackCount: number;
  hidden?: boolean;
  importedAt?: string;
  createdAt?: string;
  sourceUrl?: string;
  /** Spotify playlist ID (when the playlist originated from Spotify). */
  spotifyId?: string;
  /** Spotify owner user ID. */
  spotifyOwnerId?: string;
  /** Spotify snapshot ID — used to detect playlist changes. */
  spotifySnapshotId?: string;
  /** Source platform. Local playlists never synchronize remotely. */
  source?: 'local' | 'spotify' | 'youtube';
  /** Source playlist identifier on Spotify or YouTube. */
  sourcePlaylistId?: string;
  /** Last known source revision or canonical content hash. */
  sourceRevision?: string;
  /** Current background synchronization state. */
  syncStatus?: 'idle' | 'syncing' | 'pending' | 'readonly' | 'conflict' | 'error';
  syncError?: string;
  lastSyncedAt?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  picture?: string;
  image?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface SleepTimer {
  isActive: boolean;
  endTime: number | null;
  remainingTime: number;
}

export type SleepTimerPresetMinutes = 15 | 30 | 60 | 120;

export const SLEEP_TIMER_PRESETS: Array<{ label: string; minutes: SleepTimerPresetMinutes }> = [
  { label: '15 mins', minutes: 15 },
  { label: '30 mins', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hrs', minutes: 120 },
];

export interface DownloadJob {
  playlistId: string;
  playlistTitle: string;
  total: number;
  toDownload: number;
  done: number;
  status: 'starting' | 'running' | 'done' | 'error';
  currentTitle?: string;
  currentArtist?: string;
  currentThumbnail?: string;
  errorCount: number;
  startedAt: number;
}

export interface DownloadProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  total?: number;
  toDownload?: number;
  current?: number;
  videoId?: string;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  status?: 'downloading' | 'done' | 'error';
  downloaded?: number;
  message?: string;
  error?: string;
}

export interface SessionData {
  email: string;
  name: string;
  picture: string;
  image?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface MatchDiagnostic {
  code: string;
  message?: string;
  videoId?: string;
  details?: Record<string, unknown>;
  at: number;
}

export interface MatchRecord {
  spotifyTrackId: string;
  youtubeVideoId: string | null;
  matchMethod: 'manual_override' | 'metadata' | 'artwork_fallback' | 'no_match';
  score?: number;
  diagnostics: MatchDiagnostic[];
  matchedAt: number;
  sourceTitle?: string;
  sourceArtist?: string;
  sourceDuration?: number;
}

export interface PlaylistSyncState {
  playlistId: string;
  source: 'spotify' | 'youtube';
  sourcePlaylistId: string;
  lastCommonRevision?: string;
  remoteRevision?: string;
  pendingOperations: Array<{
    id: string;
    type: 'add' | 'remove' | 'reorder' | 'rename' | 'replace';
    payload: Record<string, unknown>;
    createdAt: number;
    attempts: number;
  }>;
  status: 'idle' | 'syncing' | 'pending' | 'readonly' | 'conflict' | 'error';
  error?: string;
  conflicts?: Array<{
    id: string;
    type: string;
    local: unknown;
    remote: unknown;
    createdAt: number;
  }>;
  updatedAt: number;
}
