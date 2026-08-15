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
import { getCachedPlaylistMemberships, primePlaylistMemberships, removePlaylistMembership } from './AddToPlaylistDropdown';

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
  activePlaylistId?: string | null;
  time: number;
  isPlaying?: boolean;
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
  const [playlistMutation, setPlaylistMutation] = useState<{ type: 'add' | 'remove'; track: Track; playlistId: string; timestamp: number } | null>(null);
  const [isSearchIndexing, setIsSearchIndexing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typedSearchInput, setTypedSearchInput] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('name');

  const [queueWidth, setQueueWidth] = useState(22);
  const [lyricsWidth, setLyricsWidth] = useState(24);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(savedSession?.track ?? null);
  const [queue, setQueue] = useState<Track[]>(savedSession?.queue ?? []);
  const [playbackHistory, setPlaybackHistory] = useState<Array<{ track: Track; queue: Track[]; activePlaylistId: string | null }>>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(() =>
    savedSession?.activePlaylistId ?? (() => {
      try {
        return localStorage.getItem('yt_active_playlist_id') || (initialRoute.kind === 'playlist' ? initialRoute.playlistId : null);
      } catch {
        return initialRoute.kind === 'playlist' ? initialRoute.playlistId : null;
      }
    })()
  );
  const [playlistScrollRequest, setPlaylistScrollRequest] = useState(0);
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
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('yt_sidebar_expanded') === 'true';
    } catch {
      return false;
    }
  });
  const [sleepTimerRequest, setSleepTimerRequest] = useState<{ type: 'open' | 'set'; minutes?: number; id: number } | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(() =>
    typeof window !== 'undefined' &&
    localStorage.getItem('yt_offline_mode') === 'true'
  );
  // isHardwareOffline reflects connectivity, independent of the manual offline toggle.
  const [isHardwareOffline, setIsHardwareOffline] = useState(() =>
    typeof window !== 'undefined' ? !navigator.onLine : false
  );

  const setOfflineMode = useCallback((value: boolean) => {
    setIsHardwareOffline(value);
  }, []);

  const apiFetch = useCallback(async (url: RequestInfo | URL, options?: RequestInit) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      // HTTP errors (401/403/404/500) are API/auth problems, not proof of being offline.
      if (!navigator.onLine || error instanceof TypeError) {
        setOfflineMode(true);
      }
      throw error;
    }
  }, [setOfflineMode]);

  useEffect(() => {
    let activeCheck: Promise<boolean> | null = null;
    let activeController: AbortController | null = null;

    const checkRealStatus = async (): Promise<boolean> => {
      if (activeCheck) return activeCheck;

      const check = (async () => {
        const controller = new AbortController();
        activeController = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), 3000);

        try {
          const request = (method: 'HEAD' | 'GET') => fetch('/api/ping', {
            method,
            cache: 'no-store',
            signal: controller.signal,
          });

          let response: Response;
          try {
            response = await request('HEAD');
            if (response.status === 405 || response.status === 501) {
              response = await request('GET');
            }
          } catch (error) {
            if (controller.signal.aborted) throw error;
            response = await request('GET');
          }

          const online = response.ok;
          if (!online) {
            setOfflineMode(true);
          } else {
            setIsHardwareOffline(false);
          }
          return online;
        } catch {
          setOfflineMode(true);
          return false;
        } finally {
          window.clearTimeout(timeoutId);
          if (activeController === controller) activeController = null;
        }
      })();

      activeCheck = check;
      try {
        return await check;
      } finally {
        if (activeCheck === check) activeCheck = null;
      }
    };

    const handleOnline = () => {
      if (!isOfflineMode) void checkRealStatus();
    };
    const handleOffline = () => {
      activeController?.abort();
      activeCheck = null;
      setOfflineMode(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isOfflineMode) {
        void checkRealStatus();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !isOfflineMode) void checkRealStatus();
    }, 5000);

    if (document.visibilityState === 'visible' && !isOfflineMode) void checkRealStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(heartbeatId);
      activeController?.abort();
    };
  }, [setOfflineMode, isOfflineMode]);

  const handleToggleOfflineMode = useCallback(() => {
    if (isHardwareOffline) return; // can't go online when hardware is offline
    setIsOfflineMode((prev) => {
      const next = !prev;
      localStorage.setItem('yt_offline_mode', String(next));
      return next;
    });
  }, [isHardwareOffline]);

  useEffect(() => {
    void fetch('/api/playlist/queue', { cache: 'no-store' }).catch(() => { });
  }, []);

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
      // Ping internet before firing the remove API call
      try {
        const pingRes = await fetch('/api/ping', { method: 'HEAD', cache: 'no-store' }).catch(() => null);
        if (!pingRes || !pingRes.ok) {
          alert('No internet connection. Could not remove "' + track.title + '" from the playlist.');
          return;
        }
        const response = await apiFetch('/api/playlist/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId, playlistItemId: track.playlistItemId, videoId: track.videoId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to remove song from playlist');
      } catch (error) {
        const memberships = getCachedPlaylistMemberships(track.videoId);
        memberships.add(playlistId);
        primePlaylistMemberships(track.videoId, memberships);
        setPlaylists((prev) => prev.map((playlist) => playlist.id === playlistId
          ? { ...playlist, trackCount: playlist.trackCount + 1 }
          : playlist));
        setRestoredTrack({ track, playlistId, timestamp: Date.now() });
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

  const [isPlaylistEditOrder, setIsPlaylistEditOrder] = useState(false);
  const [isPlaying, setIsPlaying] = useState(savedSession?.isPlaying ?? false);
  const [currentTime, setCurrentTime] = useState(savedSession?.time ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window === 'undefined') return savedSession?.volume ?? 1;
    try {
      const savedVolume = Number.parseFloat(localStorage.getItem('yt_playback_volume') ?? '');
      return Number.isFinite(savedVolume) ? Math.min(Math.max(savedVolume, 0), 1) : savedSession?.volume ?? 1;
    } catch {
      return savedSession?.volume ?? 1;
    }
  });
  const [isMuted, setIsMuted] = useState(savedSession?.isMuted ?? false);
  // volumeRef always mirrors the volume state so callbacks can read the latest
  // value without creating stale closures or depending on audio.volume (which
  // PlayerBar permanently keeps at 1.0 for its GainNode pipeline).
  const volumeRef = useRef(savedSession?.volume ?? 1);
  const lastAudibleVolumeRef = useRef(savedSession?.volume && savedSession.volume > 0 ? savedSession.volume : 1);
  const [shouldAutoplay, setShouldAutoplay] = useState(savedSession?.isPlaying ?? false);
  const [historyPosition, setHistoryPosition] = useState(0);
  const [historyLength, setHistoryLength] = useState(0);
  const historyPositionRef = useRef(0);

  useEffect(() => {
    volumeRef.current = volume;
    if (volume > 0) lastAudibleVolumeRef.current = volume;
  }, [volume]);


  useEffect(() => {
    // Hidden & pinned playlists load from DB account
    apiFetch('/api/user/settings')
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
      const savedMuted = localStorage.getItem('yt_playback_muted');
      const savedQueueWidth = localStorage.getItem('yt_queue_width_pct');
      const savedLyricsWidth = localStorage.getItem('yt_lyrics_width_pct');
      if (savedShuffle) setIsShuffle(JSON.parse(savedShuffle));
      if (savedRepeat) setRepeatMode(JSON.parse(savedRepeat));
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
      localStorage.setItem('yt_sidebar_expanded', String(sidebarExpanded));
    } catch { }
  }, [sidebarExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'yt_playback_session',
        JSON.stringify({
          track: currentTrack,
          queue,
          activePlaylistId,
          time: currentTime,
          isPlaying,
          isShuffle,
          repeatMode,
          volume,
          isMuted,
          isQueueOpen,
          isLyricsOpen,
        } satisfies PlaybackSession)
      );
    } catch { }
  }, [currentTrack, queue, activePlaylistId, currentTime, isPlaying, isShuffle, repeatMode, volume, isMuted, isQueueOpen, isLyricsOpen]);

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
    apiFetch('/api/user/settings')
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
      const q = route.kind === 'search' ? route.query : '';
      setSearchQuery(q);
      setTypedSearchInput(q);
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
      apiFetch('/api/user/settings', {
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
      apiFetch('/api/user/settings', {
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
    const url = (navigator.onLine && !isOfflineMode) ? '/api/playlists?forceRefresh=1' : '/api/playlists';
    apiFetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.playlists?.length && navigator.onLine && !isOfflineMode) {
          return apiFetch('/api/playlists')
            .then((r) => r.json())
            .then((d) => {
              if (!cancelled && d?.playlists) setPlaylists(d.playlists);
            });
        }
        if (data?.playlists) setPlaylists(data.playlists);
      })
      .catch(() => {
        if (cancelled) return;
        apiFetch('/api/playlists')
          .then((r) => r.json())
          .then((d) => {
            if (!cancelled && d?.playlists) setPlaylists(d.playlists);
          })
          .catch(() => { });
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPlaylists(false);
          applyRoute(readRoute());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOfflineMode]);

  const handleOpenHiddenFolder = useCallback(() => {
    navigateRoute({ kind: 'hidden' });
  }, [navigateRoute]);

  const [playlistGlowDimmed, setPlaylistGlowDimmed] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const handleOpenPlayingPlaylist = useCallback(() => {
    const targetPlaylistId = (currentTrack as any)?.sourcePlaylistId || activePlaylistId;
    if (!targetPlaylistId) return;
    // Glow gone for 100ms and coming back
    setPlaylistGlowDimmed(true);
    setTimeout(() => setPlaylistGlowDimmed(false), 100);

    setPlaylistScrollRequest((request) => request + 1);
    navigateRoute({ kind: 'playlist', playlistId: targetPlaylistId });
  }, [activePlaylistId, currentTrack, navigateRoute]);

  const handleSelectPlaylist = useCallback(
    (id: string) => {
      if (!playlists.some((playlist) => playlist.id === id)) return;

      const targetPlaylistId = (currentTrack as any)?.sourcePlaylistId || activePlaylistId;
      if (id === targetPlaylistId) {
        handleOpenPlayingPlaylist();
      } else {
        navigateRoute({ kind: 'playlist', playlistId: id });
      }
    },
    [activePlaylistId, currentTrack, handleOpenPlayingPlaylist, navigateRoute, playlists]
  );

  const hasAutoOpenedPlaylistRef = useRef(false);
  useEffect(() => {
    if (hasAutoOpenedPlaylistRef.current || !currentTrack || !activePlaylistId || loadingPlaylists) return;
    if (selectedPlaylist && selectedPlaylist.id === activePlaylistId) return;
    if (!playlists.some((playlist) => playlist.id === activePlaylistId)) return;

    // Verify current playing track was actually started/played from the active playlist
    const targetPlaylistId = (currentTrack as any)?.sourcePlaylistId || activePlaylistId;
    const isSongInActivePlaylist = (currentTrack as any).playlistId === targetPlaylistId;

    if (!isSongInActivePlaylist) return;

    const frameId = window.requestAnimationFrame(() => {
      if (hasAutoOpenedPlaylistRef.current) return;
      hasAutoOpenedPlaylistRef.current = true;
      handleOpenPlayingPlaylist();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activePlaylistId, allTracks, currentTrack, handleOpenPlayingPlaylist, loadingPlaylists, playlists, selectedPlaylist]);

  const handlePlay = useCallback((track: Track, newQueue: Track[], sourcePlaylistId?: string) => {
    const nextPlaylistId = sourcePlaylistId ?? track.sourcePlaylistId ?? track.playlistId ?? selectedPlaylist?.id ?? null;
    const queuedTracks = newQueue.map((t) => ({ ...t, sourcePlaylistId: nextPlaylistId || undefined }));

    setPlaybackHistory((prev) => {
      if (!currentTrack || currentTrack.videoId === track.videoId) return prev;
      return [...prev, { track: currentTrack, queue: queue.length > 0 ? queue : [currentTrack], activePlaylistId: activePlaylistId }];
    });

    const trackWithSource = {
      ...track,
      sourcePlaylistId: nextPlaylistId || undefined,
      playlistId: track.playlistId ?? (nextPlaylistId || undefined),
    };
    setCurrentTrack(trackWithSource);
    setQueue(queuedTracks);
    setActivePlaylistId(nextPlaylistId);
    try {
      if (nextPlaylistId) localStorage.setItem('yt_active_playlist_id', nextPlaylistId);
      else localStorage.removeItem('yt_active_playlist_id');
    } catch { }
    setShouldAutoplay(true);
  }, [activePlaylistId, currentTrack, queue, selectedPlaylist?.id]);

  const handlePlayPlaylist = useCallback(async (playlistId: string) => {
    let tracks = Object.values(allTracks).filter((track) => track.playlistId === playlistId);
    if (tracks.length === 0) {
      const response = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlistId)}`);
      const data = await response.json().catch(() => ({}));
      tracks = Array.isArray(data.tracks) ? data.tracks : [];
      if (tracks.length > 0) {
        setAllTracks((prev) => ({ ...prev, ...Object.fromEntries(tracks.map((track: Track) => [track.videoId, { ...track, playlistId, playlistTitle: playlists.find((playlist) => playlist.id === playlistId)?.title || '' }])) }));
      }
    }
    if (tracks.length > 0) handlePlay(tracks[0], tracks, playlistId);
  }, [allTracks, handlePlay, playlists]);

  const playingPlaylistId = activePlaylistId;
  const canGoToPrevious = Boolean(
    currentTrack &&
    (
      playbackHistory.length > 0 ||
      (queue.findIndex((t) => t.videoId === currentTrack.videoId) > 0)
    )
  );

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
      if (remaining.length > 0) {
        const nextTrack = remaining[Math.floor(Math.random() * remaining.length)];
        setCurrentTrack({ ...nextTrack, sourcePlaylistId: (currentTrack as any).sourcePlaylistId || activePlaylistId || undefined });
      }
      return;
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex];
      setCurrentTrack({ ...nextTrack, sourcePlaylistId: (currentTrack as any).sourcePlaylistId || activePlaylistId || undefined });
    } else if (repeatMode === 'all') {
      const playlistStart = activePlaylistId
        ? Object.values(allTracks)
          .filter((track) => track.playlistId === activePlaylistId && track.downloaded)
          .sort((a, b) => a.position - b.position)[0]
        : undefined;
      const target = playlistStart ?? queue[0];
      if (target) {
        setCurrentTrack({ ...target, sourcePlaylistId: (currentTrack as any).sourcePlaylistId || activePlaylistId || undefined });
      }
    }
  }, [activePlaylistId, allTracks, currentTrack, queue, isShuffle, repeatMode]);

  const handlePrev = useCallback(() => {
    if (!currentTrack) return;
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const historyEntry = playbackHistory[playbackHistory.length - 1];
    if (historyEntry) {
      setShouldAutoplay(true);
      setPlaybackHistory((prev) => prev.slice(0, -1));
      const previousTrack = {
        ...historyEntry.track,
        sourcePlaylistId: historyEntry.activePlaylistId || (currentTrack as any).sourcePlaylistId || activePlaylistId || undefined,
      };
      setCurrentTrack(previousTrack);
      setQueue(historyEntry.queue.length > 0 ? historyEntry.queue : [historyEntry.track]);
      setActivePlaylistId(historyEntry.activePlaylistId ?? activePlaylistId ?? null);
      if (historyEntry.activePlaylistId) {
        try {
          localStorage.setItem('yt_active_playlist_id', historyEntry.activePlaylistId);
        } catch { }
      }
      return;
    }

    const currentIndex = queue.findIndex((t) => t.videoId === currentTrack.videoId);
    if (currentIndex > 0) {
      setShouldAutoplay(true);
      const prevTrack = queue[currentIndex - 1];
      setCurrentTrack({ ...prevTrack, sourcePlaylistId: (currentTrack as any).sourcePlaylistId || activePlaylistId || undefined });
    }
  }, [activePlaylistId, currentTrack, playbackHistory, queue]);

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
    if (nextVolume > 0) lastAudibleVolumeRef.current = nextVolume;
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
  }, []);

  const handleFullscreenMuteToggle = useCallback(() => {
    const nextMuted = !isMuted;
    const nextVolume = nextMuted ? 0 : lastAudibleVolumeRef.current;
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

  const handleReorderQueue = useCallback((fromVideoId: string, toVideoId: string, insertBefore: boolean) => {
    setQueue((prev) => {
      const fromIndex = prev.findIndex((track) => track.videoId === fromVideoId);
      const toIndex = prev.findIndex((track) => track.videoId === toVideoId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      let targetIdx = insertBefore ? toIndex : toIndex + 1;
      if (fromIndex < targetIdx) targetIdx -= 1;
      if (fromIndex === targetIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIdx, 0, moved);
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

  const handleAddToPlaylist = useCallback((track: Track, playlistId: string) => {
    const targetPl = playlists.find((p) => p.id === playlistId);
    const plTitle = targetPl ? targetPl.title : 'Playlist';
    const previousMemberships = getCachedPlaylistMemberships(track.videoId);
    const alreadyExists = previousMemberships.has(playlistId);

    // Optimistically update every visible surface immediately.
    const nextMemberships = new Set(previousMemberships);
    nextMemberships.add(playlistId);
    primePlaylistMemberships(track.videoId, nextMemberships);
    setPlaylistMutation({ type: 'add', track, playlistId, timestamp: Date.now() });
    setAllTracks((prev) => ({
      ...prev,
      [track.videoId]: { ...track, playlistId, playlistTitle: plTitle },
    }));
    if (!alreadyExists) {
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p))
      );
    }
    setFeedbackToast(alreadyExists ? `"${track.title}" is already in ${plTitle}` : `Added "${track.title}" to ${plTitle}`);
    setTimeout(() => setFeedbackToast(null), 3000);

    // Fire-and-forget — backend processes asynchronously via operation queue.
    apiFetch('/api/playlist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId, videoId: track.videoId, track }),
    }).catch(() => {
      // Rollback UI on network-level failure (operation engine handles retries).
      primePlaylistMemberships(track.videoId, previousMemberships);
      setPlaylistMutation({ type: 'remove', track, playlistId, timestamp: Date.now() });
      if (!alreadyExists) {
        setPlaylists((prev) =>
          prev.map((p) => (p.id === playlistId ? { ...p, trackCount: Math.max(0, p.trackCount - 1) } : p))
        );
      }
    });
  }, [apiFetch, playlists]);

  const handleRemoveFromPlaylist = useCallback((track: Track, playlistId: string) => {
    removePlaylistMembership(track.videoId, playlistId);
    setPlaylistMutation({ type: 'remove', track, playlistId, timestamp: Date.now() });
    setPlaylists((prev) => prev.map((playlist) => playlist.id === playlistId
      ? { ...playlist, trackCount: Math.max(0, playlist.trackCount - 1) }
      : playlist));
    setAllTracks((prev) => {
      if (prev[track.videoId]?.playlistId !== playlistId) return prev;
      const next = { ...prev };
      delete next[track.videoId];
      return next;
    });
    if (currentTrack?.videoId === track.videoId && activePlaylistId === playlistId) {
      setCurrentTrack(null);
      setQueue((prev) => prev.filter((item) => item.videoId !== track.videoId));
    }
    // Show undo banner immediately — actual API call is deferred 7s
    setUndoAction({ track, playlistId });
  }, [activePlaylistId, currentTrack]);

  const handleUndoRemove = useCallback(() => {
    if (!undoAction) return;
    // Cancel the pending API delete — no server call needed
    if (pendingDeleteRef.current) {
      window.clearTimeout(pendingDeleteRef.current.timeoutId);
      pendingDeleteRef.current = null;
    }
    const target = undoAction;
    setUndoAction(null);
    const memberships = getCachedPlaylistMemberships(target.track.videoId);
    memberships.add(target.playlistId);
    primePlaylistMemberships(target.track.videoId, memberships);
    setPlaylistMutation({ type: 'add', track: target.track, playlistId: target.playlistId, timestamp: Date.now() });
    setPlaylists((prev) => prev.map((playlist) => playlist.id === target.playlistId
      ? { ...playlist, trackCount: playlist.trackCount + 1 }
      : playlist));
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
      // Ping before starting any download
      const pingRes = await fetch('/api/ping', { method: 'HEAD', cache: 'no-store' }).catch(() => null);
      if (!pingRes || !pingRes.ok) {
        alert('No internet connection. Cannot download "' + track.title + '" while offline.');
        return;
      }
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

      const res = await apiFetch('/api/download/track', {
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
      }
      alert(msg);
    }
  }, []);

  const handleDeleteTrack = useCallback(async (track: Track) => {
    try {
      const res = await apiFetch('/api/download/track', {
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

  const playlistRecommendations = useMemo(() => {
    if (!selectedPlaylist) return [];
    return Object.values(allTracks)
      .filter((track) => track.playlistId !== selectedPlaylist.id && track.videoId)
      .slice(0, 6);
  }, [allTracks, selectedPlaylist]);

  const globalSearchResults = useMemo(() => {
    const q = (typedSearchInput || searchQuery).trim().toLowerCase();
    if (!q) return [];
    return Object.values(allTracks).filter((track) => {
      const haystack = searchMode === 'artist' ? cleanArtistName(track.artist) : track.title;
      return haystack.toLowerCase().includes(q);
    });
  }, [allTracks, searchMode, typedSearchInput, searchQuery]);

  const waitingForInitialPlaylist = initialRoute.kind === 'playlist' && !selectedPlaylist && playlists.length > 0;

  const handleTracksLoaded = useCallback((playlist: Playlist, tracks: Track[]) => {
    setAllTracks((prev) => {
      const next = { ...prev };
      for (const track of tracks) {
        next[track.videoId] = { ...track, playlistId: playlist.id, playlistTitle: playlist.title };
      }
      return next;
    });
    const artworkTracks = tracks.slice(0, 4);
    const thumbnailUrls = artworkTracks.map((track) => track.thumbnailUrl).filter(Boolean);
    const thumbnailVideoIds = artworkTracks.map((track) => track.videoId);
    setPlaylists((prev) => prev.map((item) => item.id === playlist.id ? { ...item, trackCount: tracks.length, thumbnailUrls, thumbnailVideoIds } : item));
  }, []);

  const prefetchedPlaylistIds = useRef(new Set<string>());
  const artworkPrefetchIds = useRef(new Set<string>());

  useEffect(() => {
    if (playlists.length === 0) return;
    let cancelled = false;
    const loadPlaylistArtwork = async () => {
      const pending = playlists.filter((playlist) => !playlist.thumbnailUrls || playlist.thumbnailUrls.length < 4);
      await Promise.all(pending.map(async (playlist) => {
        if (cancelled || artworkPrefetchIds.current.has(playlist.id)) return;
        artworkPrefetchIds.current.add(playlist.id);
        try {
          const response = await apiFetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}&limit=4`);
          const data = await response.json().catch(() => ({}));
          if (!cancelled && response.ok && Array.isArray(data.tracks)) {
            // Only update artwork thumbnails — do NOT overwrite trackCount with a partial result.
            const artworkTracks = (data.tracks as Track[]).slice(0, 4);
            const thumbnailUrls = artworkTracks.map((t) => t.thumbnailUrl).filter(Boolean);
            const thumbnailVideoIds = artworkTracks.map((t) => t.videoId);
            // Force the server to download/cache each local artwork even when
            // the playlist itself is never opened.
            await Promise.all(artworkTracks.map((track) => fetch(`/api/thumbnail?videoId=${encodeURIComponent(track.videoId)}&url=${encodeURIComponent(track.thumbnailUrl)}&crop=2`).catch(() => null)));
            setPlaylists((prev) => prev.map((item) =>
              item.id === playlist.id && (!item.thumbnailUrls || item.thumbnailUrls.length < 4)
                ? { ...item, thumbnailUrls, thumbnailVideoIds }
                : item
            ));
          }
        } catch {
          artworkPrefetchIds.current.delete(playlist.id);
        }
      }));
    };
    void loadPlaylistArtwork();
    return () => { cancelled = true; };
  }, [apiFetch, playlists]);

  useEffect(() => {
    if (!searchQuery.trim() || playlists.length === 0) {
      setIsSearchIndexing(false);
      return;
    }
    let cancelled = false;

    const prefetchTracksForSearch = async () => {
      const missingPlaylists = playlists.filter((playlist) => !prefetchedPlaylistIds.current.has(playlist.id));
      if (missingPlaylists.length === 0) {
        setIsSearchIndexing(false);
        return;
      }
      setIsSearchIndexing(true);
      try {
        for (const playlist of missingPlaylists) {
          if (cancelled) break;
          if (prefetchedPlaylistIds.current.has(playlist.id)) continue;
          prefetchedPlaylistIds.current.add(playlist.id);
          try {
            const response = await apiFetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}`);
            const data = await response.json().catch(() => ({}));
            if (!cancelled && response.ok && Array.isArray(data.tracks)) {
              handleTracksLoaded(playlist, data.tracks as Track[]);
            }
          } catch {
            prefetchedPlaylistIds.current.delete(playlist.id);
          }
        }
      } finally {
        if (!cancelled) setIsSearchIndexing(false);
      }
    };

    void prefetchTracksForSearch();
    return () => {
      cancelled = true;
      setIsSearchIndexing(false);
    };
  }, [apiFetch, handleTracksLoaded, playlists, searchQuery]);

  const handleDeletePlaylist = useCallback(
    async (playlistId: string) => {
      try {
        const res = await apiFetch(`/api/playlist/delete?playlistId=${encodeURIComponent(playlistId)}`, {
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
    const res = await apiFetch(`/api/playlist/push?playlistId=${encodeURIComponent(playlist.id)}`, {
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

  // ─── Volume step helper (±10%, clamped 0–1) ──────────────────────────────
  const handleVolumeStep = useCallback((direction: 'up' | 'down') => {
    const step = 0.1;
    // Read from volumeRef.current (PlayerBar keeps audio.volume at 1.0 for Web Audio GainNode)
    const currentVol = volumeRef.current;
    const next = direction === 'up'
      ? Math.min(1, Math.round((currentVol + step) * 100) / 100)
      : Math.max(0, Math.round((currentVol - step) * 100) / 100);
    if (next > 0) lastAudibleVolumeRef.current = next;
    setVolume(next);
    setIsMuted(next === 0);
  }, []);

  // ─── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    const isEditableTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof Element)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!document.hasFocus()) return;
      if (isEditableTarget(e.target)) return;

      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Space → play / pause
      if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const audio = document.querySelector('audio') as HTMLAudioElement | null;
        if (!audio) return;
        if (audio.paused) {
          audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        } else {
          audio.pause();
          setIsPlaying(false);
        }
        return;
      }

      // Cmd/Ctrl + Right → next track
      if (mod && e.code === 'ArrowRight' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleNext();
        return;
      }

      // Cmd/Ctrl + Left → previous track
      if (mod && e.code === 'ArrowLeft' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlePrev();
        return;
      }

      // Cmd/Ctrl + Up → volume up (preventDefault stops browser address-bar focus / page scroll)
      if (mod && e.code === 'ArrowUp' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        handleVolumeStep('up');
        return;
      }

      // Cmd/Ctrl + Down → volume down (preventDefault stops page scroll)
      if (mod && e.code === 'ArrowDown' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        handleVolumeStep('down');
        return;
      }

      // M or Ctrl/Cmd + M → toggle mute
      if (e.code === 'KeyM' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleFullscreenMuteToggle();
        return;
      }

      // Ctrl + Shift + Down → toggle mute (Win alternate)
      if (!isMac && e.ctrlKey && e.shiftKey && e.code === 'ArrowDown' && !e.altKey) {
        e.preventDefault();
        handleFullscreenMuteToggle();
        return;
      }

      // Win: Ctrl+S / Mac: Alt+S → toggle shuffle
      const shuffleKey = isMac ? (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyS')
                                : (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyS');
      if (shuffleKey) {
        e.preventDefault();
        handleToggleShuffle();
        return;
      }

      // Win: Ctrl+R / Mac: Alt+R → toggle repeat
      const repeatKey = isMac ? (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyR')
                               : (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyR');
      if (repeatKey) {
        e.preventDefault();
        handleToggleRepeat();
        return;
      }

      // Cmd/Ctrl + K → focus search / open quick search
      if (mod && e.code === 'KeyK' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="earch"]');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Cmd/Ctrl + N → create new playlist (placeholder — focuses sidebar add button)
      if (mod && e.code === 'KeyN' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const addBtn = document.querySelector<HTMLButtonElement>('button[aria-label="Add playlist"]');
        if (addBtn) addBtn.click();
        return;
      }

      // Alt + Shift + H → go to home
      if (e.altKey && e.shiftKey && e.code === 'KeyH' && !mod) {
        e.preventDefault();
        navigateRoute({ kind: 'home' });
        return;
      }

      // Alt + Shift + Q → go to queue
      if (e.altKey && e.shiftKey && e.code === 'KeyQ' && !mod) {
        e.preventDefault();
        handleToggleQueue();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleNext,
    handlePrev,
    handleVolumeStep,
    handleFullscreenMuteToggle,
    handleToggleShuffle,
    handleToggleRepeat,
    handleToggleQueue,
    navigateRoute,
  ]);

  return (
    <div className="music-shell h-screen w-screen flex flex-col overflow-hidden">
      <Header
        user={user}
        activeDownloadCount={activeDownloadCount}
        downloadJobs={allJobs}
        onOpenPlaylist={handleSelectPlaylist}
        searchQuery={typedSearchInput || searchQuery}
        onSearchChange={(query) => setTypedSearchInput(query)}
        onCommitSearch={(query) => {
          const trimmed = query.trim();
          setTypedSearchInput(trimmed);
          setSearchQuery(trimmed);
          navigateRoute(trimmed ? { kind: 'search', query: trimmed } : { kind: 'home' });
        }}
        searchResults={globalSearchResults}
        onResultClick={(track) => {
          if (track.downloaded) {
            // Find the playlist this track belongs to and play it
            const playlistId = track.sourcePlaylistId ?? track.playlistId ?? null;
            if (playlistId) {
              const tracksInPlaylist = Object.values(allTracks)
                .filter((t) => t.playlistId === playlistId && t.downloaded)
                .sort((a, b) => a.position - b.position);
              const queue = tracksInPlaylist.length > 0 ? tracksInPlaylist : [track];
              handlePlay(track, queue, playlistId ?? undefined);
            } else {
              handlePlay(track, [track]);
            }
          } else {
            // Navigate to the playlist containing this track
            const playlistId = track.playlistId;
            if (playlistId) navigateRoute({ kind: 'playlist', playlistId });
          }
        }}
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

      <div className="music-content flex-1 flex overflow-hidden min-h-0 relative">
        <aside className="music-sidebar h-full shrink-0 overflow-visible transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]" style={{ width: sidebarExpanded ? `${SIDEBAR_EXPANDED_WIDTH}%` : '85px' }}>
          <Sidebar
            playlists={playlists}
            selectedId={selectedPlaylist ? selectedPlaylist.id : showHiddenFolder ? '__hidden__' : null}
            pinnedIds={pinnedIds}
            hiddenIds={hiddenIds}
            playingPlaylistId={playingPlaylistId}
            isPlaybackActive={isPlaying}
            isGlowDimmed={playlistGlowDimmed}
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
            {showGlobalSearch ? (
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
            ) : loadingPlaylists ? (
              selectedPlaylist ? <PlaylistViewSkeleton /> : <PlaylistGridSkeleton />
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
                scrollToTrackRequest={playlistScrollRequest}
                isHardwareOffline={isHardwareOffline}
                onEditOrderChange={setIsPlaylistEditOrder}
                recommendations={playlistRecommendations}
                playlistMutation={playlistMutation}
              />
            ) : (
              <PlaylistGrid
                playlists={filteredPlaylists}
                pinnedIds={pinnedIds}
                hiddenIds={hiddenIds}
                onSelect={handleSelectPlaylist}
                onTogglePin={handleTogglePin}
                onPlay={handlePlayPlaylist}
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
                  isHardwareOffline={isHardwareOffline}
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
        canPrev={canGoToPrevious}
        canNext={queue.length > 0 && currentTrack ? queue.findIndex((t) => t.videoId === currentTrack.videoId) >= 0 && queue.findIndex((t) => t.videoId === currentTrack.videoId) < queue.length - 1 : false}
        onTrackEnd={handleNext}
        onToggleQueue={handleToggleQueue}
        onToggleLyrics={handleToggleLyrics}
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        selectedPlaylistId={selectedPlaylist?.id ?? null}
        isPlaylistEditOrder={isPlaylistEditOrder}
        onAddToPlaylist={handleAddToPlaylist}
        onRemoveFromPlaylist={handleRemoveFromPlaylist}
        onOpenPlaylist={
          !isPlaylistEditOrder &&
          activePlaylistId &&
          playlists.some((playlist) => playlist.id === activePlaylistId)
            ? handleOpenPlayingPlaylist
            : undefined
        }
        onToggleFullscreen={() => setIsFullscreenOpen(true)}
        isOffline={isOfflineMode || isHardwareOffline}
        playlistMutation={playlistMutation}
        onTimeUpdate={(t) => setCurrentTime(t)}
        resumeTime={savedSession?.track?.videoId === currentTrack?.videoId ? savedSession?.time ?? 0 : 0}
        autoPlay={shouldAutoplay}
        onStateChange={(state) => {
          setIsPlaying(state.isPlaying);
          setShouldAutoplay(state.isPlaying);
          setDuration(state.duration);
        }}
        volume={volume}
        isMuted={isMuted}
        onVolumeChange={(v) => {
          if (isMuted) setIsMuted(false);
          setVolume(v);
        }}
        onMuteChange={(m) => setIsMuted(m)}
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

      {feedbackToast && (
        <div className="fixed bottom-[112px] left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#00F2FE]/30 bg-[#161616] px-4 py-3 text-sm font-medium text-white shadow-2xl shadow-black/80 animate-fadeIn">
          <span className="h-2 w-2 rounded-full bg-[#00F2FE] shadow-[0_0_8px_#00F2FE]" />
          <span>{feedbackToast}</span>
        </div>
      )}

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
