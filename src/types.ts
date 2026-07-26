export interface Track {
  id: string; // videoId or unique ID
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration: number; // duration in seconds
  durationFormatted?: string;
  addedAt: string;
  liked?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LibraryData {
  tracks: Record<string, Track>;
  playlists: Playlist[];
  likedTrackIds: string[];
  recentlyPlayedIds: string[];
}

export interface UserSession {
  email: string;
  name: string;
  image?: string;
  isAuthorized: boolean;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  currentIndex: number;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  isLoadingStream: boolean;
  streamError: string | null;
}
