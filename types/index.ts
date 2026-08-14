export interface Track {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration?: number;
  position: number;
  dateAdded?: string;
  playlistItemId?: string;
  downloaded?: boolean;
  playlistId?: string;
  sourcePlaylistId?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  thumbnailUrls?: string[];
  trackCount: number;
  hidden?: boolean;
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
