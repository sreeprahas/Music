import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { LibraryData, Playlist, RepeatMode, Track, SleepTimer, SLEEP_TIMER_PRESETS } from '../types';

interface PlayerContextType {
  // Library Data
  library: LibraryData | null;
  loadingLibrary: boolean;
  refreshLibrary: () => Promise<void>;

  // Playback State
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

  // Sleep Timer
  sleepTimer: SleepTimer;
  sleepTimerPresets: typeof SLEEP_TIMER_PRESETS;
  setSleepTimer: (duration: number) => void;
  clearSleepTimer: () => void;
  setCustomSleepTimer: (hours: number, minutes: number) => void;

  // Audio Controls
  playTrack: (track: Track, customQueue?: Track[], index?: number) => Promise<void>;
  togglePlayPause: () => void;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  playNext: () => void;
  playPrevious: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;

  // Queue Controls
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;

  // Library Mutations
  toggleLikeTrack: (trackId: string) => Promise<void>;
  addTrackByUrlOrSearch: (urlOrVideoId: string, playlistId?: string) => Promise<Track | null>;
  removeTrackFromLibrary: (trackId: string) => Promise<void>;
  createNewPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  editPlaylist: (id: string, updates: Partial<Playlist>) => Promise<void>;
  deletePlaylistById: (id: string) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState<boolean>(true);

