'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Playlist, Track, UserProfile, RepeatMode, DownloadJob, DownloadProgressEvent } from '@/types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { PlaylistGrid, PlaylistGridSkeleton } from './PlaylistGrid';
import { PlaylistView, PlaylistViewSkeleton } from './PlaylistView';
import { HiddenPlaylistsView } from './HiddenPlaylistsView';
import { PlayerBar } from './PlayerBar';
import { QueueDrawer } from './QueueDrawer';
import { LyricsDrawer } from './LyricsDrawer';
import { ExpandedPlayerModal } from './ExpandedPlayerModal';
import { ResizeDivider } from './ResizeDivider';
import { isNativeHost, sendNativeDownloadRequest, useNativeDownloadProgress } from '@/lib/webviewBridge';
import { Search, Play } from 'lucide-react';
import { cleanArtistName, formatDuration } from '@/lib/ytmusicApi';

const QUEUE_MIN = 16;
const QUEUE_MAX = 28;
const LYRICS_MIN = 18;
const LYRICS_MAX = 30;
const SIDEBAR_EXPANDED_WIDTH = 20;
const SIDEBAR_COLLAPSED_WIDTH = 5.5;

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

interface Props {
  user: UserProfile;
}

type SearchMode = 'name' | 'artist';
type CachedTrack = Track & { playlistId: string; playlistTitle: string };
type RouteState =
  | { kind: 'home' }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'hidden' }
  | { kind: 'search'; query: string; songId?: string };
type PlaybackSession = {
  track: Track | null;
  queue: Track[];
  time: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  volume: number;
  isMuted: boolean;
  isQueueOpen: boolean;
  isLyricsOpen: boolean;
};

function readPlaybackSession(): PlaybackSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem('yt_playback_session');
    return value ? (JSON.parse(value) as PlaybackSession) : null;
  } catch {
    return null;
  }
}