  // Playback state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Sleep Timer State
  const [sleepTimer, setSleepTimerState] = useState<SleepTimer>({
    isActive: false,
    endTime: null,
    remainingTime: 0,
  });
  const sleepTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize HTML5 Audio object
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      handleTrackEnded();
    };

    const handleError = (e: any) => {
      console.error('Audio playback error:', e);
      setIsPlaying(false);
      setIsLoadingStream(false);
      setStreamError('Audio stream unavailable or failed to play.');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, []);

  // Sync Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Sleep Timer Logic
  useEffect(() => {
    if (sleepTimer.isActive && sleepTimer.endTime) {
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, sleepTimer.endTime! - now);
        setSleepTimerState((prev) => ({ ...prev, remainingTime: remaining }));

        if (remaining <= 0) {
          // Timer expired - pause playback
          if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
          }
          clearSleepTimer();
        }
      };

      updateTimer(); // Initial update
      sleepTimerIntervalRef.current = setInterval(updateTimer, 1000);

      return () => {
        if (sleepTimerIntervalRef.current) {
          clearInterval(sleepTimerIntervalRef.current);
          sleepTimerIntervalRef.current = null;
        }
      };
    } else {
      if (sleepTimerIntervalRef.current) {
        clearInterval(sleepTimerIntervalRef.current);
        sleepTimerIntervalRef.current = null;
      }
    }
  }, [sleepTimer.isActive, sleepTimer.endTime, isPlaying]);

  // Sleep Timer Functions
  const setSleepTimer = (durationMs: number) => {
    const endTime = Date.now() + durationMs;
    setSleepTimerState({
      isActive: true,
      endTime,
      remainingTime: durationMs,
    });
  };

  const clearSleepTimer = () => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }
    setSleepTimerState({
      isActive: false,
      endTime: null,
      remainingTime: 0,
    });
  };

  const setCustomSleepTimer = (hours: number, minutes: number) => {
    const totalMs = (hours * 60 + minutes) * 60 * 1000;
    if (totalMs > 0) {
      setSleepTimer(totalMs);
    }
  };

  // Fetch initial library
  const refreshLibrary = async () => {
    try {
      setLoadingLibrary(true);
      const res = await fetch('/api/library');
      if (res.ok) {
        const data: LibraryData = await res.json();
        setLibrary(data);
      }
    } catch (err) {
      console.error('Failed to fetch library:', err);
    } finally {
      setLoadingLibrary(false);
    }
  };

  useEffect(() => {
    refreshLibrary();
  }, []);

  // Stream & Play Track
  const playTrack = async (track: Track, customQueue?: Track[], index?: number) => {
    if (!audioRef.current) return;

    try {
      setStreamError(null);
      setIsLoadingStream(true);
      setCurrentTrack(track);

      let newQueue = customQueue || queue;
      if (!newQueue || newQueue.length === 0) {
        newQueue = library?.tracks ? Object.values(library.tracks) : [track];
      }
      setQueue(newQueue);

      const targetIdx = index !== undefined ? index : newQueue.findIndex((t) => t.id === track.id);
      setCurrentIndex(targetIdx >= 0 ? targetIdx : 0);

      // Fetch yt-dlp direct audio stream
      const res = await fetch(`/api/stream/${track.videoId}`);
      const data = await res.json();

      if (!res.ok || (!data.streamUrl && !data.proxyUrl)) {
        throw new Error(data.message || 'Failed to extract audio stream URL');
      }

      const playUrl = data.streamUrl || data.proxyUrl;

      audioRef.current.src = playUrl;
      audioRef.current.load();
      await audioRef.current.play();

      setIsPlaying(true);
      setIsLoadingStream(false);

      // Record History
      fetch('/api/library/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: track.videoId }),
      }).catch(() => {});
    } catch (err: any) {
      console.error('Play track failed:', err);
      setIsLoadingStream(false);
      setStreamError(`Stream error: ${err.message || 'Unable to play track'}`);
      setIsPlaying(false);
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current || !currentTrack) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error('Play error:', e));
    }
  };

  const seek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  // Store the volume level before muting, used to restore volume on unmute
  const volumeBeforeMute = useRef<number>(volume);

  const toggleMute = () => {
    const willMute = !isMuted;
    if (willMute) {
      // About to mute: save current volume
      volumeBeforeMute.current = volume;
    }
    setIsMuted(willMute);
    if (!willMute) {
      // Unmuting: restore saved volume
      setVolume(volumeBeforeMute.current);
    }
  };

  const handleTrackEnded = () => {
    if (repeatMode === 'one' && currentTrack) {
      playTrack(currentTrack, queue, currentIndex);
      return;
    }
    playNext();
  };

  const playNext = () => {
    if (queue.length === 0) return;

    let nextIdx = currentIndex + 1;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else if (nextIdx >= queue.length) {
      if (repeatMode === 'all') {
        nextIdx = 0;
      } else {
        setIsPlaying(false);
        return;
      }
    }

    const nextTrack = queue[nextIdx];
    if (nextTrack) {
      playTrack(nextTrack, queue, nextIdx);
    }
  };

  const playPrevious = () => {
    if (queue.length === 0) return;

    if (currentTime > 4) {
      seek(0);
      return;
    }

    let prevIdx = currentIndex - 1;
    if (prevIdx < 0) {
      prevIdx = queue.length - 1;
    }

    const prevTrack = queue[prevIdx];
    if (prevTrack) {
      playTrack(prevTrack, queue, prevIdx);
    }
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);

  const toggleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => [...prev, track]);
  };

  const removeFromQueue = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const clearQueue = () => setQueue([]);

  // Library Mutations
  const toggleLikeTrack = async (trackId: string) => {
    try {
      const res = await fetch(`/api/library/tracks/${trackId}/like`, { method: 'POST' });
      if (res.ok) {
        await refreshLibrary();
      }
    } catch (e) {
      console.error('Toggle like error:', e);
    }
  };

  const addTrackByUrlOrSearch = async (urlOrVideoId: string, playlistId?: string): Promise<Track | null> => {
    try {
      const res = await fetch('/api/library/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlOrVideoId, playlistId }),
      });
      const data = await res.json();
      if (res.ok && data.track) {
        await refreshLibrary();
        return data.track;
      } else {
        throw new Error(data.message || 'Failed to add track');
      }
    } catch (err) {
      console.error('Error adding track:', err);
      throw err;
    }
  };

  const removeTrackFromLibrary = async (trackId: string) => {
    try {
      const res = await fetch(`/api/library/tracks/${trackId}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshLibrary();
      }
    } catch (e) {
      console.error('Remove track error:', e);
    }
  };

  const createNewPlaylist = async (name: string, description?: string): Promise<Playlist | null> => {
    try {
      const res = await fetch('/api/library/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (res.ok && data.playlist) {
        await refreshLibrary();
        return data.playlist;
      }
      return null;
    } catch (e) {
      console.error('Create playlist error:', e);
      return null;
    }
  };

  const editPlaylist = async (id: string, updates: Partial<Playlist>) => {
    try {
      const res = await fetch(`/api/library/playlists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await refreshLibrary();
      }
    } catch (e) {
      console.error('Edit playlist error:', e);
    }
  };

  const deletePlaylistById = async (id: string) => {
    try {
      const res = await fetch(`/api/library/playlists/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshLibrary();
      }
    } catch (e) {
      console.error('Delete playlist error:', e);
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        library,
        loadingLibrary,
        refreshLibrary,
        currentTrack,
        isPlaying,
        queue,
        currentIndex,
        currentTime,
        duration,
        volume,
        isMuted,
        isShuffle,
        repeatMode,
        isLoadingStream,
        streamError,
        // Sleep Timer
        sleepTimer,
        sleepTimerPresets: SLEEP_TIMER_PRESETS,
        setSleepTimer,
        clearSleepTimer,
        setCustomSleepTimer,
        playTrack,
        togglePlayPause,
        seek,
        setVolume,
        toggleMute,
        playNext,
        playPrevious,
        toggleShuffle,
        toggleRepeat,
        addToQueue,
        removeFromQueue,
        clearQueue,
        toggleLikeTrack,
        addTrackByUrlOrSearch,
        removeTrackFromLibrary,
        createNewPlaylist,
        editPlaylist,
        deletePlaylistById,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