function decodeSlug(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readRoute(): RouteState {
  const parts = window.location.pathname.split('/').filter(Boolean).map(decodeSlug);
  if (parts[0] === 'playlist' && parts[1]) return { kind: 'playlist', playlistId: parts[1] };
  if (parts[0] === 'hidden') return { kind: 'hidden' };
  if (parts[0] === 'search' && parts[1]) {
    return { kind: 'search', query: parts[1], songId: parts[2] === 'song' && parts[3] ? parts[3] : undefined };
  }
  return { kind: 'home' };
}

function routeHref(route: RouteState) {
  if (route.kind === 'playlist') return `/playlist/${encodeURIComponent(route.playlistId)}`;
  if (route.kind === 'hidden') return '/hidden';
  if (route.kind === 'search') {
    const base = `/search/${encodeURIComponent(route.query)}`;
    return route.songId ? `${base}/song/${encodeURIComponent(route.songId)}` : base;
  }
  return '/';
}

export function Dashboard({ user }: Props) {
  const savedSessionRef = useRef<PlaybackSession | null>(readPlaybackSession());
  const savedSession = savedSessionRef.current;
  // Read the initial URL route once synchronously — used to pick the right skeleton before playlists load
  const [initialRoute] = useState<RouteState>(() => (typeof window !== 'undefined' ? readRoute() : { kind: 'home' }));
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [showHiddenFolder, setShowHiddenFolder] = useState(false);
  const [allTracks, setAllTracks] = useState<Record<string, CachedTrack>>({});
  const [lastDownloadedTrack, setLastDownloadedTrack] = useState<{ videoId: string; timestamp: number } | null>(null);
  const [restoredTrack, setRestoredTrack] = useState<{ track: Track; playlistId: string; timestamp: number } | null>(null);
  const [isSearchIndexing, setIsSearchIndexing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('name');

  const [queueWidth, setQueueWidth] = useState(22);
  const [lyricsWidth, setLyricsWidth] = useState(24);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(savedSession?.track ?? null);
  const [queue, setQueue] = useState<Track[]>(savedSession?.queue ?? []);
  const [isShuffle, setIsShuffle] = useState(savedSession?.isShuffle ?? false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(savedSession?.repeatMode ?? 'off');
  const [isQueueOpen, setIsQueueOpen] = useState(savedSession?.isQueueOpen ?? false);
  const [isQueueClosing, setIsQueueClosing] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(savedSession?.isLyricsOpen ?? false);
  const [isLyricsClosing, setIsLyricsClosing] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isFullscreenClosing, setIsFullscreenClosing] = useState(false);
  const handleOpenFullscreen = useCallback(() => setIsFullscreenOpen(true), []);
  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreenClosing(true);
    setTimeout(() => {
      setIsFullscreenOpen(false);
      setIsFullscreenClosing(false);
    }, 300);
  }, []);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [sleepTimerRequest, setSleepTimerRequest] = useState<{ type: 'open' | 'set'; minutes?: number; id: number } | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('yt_offline_mode') === 'true'
  );
  // isHardwareOffline = true when the physical network is actually gone
  const [isHardwareOffline, setIsHardwareOffline] = useState(() =>
    typeof window !== 'undefined' ? !navigator.onLine : false
  );

  // Auto-detect browser online/offline events + check on page load and right-click
  useEffect(() => {
    // If the user manually set the state to offline, stop pinging completely
    if (isOfflineMode && !isHardwareOffline) return;

    const checkReachability = async () => {
      if (typeof window === 'undefined') return;
      if (!navigator.onLine) {
        setIsHardwareOffline(true);
        setIsOfflineMode(true);
        return;
      }
      try {
        const res = await fetch('/api/ping', { cache: 'no-store' }).catch(() => null);
        const online = !!(res && res.ok);
        setIsHardwareOffline(!online);
        if (!online) {
          setIsOfflineMode(true);
        } else {
          const userPref = localStorage.getItem('yt_offline_mode') === 'true';
          setIsOfflineMode(userPref);
        }
      } catch {
        setIsHardwareOffline(true);
        setIsOfflineMode(true);
      }
    };

    checkReachability();
    const intervalId = setInterval(checkReachability, 3000);

    const handleOnline = () => checkReachability();
    const handleOffline = () => {
      setIsHardwareOffline(true);
      setIsOfflineMode(true);
    };
    const handleContextMenu = () => checkReachability();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isOfflineMode, isHardwareOffline]);

  const handleToggleOfflineMode = useCallback(() => {
    if (isHardwareOffline) return; // can't go online when hardware is offline
    setIsOfflineMode((prev) => {
      const next = !prev;
      localStorage.setItem('yt_offline_mode', String(next));
      return next;
    });
  }, [isHardwareOffline]);

  useEffect(() => {
    if (!currentTrack) {
      setIsLyricsOpen(false);
      setIsQueueOpen(false);
      setIsFullscreenOpen(false);
    }
  }, [currentTrack]);

  const [undoAction, setUndoAction] = useState<{ track: Track; playlistId: string } | null>(null);
  // Holds the timeout that fires the actual API delete after the undo window expires
  const pendingDeleteRef = useRef<{ timeoutId: number; track: Track; playlistId: string } | null>(null);

  // When undoAction clears (banner dismissed without clicking undo), fire the deferred API delete
  useEffect(() => {
    if (!undoAction) return;
    // Clear any previous timer
    if (pendingDeleteRef.current) {
      window.clearTimeout(pendingDeleteRef.current.timeoutId);
    }
    const { track, playlistId } = undoAction;
    const timeoutId = window.setTimeout(async () => {
      setUndoAction(null);
      pendingDeleteRef.current = null;
      // Now actually call the API to remove from YouTube
      try {
        const response = await fetch('/api/playlist/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId, playlistItemId: track.playlistItemId, videoId: track.videoId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to remove song from playlist');
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to remove song from playlist');
      }
    }, 7000);
    pendingDeleteRef.current = { timeoutId, track, playlistId };
    return () => window.clearTimeout(timeoutId);
  }, [undoAction]);

  const handleCloseQueue = useCallback(() => {
    setIsQueueClosing(true);
    setTimeout(() => {
      setIsQueueOpen(false);
      setIsQueueClosing(false);
    }, 240);
  }, []);

  const handleCloseLyrics = useCallback(() => {
    setIsLyricsClosing(true);
    setTimeout(() => {
      setIsLyricsOpen(false);
      setIsLyricsClosing(false);
    }, 240);
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(savedSession?.time ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(savedSession?.volume ?? 1);
  const [isMuted, setIsMuted] = useState(savedSession?.isMuted ?? false);
  const lastAudibleVolumeRef = useRef(savedSession?.volume && savedSession.volume > 0 ? savedSession.volume : 1);
  const [shouldAutoplay, setShouldAutoplay] = useState(Boolean(savedSession?.track));
  const [historyPosition, setHistoryPosition] = useState(0);
  const [historyLength, setHistoryLength] = useState(0);
  const historyPositionRef = useRef(0);

  useEffect(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (audio) audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (!audio) return;
    const handleVolumeChange = () => {
      if (audio.volume > 0) lastAudibleVolumeRef.current = audio.volume;
      setVolume(audio.volume);
      setIsMuted(audio.volume === 0);
    };
    audio.addEventListener('volumechange', handleVolumeChange);
    return () => audio.removeEventListener('volumechange', handleVolumeChange);
  }, []);

  useEffect(() => {
    if (volume > 0) lastAudibleVolumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    // Hidden & pinned playlists load from DB account
    fetch('/api/user/settings')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.pinnedPlaylists)) setPinnedIds(data.pinnedPlaylists);
        if (Array.isArray(data?.hiddenPlaylists)) setHiddenIds(data.hiddenPlaylists);
      })
      .catch(() => { });

    // Player settings & session load from localStorage
    try {
      const savedShuffle = localStorage.getItem('yt_playback_shuffle');
      const savedRepeat = localStorage.getItem('yt_playback_repeat');
      const savedVolume = localStorage.getItem('yt_playback_volume');
      const savedMuted = localStorage.getItem('yt_playback_muted');
      const savedQueueWidth = localStorage.getItem('yt_queue_width_pct');
      const savedLyricsWidth = localStorage.getItem('yt_lyrics_width_pct');
      if (savedShuffle) setIsShuffle(JSON.parse(savedShuffle));
      if (savedRepeat) setRepeatMode(JSON.parse(savedRepeat));
      if (savedVolume) setVolume(parseFloat(savedVolume));
      if (savedMuted) setIsMuted(JSON.parse(savedMuted));
      if (savedQueueWidth) setQueueWidth(parseFloat(savedQueueWidth));
      if (savedLyricsWidth) setLyricsWidth(parseFloat(savedLyricsWidth));
    } catch { }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('yt_playback_shuffle', JSON.stringify(isShuffle));
    } catch { }
  }, [isShuffle]);

  useEffect(() => {
    try {
      localStorage.setItem('yt_playback_repeat', JSON.stringify(repeatMode));
    } catch { }
  }, [repeatMode]);

  useEffect(() => {
    try {
      localStorage.setItem('yt_playback_volume', String(volume));
    } catch { }
  }, [volume]);

  useEffect(() => {
    try {
      localStorage.setItem('yt_playback_muted', JSON.stringify(isMuted));
    } catch { }
  }, [isMuted]);

  useEffect(() => {
    try {
      localStorage.setItem('yt_queue_width_pct', String(queueWidth));
    } catch { }
  }, [queueWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('yt_lyrics_width_pct', String(lyricsWidth));
    } catch { }
  }, [lyricsWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'yt_playback_session',
        JSON.stringify({
          track: currentTrack,
          queue,
          time: currentTime,
          isShuffle,
          repeatMode,
          volume,
          isMuted,
          isQueueOpen,
          isLyricsOpen,
        } satisfies PlaybackSession)
      );
    } catch { }
  }, [currentTrack, queue, currentTime, isShuffle, repeatMode, volume, isMuted, isQueueOpen, isLyricsOpen]);

  const nativeProgress = useNativeDownloadProgress();
  const [downloadJobs, setDownloadJobs] = useState<Map<string, DownloadJob>>(new Map());
  const downloadSources = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    if (!isNativeHost()) return;
    setDownloadJobs((prev) => {
      let changed = false;
      const m = new Map(prev);
      for (const [id, value] of Object.entries(nativeProgress)) {
        const job = m.get(id);
        if (job && job.done !== value) {
          m.set(id, { ...job, done: value, status: value >= 100 ? 'done' : 'running' });
          changed = true;
        }
      }
      return changed ? m : prev;
    });
  }, [nativeProgress]);

  useEffect(() => {
    fetch('/api/user/settings')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.pinnedPlaylists)) setPinnedIds(data.pinnedPlaylists);
        if (Array.isArray(data?.hiddenPlaylists)) setHiddenIds(data.hiddenPlaylists);
      })
      .catch(() => { });
  }, []);

  const applyRoute = useCallback(
    (route: RouteState) => {
      setShowHiddenFolder(route.kind === 'hidden');
      setSearchQuery(route.kind === 'search' ? route.query : '');
      setSelectedPlaylist(
        route.kind === 'playlist'
          ? playlists.find((playlist) => playlist.id === route.playlistId) ?? null
          : null
      );
    },
    [playlists]
  );

  useEffect(() => {
    const initialPosition = Number(window.history.state?.musicNavigationIndex ?? 0);
    window.history.replaceState({ ...window.history.state, musicNavigationIndex: initialPosition }, '', window.location.href);
    historyPositionRef.current = initialPosition;
    setHistoryPosition(initialPosition);
    setHistoryLength(initialPosition);
    applyRoute(readRoute());

    const handlePopState = (event: PopStateEvent) => {
      const nextPosition = Number(event.state?.musicNavigationIndex ?? 0);
      historyPositionRef.current = nextPosition;
      setHistoryPosition(nextPosition);
      applyRoute(readRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyRoute]);

  const navigateRoute = useCallback(
    (route: RouteState) => {
      const href = routeHref(route);
      if (window.location.pathname === href) {
        applyRoute(route);
        return;
      }
      const nextPosition = historyPositionRef.current + 1;
      window.history.pushState({ musicNavigationIndex: nextPosition }, '', href);
      historyPositionRef.current = nextPosition;
      setHistoryPosition(nextPosition);
      setHistoryLength(nextPosition);
      applyRoute(route);
    },
    [applyRoute]
  );

  const handleUndoNavigation = useCallback(() => window.history.back(), []);
  const handleRedoNavigation = useCallback(() => window.history.forward(), []);

  const handleTogglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinnedPlaylists: next }),
      }).catch(() => { });
      return next;
    });
  }, []);

  const handleToggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenPlaylists: next }),
      }).catch(() => { });
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlaylists(true);
    const url = navigator.onLine ? '/api/playlists?forceRefresh=1' : '/api/playlists';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.playlists?.length && navigator.onLine) {
          return fetch('/api/playlists')
            .then((r) => r.json())
            .then((d) => {
              if (!cancelled && d?.playlists) setPlaylists(d.playlists);
            });
        }
        if (data?.playlists) setPlaylists(data.playlists);
      })
      .catch(() => {
        if (cancelled) return;
        fetch('/api/playlists')
          .then((r) => r.json())
          .then((d) => {
            if (!cancelled && d?.playlists) setPlaylists(d.playlists);
          })
          .catch(() => { });
      })
      .finally(() => {
        if (!cancelled) setLoadingPlaylists(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectPlaylist = useCallback(
    (id: string) => {
      if (playlists.some((playlist) => playlist.id === id)) {
        navigateRoute({ kind: 'playlist', playlistId: id });
      }
    },
    [navigateRoute, playlists]
  );

  const handleOpenHiddenFolder = useCallback(() => {
    navigateRoute({ kind: 'hidden' });
  }, [navigateRoute]);

  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const handlePlay = useCallback((track: Track, newQueue: Track[], sourcePlaylistId?: string) => {
    setCurrentTrack(track);
    setQueue(newQueue);
    setActivePlaylistId(sourcePlaylistId ?? selectedPlaylist?.id ?? null);
    setShouldAutoplay(true);
  }, [selectedPlaylist?.id]);

  const handlePlayPlaylist = useCallback((playlistId: string) => {
    const tracks = Object.values(allTracks).filter((track) => track.playlistId === playlistId && track.downloaded);
    if (tracks.length > 0) {
      handlePlay(tracks[0], tracks, playlistId);
    } else {
      handleSelectPlaylist(playlistId);
    }
  }, [allTracks, handlePlay, handleSelectPlaylist]);

  const playingPlaylistId = activePlaylistId;

  const handleNext = useCallback(() => {
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex((t) => t.videoId === currentTrack.videoId);
    if (currentIndex === -1) return;
    if (repeatMode === 'one') {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }
      return;
    }
    setShouldAutoplay(true);
    if (isShuffle) {
      const remaining = queue.filter((_, idx) => idx !== currentIndex);
      if (remaining.length > 0) setCurrentTrack(remaining[Math.floor(Math.random() * remaining.length)]);
      return;
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) setCurrentTrack(queue[nextIndex]);
    else if (repeatMode === 'all') setCurrentTrack(queue[0]);
  }, [currentTrack, queue, isShuffle, repeatMode]);

  const handlePrev = useCallback(() => {
    if (!currentTrack || queue.length === 0) return;
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const currentIndex = queue.findIndex((t) => t.videoId === currentTrack.videoId);
    if (currentIndex > 0) {
      setShouldAutoplay(true);
      setCurrentTrack(queue[currentIndex - 1]);
    }
  }, [currentTrack, queue]);

  const handleToggleShuffle = useCallback(() => setIsShuffle((prev) => !prev), []);
  const handleToggleRepeat = useCallback(() => {
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const handleFullscreenPlayPause = useCallback(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleFullscreenVolumeChange = useCallback((nextVolume: number) => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (nextVolume > 0) lastAudibleVolumeRef.current = nextVolume;
    if (audio) audio.volume = nextVolume;
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
  }, []);

  const handleFullscreenMuteToggle = useCallback(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    const nextMuted = !isMuted;
    const nextVolume = nextMuted ? 0 : lastAudibleVolumeRef.current;
    if (audio) audio.volume = nextVolume;
    setIsMuted(nextMuted);
    setVolume(nextVolume);
  }, [isMuted]);

  const handleToggleQueue = useCallback(() => {
    if (isQueueOpen) {
      handleCloseQueue();
      return;
    }
    if (isLyricsOpen) {
      handleCloseLyrics();
      setTimeout(() => setIsQueueOpen(true), 240);
      return;
    }
    setIsQueueOpen(true);
  }, [isQueueOpen, isLyricsOpen, handleCloseQueue, handleCloseLyrics]);

  const handleToggleLyrics = useCallback(() => {
    if (isLyricsOpen) {
      handleCloseLyrics();
      return;
    }
    if (isQueueOpen) {
      handleCloseQueue();
      setTimeout(() => setIsLyricsOpen(true), 240);
      return;
    }
    setIsLyricsOpen(true);
  }, [isQueueOpen, isLyricsOpen, handleCloseQueue, handleCloseLyrics]);

  const handleAddToQueue = useCallback((track: Track) => {
    setQueue((prev) => [track, ...prev.filter((t) => t.videoId !== track.videoId)]);
    setCurrentTrack((prev) => prev ?? track);
  }, []);

  const handleReorderQueue = useCallback((fromVideoId: string, toVideoId: string) => {
    setQueue((prev) => {
      const fromIndex = prev.findIndex((track) => track.videoId === fromVideoId);
      const toIndex = prev.findIndex((track) => track.videoId === toVideoId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handlePlayNext = useCallback((track: Track) => {
    setQueue((prev) => {
      const withoutTrack = prev.filter((item) => item.videoId !== track.videoId);
      if (!currentTrack) return [...withoutTrack, track];
      const currentIndex = withoutTrack.findIndex((item) => item.videoId === currentTrack.videoId);
      if (currentIndex === -1) return [...withoutTrack, track];
      withoutTrack.splice(currentIndex + 1, 0, track);
      return withoutTrack;
    });
    setCurrentTrack((prev) => prev ?? track);
  }, [currentTrack]);

  const handleAddToPlaylist = useCallback(async (track: Track, playlistId: string) => {
    try {
      const response = await fetch('/api/playlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, videoId: track.videoId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to add song to playlist');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add song to playlist');
    }
  }, []);

  const handleRemoveFromPlaylist = useCallback((track: Track, playlistId: string) => {
    // Show undo banner immediately — actual API call is deferred 7s
    setUndoAction({ track, playlistId });
  }, []);

  const handleUndoRemove = useCallback(() => {
    if (!undoAction) return;
    // Cancel the pending API delete — no server call needed
    if (pendingDeleteRef.current) {
      window.clearTimeout(pendingDeleteRef.current.timeoutId);
      pendingDeleteRef.current = null;
    }
    const target = undoAction;
    setUndoAction(null);
    // Re-insert track into PlaylistView state at original position
    setRestoredTrack({ track: target.track, playlistId: target.playlistId, timestamp: Date.now() });
  }, [undoAction]);

  const handleSetSleepTimer = useCallback((minutes: number) => {
    setSleepTimerRequest({ type: 'set', minutes, id: Date.now() });
  }, []);

  const handleOpenSleepTimer = useCallback(() => {
    setSleepTimerRequest({ type: 'open', id: Date.now() });
  }, []);

  const handleRemoveFromQueue = useCallback((videoId: string) => {
    setQueue((prev) => prev.filter((t) => t.videoId !== videoId));
  }, []);

  const handleClearQueue = useCallback(() => {
    setQueue((prev) => {
      if (!currentTrack) return [];
      return prev.filter((t) => t.videoId === currentTrack.videoId);
    });
  }, [currentTrack]);

  const handleDownloadTrack = useCallback(async (track: Track) => {
    try {
      // Auto open download center modal in header when single song download starts
      setDownloadJobs((prev) => {
        const next = new Map(prev);
        const id = `track-${track.videoId}`;
        next.set(id, {
          playlistId: id,
          playlistTitle: track.title,
          total: 1,
          toDownload: 1,
          done: 0,
          status: 'running',
          errorCount: 0,
          startedAt: Date.now(),
        });
        return next;
      });

      const res = await fetch('/api/download/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: track.videoId, title: track.title, artist: track.artist }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setDownloadJobs((prev) => {
          const next = new Map(prev);
          const id = `track-${track.videoId}`;
          next.set(id, {
            playlistId: id,
            playlistTitle: track.title,
            total: 1,
            toDownload: 1,
            done: 0,
            status: 'error',
            errorCount: 1,
            startedAt: Date.now(),
          });
          return next;
        });
        throw new Error(data.error || 'Failed to download song');
      }

      setDownloadJobs((prev) => {
        const next = new Map(prev);
        const id = `track-${track.videoId}`;
        next.set(id, {
          playlistId: id,
          playlistTitle: track.title,
          total: 1,
          toDownload: 1,
          done: 100,
          status: 'done',
          errorCount: 0,
          startedAt: Date.now(),
        });
        return next;
      });
      // PlaylistView handles the optimistic track state update — no reload needed
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download song';
      if (msg.includes('internet') || msg.includes('offline') || msg.includes('ENOTFOUND') || msg.includes('fetch failed')) {
        setIsHardwareOffline(true);
        setIsOfflineMode(true);
      }
      alert(msg);
    }
  }, []);

  const handleDeleteTrack = useCallback(async (track: Track) => {
    try {
      const res = await fetch('/api/download/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: track.videoId, action: 'delete' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete download');
      // PlaylistView handles the optimistic track state update — no reload needed
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete download';
      if (msg.includes('internet') || msg.includes('offline') || msg.includes('ENOTFOUND') || msg.includes('fetch failed') || !navigator.onLine) {
        setIsHardwareOffline(true);
        setIsOfflineMode(true);
      }
      alert(msg);
    }
  }, []);

  // Called by PlaylistView after a track is deleted — stops the player if it was playing
  const handleTrackDeleted = useCallback((videoId: string) => {
    setCurrentTrack((prev) => {
      if (prev?.videoId === videoId) {
        setIsLyricsOpen(false);
        setIsQueueOpen(false);
        setIsFullscreenOpen(false);
        return null;
      }
      return prev;
    });
    setQueue((prev) => prev.filter((t) => t.videoId !== videoId));
  }, []);

  const handleDownload = useCallback(
    (playlistId: string) => {
      const pl = playlists.find((p) => p.id === playlistId);
      const title = pl ? pl.title : 'Playlist';
      if (isNativeHost()) {
        sendNativeDownloadRequest(playlistId);
        setDownloadJobs((prev) => {
          const next = new Map(prev);
          next.set(playlistId, { playlistId, playlistTitle: title, total: 0, toDownload: 0, done: 0, status: 'starting', errorCount: 0, startedAt: Date.now() });
          return next;
        });
        return;
      }
      if (downloadSources.current.has(playlistId)) downloadSources.current.get(playlistId)?.close();
      setDownloadJobs((prev) => {
        const next = new Map(prev);
        next.set(playlistId, { playlistId, playlistTitle: title, total: 0, toDownload: 0, done: 0, status: 'starting', errorCount: 0, startedAt: Date.now() });
        return next;
      });
      const es = new EventSource(`/api/download?playlistId=${playlistId}`);
      downloadSources.current.set(playlistId, es);
      es.onmessage = (e) => {
        try {
          const evt: DownloadProgressEvent = JSON.parse(e.data);
          setDownloadJobs((prev) => {
            const next = new Map(prev);
            const current = next.get(playlistId);
            if (!current) return prev;
            if (evt.type === 'start') next.set(playlistId, { ...current, status: 'running', total: evt.total || 0, toDownload: evt.toDownload || 0, errorCount: 0 });
            else if (evt.type === 'progress') {
              const isErr = evt.status === 'error';
              const errCount = isErr ? current.errorCount + 1 : current.errorCount;
              next.set(playlistId, {
                ...current,
                done: evt.current || current.done,
                toDownload: evt.total || current.toDownload,
                currentTitle: evt.title,
                currentArtist: evt.artist,
                errorCount: errCount,
              });
              // Dynamically notify UI when an individual song finishes downloading
              if (evt.status === 'done' && evt.videoId) {
                setLastDownloadedTrack({ videoId: evt.videoId, timestamp: Date.now() });
              }
            } else if (evt.type === 'complete') {
              next.set(playlistId, { ...current, status: 'done', done: evt.downloaded || current.done });
              es.close();
              downloadSources.current.delete(playlistId);
            } else if (evt.type === 'error') {
              next.set(playlistId, { ...current, status: 'error', errorCount: current.errorCount + 1 });
              es.close();
              downloadSources.current.delete(playlistId);
            }
            return next;
          });
        } catch { }
      };
      es.onerror = () => {
        setDownloadJobs((prev) => {
          const next = new Map(prev);
          const current = next.get(playlistId);
          if (current) next.set(playlistId, { ...current, status: 'error' });
          return next;
        });
        es.close();
        downloadSources.current.delete(playlistId);
      };
    },
    [playlists]
  );

  const allJobs = Array.from(downloadJobs.values());
  const activeDownloadCount = allJobs.filter((j) => j.status === 'running' || j.status === 'starting').length;

  const filteredPlaylists = searchQuery.trim()
    ? playlists.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : playlists;

  const globalSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return Object.values(allTracks).filter((track) => {
      const haystack = searchMode === 'artist' ? cleanArtistName(track.artist) : track.title;
      return haystack.toLowerCase().includes(q);
    });
  }, [allTracks, searchMode, searchQuery]);

  const handleTracksLoaded = useCallback((playlist: Playlist, tracks: Track[]) => {
    setAllTracks((prev) => {
      const next = { ...prev };
      for (const track of tracks) {
        next[track.videoId] = { ...track, playlistId: playlist.id, playlistTitle: playlist.title };
      }
      return next;
    });
    const thumbnailUrls = tracks.slice(0, 4).map((track) => track.thumbnailUrl).filter(Boolean);
    setPlaylists((prev) => prev.map((item) => item.id === playlist.id ? { ...item, thumbnailUrls } : item));
  }, []);

  const prefetchedPlaylistIds = useRef(new Set<string>());
  const artworkPrefetchIds = useRef(new Set<string>());

  useEffect(() => {
    if (playlists.length === 0) return;
    let cancelled = false;
    const loadPlaylistArtwork = async () => {
      const pending = playlists.filter((playlist) => !playlist.thumbnailUrls || playlist.thumbnailUrls.length < 4);
      for (const playlist of pending) {
        if (cancelled || artworkPrefetchIds.current.has(playlist.id)) continue;
        artworkPrefetchIds.current.add(playlist.id);
        try {
          const response = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}&limit=4`);
          const data = await response.json().catch(() => ({}));
          if (!cancelled && response.ok && Array.isArray(data.tracks)) {
            handleTracksLoaded(playlist, data.tracks as Track[]);
          }
        } catch {
          artworkPrefetchIds.current.delete(playlist.id);
        }
      }
    };
    void loadPlaylistArtwork();
    return () => { cancelled = true; };
  }, [handleTracksLoaded, playlists]);

  useEffect(() => {
    if (!searchQuery.trim() || playlists.length === 0) {
      setIsSearchIndexing(false);
      return;
    }
    let cancelled = false;

    const prefetchTracksForSearch = async () => {
      const missingPlaylists = playlists.filter((playlist) => !prefetchedPlaylistIds.current.has(playlist.id));
      if (missingPlaylists.length === 0) return;
      setIsSearchIndexing(true);
      for (const playlist of missingPlaylists) {
        if (cancelled || prefetchedPlaylistIds.current.has(playlist.id)) continue;
        prefetchedPlaylistIds.current.add(playlist.id);
        try {
          const response = await fetch(`/api/playlist?playlistId=${playlist.id}`);
          const data = await response.json();
          if (!cancelled && response.ok && Array.isArray(data.tracks)) {
            handleTracksLoaded(playlist, data.tracks as Track[]);
          }
        } catch {
          prefetchedPlaylistIds.current.delete(playlist.id);
        }
      }
      if (!cancelled) setIsSearchIndexing(false);
    };

    void prefetchTracksForSearch();
    return () => {
      cancelled = true;
    };
  }, [handleTracksLoaded, playlists, searchQuery]);

  const handleDeletePlaylist = useCallback(
    async (playlistId: string) => {
      try {
        const res = await fetch(`/api/playlist/delete?playlistId=${encodeURIComponent(playlistId)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
          setHiddenIds((prev) => prev.filter((id) => id !== playlistId));
          setPinnedIds((prev) => prev.filter((id) => id !== playlistId));
          if (selectedPlaylist?.id === playlistId) {
            setSelectedPlaylist(null);
          }
        } else {
          alert('Failed to delete playlist');
        }
      } catch {
        alert('Error deleting playlist');
      }
    },
    [selectedPlaylist]
  );

  const handlePushPlaylist = useCallback(async (playlist: Playlist) => {
    try {
      const res = await fetch(`/api/playlist/push?playlistId=${encodeURIComponent(playlist.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: playlist.title, description: playlist.description }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Successfully pushed playlist "${playlist.title}" to YouTube Music! (${data.addedCount}/${data.totalTracks} tracks added)`);
      } else {
        alert(data.error || 'Failed to push playlist');
      }
    } catch {
      alert('Error pushing playlist to YouTube Music');
    }
  }, []);

  const showGlobalSearch = searchQuery.trim().length > 0;

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      <Header
        user={user}
        activeDownloadCount={activeDownloadCount}
        downloadJobs={allJobs}
        onOpenPlaylist={handleSelectPlaylist}
        searchQuery={searchQuery}
        onSearchChange={(query) => navigateRoute(query.trim() ? { kind: 'search', query } : { kind: 'home' })}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
        onUndo={handleUndoNavigation}
        onRedo={handleRedoNavigation}
        canUndo={historyPosition > 0}
        canRedo={historyPosition < historyLength}
        isOfflineMode={isOfflineMode}
        isHardwareOffline={isHardwareOffline}
        onToggleOfflineMode={handleToggleOfflineMode}
        onHomeClick={() => {
          navigateRoute({ kind: 'home' });
        }}
      />

      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        <aside className="h-full shrink-0 border-r border-white/5 overflow-visible transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]" style={{ width: sidebarExpanded ? `${SIDEBAR_EXPANDED_WIDTH}%` : '85px' }}>
          <Sidebar
            playlists={playlists}
            selectedId={selectedPlaylist ? selectedPlaylist.id : showHiddenFolder ? '__hidden__' : null}
            pinnedIds={pinnedIds}
            hiddenIds={hiddenIds}
            playingPlaylistId={playingPlaylistId}
            isPlaybackActive={isPlaying}
            onSelect={handleSelectPlaylist}
            onTogglePin={handleTogglePin}
            onToggleHidden={handleToggleHidden}
            onOpenHiddenFolder={handleOpenHiddenFolder}
            onPlayPlaylist={handlePlayPlaylist}
            expanded={sidebarExpanded}
            onToggleExpanded={() => setSidebarExpanded((expanded) => !expanded)}
          />
        </aside>

        <div className="flex-1 min-w-0 h-full flex overflow-hidden">
          <div className="flex-1 min-w-0 h-full relative overflow-hidden flex flex-col">
            {loadingPlaylists ? (
              // Show the skeleton that matches where the user actually is
              initialRoute.kind === 'playlist' ? <PlaylistViewSkeleton /> : <PlaylistGridSkeleton />
            ) : showGlobalSearch ? (
              <GlobalSearchResults
                query={searchQuery}
                mode={searchMode}
                results={globalSearchResults}
                isIndexing={isSearchIndexing}
                onPlay={(track) => {
                  handlePlay(track, globalSearchResults as Track[]);
                  navigateRoute({ kind: 'search', query: searchQuery, songId: track.videoId });
                }}
              />
            ) : showHiddenFolder ? (
              <HiddenPlaylistsView
                playlists={playlists}
                hiddenIds={hiddenIds}
                onSelect={handleSelectPlaylist}
                onToggleHidden={handleToggleHidden}
                onDeletePlaylist={handleDeletePlaylist}
                onPushPlaylist={handlePushPlaylist}
              />
            ) : selectedPlaylist ? (
              <PlaylistView
                key={selectedPlaylist.id}
                playlist={selectedPlaylist}
                isPinned={pinnedIds.includes(selectedPlaylist.id)}
                isHidden={hiddenIds.includes(selectedPlaylist.id)}
                onPlay={(track, queue) => handlePlay(track, queue, selectedPlaylist.id)}
                onAddToQueue={handleAddToQueue}
                onPlayNext={handlePlayNext}
                onAddToPlaylist={handleAddToPlaylist}
                onRemoveFromPlaylist={handleRemoveFromPlaylist}
                onSetSleepTimer={handleSetSleepTimer}
                onOpenSleepTimer={handleOpenSleepTimer}
                playlists={playlists}
                onDownload={handleDownload}
                onDownloadTrack={handleDownloadTrack}
                onDeleteTrack={handleDeleteTrack}
                onTrackDeleted={handleTrackDeleted}
                onTogglePin={handleTogglePin}
                onToggleHidden={handleToggleHidden}
                onTracksLoaded={handleTracksLoaded}
                lastDownloadedTrack={lastDownloadedTrack}
                restoredTrack={restoredTrack}
                currentVideoId={currentTrack?.videoId}
                activePlaylistId={activePlaylistId}
              />
            ) : (
              <PlaylistGrid
                playlists={filteredPlaylists}
                pinnedIds={pinnedIds}
                hiddenIds={hiddenIds}
                onSelect={handleSelectPlaylist}
                onTogglePin={handleTogglePin}
              />
            )}
          </div>

          {isQueueOpen && (
            <>
              <ResizeDivider onDelta={(d) => setQueueWidth((w) => clamp(w - (d / Math.max(window.innerWidth, 1)) * 100, QUEUE_MIN, QUEUE_MAX))} />
              <div
                className={`h-full shrink-0 border-l border-[#00F2FE]/45 overflow-hidden ${isQueueClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'
                  }`}
                style={{ width: `${queueWidth}%` }}
              >
                <QueueDrawer
                  currentTrack={currentTrack}
                  queue={queue}
                  onClose={handleCloseQueue}
                  onPlayTrack={(t) => setCurrentTrack(t)}
                  onRemoveFromQueue={handleRemoveFromQueue}
                  onClearQueue={handleClearQueue}
                  onReorderQueue={handleReorderQueue}
                  playlists={playlists}
                  onPlayNext={handlePlayNext}
                  onAddToQueue={handleAddToQueue}
                  onAddToPlaylist={handleAddToPlaylist}
                  onSetSleepTimer={handleSetSleepTimer}
                  onOpenSleepTimer={handleOpenSleepTimer}
                />
              </div>
            </>
          )}

          {isLyricsOpen && (
            <>
              <ResizeDivider onDelta={(d) => setLyricsWidth((w) => clamp(w - (d / Math.max(window.innerWidth, 1)) * 100, LYRICS_MIN, LYRICS_MAX))} />
              <div
                className={`h-full shrink-0 border-l border-[#a855f7]/35 overflow-hidden ${isLyricsClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'
                  }`}
                style={{ width: `${lyricsWidth}%` }}
              >
                <LyricsDrawer
                  track={currentTrack}
                  currentTime={currentTime}
                  onClose={handleCloseLyrics}
                  onSeek={(secs) => {
                    const el = document.querySelector('audio') as HTMLAudioElement | null;
                    if (el) el.currentTime = secs;
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <PlayerBar
        track={currentTrack}
        queue={queue}
        onNext={handleNext}
        onPrev={handlePrev}
        onTrackEnd={handleNext}
        onToggleQueue={handleToggleQueue}
        onToggleLyrics={handleToggleLyrics}
        onToggleFullscreen={() => setIsFullscreenOpen(true)}
        onTimeUpdate={(t) => setCurrentTime(t)}
        resumeTime={savedSession?.track?.videoId === currentTrack?.videoId ? savedSession?.time ?? 0 : 0}
        autoPlay={shouldAutoplay}
        onStateChange={(state) => {
          setIsPlaying(state.isPlaying);
          setDuration(state.duration);
          setVolume(state.volume);
          setIsMuted(state.isMuted);
        }}
        isQueueOpen={isQueueOpen}
        isLyricsOpen={isLyricsOpen}
        isShuffle={isShuffle}
        repeatMode={repeatMode}
        onToggleShuffle={handleToggleShuffle}
        onToggleRepeat={handleToggleRepeat}
        sleepTimerTarget={currentTrack}
        sleepTimerRequest={sleepTimerRequest}
        isFullscreenOpen={isFullscreenOpen}
      />

      {undoAction && (
        <div className="fixed bottom-[112px] left-1/2 z-[120] flex -translate-x-1/2 items-center gap-4 rounded-xl border border-white/10 bg-[#292929] px-4 py-3 text-sm text-white shadow-2xl shadow-black/50">
          <span>Removed “{undoAction.track.title}” from the playlist</span>
          <button onClick={handleUndoRemove} className="rounded-md px-2 py-1 font-semibold text-[#00F2FE] hover:bg-white/10">Undo</button>
        </div>
      )}

      {(isFullscreenOpen || isFullscreenClosing) && currentTrack && (
        <ExpandedPlayerModal
          track={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          isShuffle={isShuffle}
          repeatMode={repeatMode}
          onPlayPause={handleFullscreenPlayPause}
          onNext={handleNext}
          onPrev={handlePrev}
          onSeek={(secs) => {
            const el = document.querySelector('audio') as HTMLAudioElement | null;
            if (el) el.currentTime = secs;
          }}
          onVolumeChange={handleFullscreenVolumeChange}
          onToggleMute={handleFullscreenMuteToggle}
          onToggleShuffle={handleToggleShuffle}
          onToggleRepeat={handleToggleRepeat}
          isClosing={isFullscreenClosing}
          onClose={handleCloseFullscreen}
          onStateChange={(state) => {
            setIsPlaying(state.isPlaying);
            setDuration(state.duration);
            setVolume(state.volume);
            setIsMuted(state.isMuted);
          }}
        />
      )}
    </div>
  );
}

function GlobalSearchResults({
  query,
  mode,
  results,
  isIndexing,
  onPlay,
}: {
  query: string;
  mode: SearchMode;
  results: Array<CachedTrack>;
  isIndexing: boolean;
  onPlay: (track: Track) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto px-8 py-8 scrollbar-thin animate-fadeIn">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.24em] text-white/35">Global Search</p>
        <h2 className="mt-2 text-2xl font-black text-white">
          {mode === 'artist' ? 'Artist' : 'Name'} results for "{query}"
        </h2>
        <p className="mt-1 text-sm text-white/40">
          {isIndexing ? 'Loading songs from your playlists...' : `${results.length} matching tracks`}
        </p>
      </div>

      <div className="space-y-2">
        {results.map((track) => (
          <button
            key={track.videoId}
            onClick={() => onPlay(track)}
            className="w-full flex items-center gap-4 rounded-3xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.06] transition-all duration-300 ease-out"
          >
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/5 shrink-0 border border-white/5">
              <img
                src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{track.title}</p>
              <p className="text-xs text-white/45 truncate mt-0.5">{cleanArtistName(track.artist)}</p>
            </div>
            <div className="hidden lg:block min-w-0 w-56">
              <p className="text-xs text-white/40 truncate">{track.playlistTitle}</p>
            </div>
            <div className="hidden md:block w-16 text-right text-xs text-white/35">
              {track.duration ? formatDuration(track.duration) : '—'}
            </div>
            <div className="shrink-0 text-white/25">
              <Play className="w-4 h-4" />
            </div>
          </button>
        ))}
        {results.length === 0 && !isIndexing && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center text-white/35">
            <Search className="w-5 h-5 mx-auto mb-3 text-white/20" />
            No matching tracks found in loaded playlists.
          </div>
        )}
      </div>
    </div>
  );
}
