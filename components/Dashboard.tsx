'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Playlist, Track, UserProfile, RepeatMode, DownloadJob, DownloadProgressEvent } from '@/types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { PlaylistGrid, PlaylistGridSkeleton } from './PlaylistGrid';
import { PlaylistView, PlaylistViewSkeleton } from './PlaylistView';
import { PlaylistManagementView } from './HiddenPlaylistsView';
import { PlayerBar } from './PlayerBar';
import { SettingsPanel } from './SettingsPanel';
import { QueueDrawer } from './QueueDrawer';
import { LyricsDrawer } from './LyricsDrawer';
import { ExpandedPlayerModal } from './ExpandedPlayerModal';
import { ResizeDivider } from './ResizeDivider';
import { Search, Play, Plus, X, Download, Loader2, ChevronDown, ChevronRight, Music } from 'lucide-react';
import { cleanArtistName, formatDuration, getThumbnailUrl, getTrackThumbnailUrl } from '@/lib/ytmusicFormat';
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

type SearchMode = 'auto' | 'spotify' | 'ytmusic' | 'local';
type CachedTrack = Track & { playlistId: string; playlistTitle: string };
type RouteState =
  | { kind: 'home' }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'management' }
  | { kind: 'search'; query: string; songId?: string };
type PlaybackSession = {
  track: Track | null;
  queue: Track[];
  queuePosition?: number;
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
  // Playlist management temporarily on standby.
  // if (parts[0] === 'management' || parts[0] === 'hidden') return { kind: 'management' };
  if (parts[0] === 'search' && parts[1]) {
    return { kind: 'search', query: parts[1], songId: parts[2] === 'song' && parts[3] ? parts[3] : undefined };
  }
  return { kind: 'home' };
}

function routeHref(route: RouteState) {
  if (route.kind === 'playlist') return `/playlist/${encodeURIComponent(route.playlistId)}`;
  // Playlist management temporarily on standby.
  // if (route.kind === 'management') return '/management';
  if (route.kind === 'search') {
    const base = `/search/${encodeURIComponent(route.query)}`;
    return route.songId ? `${base}/song/${encodeURIComponent(route.songId)}` : base;
  }
  return '/';
}

export function Dashboard({ user }: Props) {
  const savedSessionRef = useRef<PlaybackSession | null>(readPlaybackSession());
  const savedSession = savedSessionRef.current;
  // Read the initial URL route once synchronously â€” used to pick the right skeleton before playlists load
  const [initialRoute] = useState<RouteState>(() => (typeof window !== 'undefined' ? readRoute() : { kind: 'home' }));
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const playlistsRef = useRef<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [playlistOrder, setPlaylistOrder] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [importedPlaylistIds, setImportedPlaylistIds] = useState<string[]>([]);
  const [pendingImportIds, setPendingImportIds] = useState<string[]>([]);
  const [showPlaylistManagement, setShowPlaylistManagement] = useState(false);
  const [allTracks, setAllTracks] = useState<Record<string, CachedTrack>>({});
  const [lastDownloadedTrack, setLastDownloadedTrack] = useState<{ videoId: string; timestamp: number } | null>(null);
  const [restoredTrack, setRestoredTrack] = useState<{ track: Track; playlistId: string; timestamp: number } | null>(null);
  const [playlistMutation, setPlaylistMutation] = useState<{ type: 'add' | 'remove'; track: Track; playlistId: string; timestamp: number } | null>(null);
  const [isSearchIndexing, setIsSearchIndexing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typedSearchInput, setTypedSearchInput] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  // Online search results â€” fetched from the dual provider search engine when the user commits a search. The renderer
  // only receives normalized Track objects (no tokens, no secrets).
  const [onlineSearchResults, setOnlineSearchResults] = useState<Track[]>([]);
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [onlineSearchError, setOnlineSearchError] = useState('');

  const [queueWidth, setQueueWidth] = useState(QUEUE_MAX);
  const [lyricsWidth, setLyricsWidth] = useState(LYRICS_MAX);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(savedSession?.track ?? null);
  const [queue, setQueue] = useState<Track[]>(savedSession?.queue ?? []);
  // `queue` is the complete playback sequence.  Everything before this cursor
  // is history and everything after it is still upcoming, so duplicate tracks
  // remain distinct entries rather than being identified by videoId.
  const [queuePosition, setQueuePosition] = useState(() => {
    const savedPosition = savedSession?.queuePosition;
    if (typeof savedPosition === 'number' && savedPosition >= 0 && savedPosition < (savedSession?.queue.length ?? 0)) return savedPosition;
    return savedSession?.track ? Math.max(0, savedSession.queue.findIndex((track) => track.videoId === savedSession.track?.videoId)) : 0;
  });
  const [navigation, setNavigation] = useState<{ direction: 'next' | 'prev'; tick: number } | null>(null);
  const queueRef = useRef(queue);
  const unshuffledQueueRef = useRef<Track[]>(queue);
  const queuePositionRef = useRef(queuePosition);
  const currentTrackRef = useRef(currentTrack);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queuePositionRef.current = queuePosition; }, [queuePosition]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState('');
  // Bulk import queue: each entry is a URL with optional preview data.
  type PreviewTrack = { title: string; artist: string; duration?: number; videoId?: string; thumbnailUrl?: string };
  type ImportEntry = { url: string; title?: string; coverUrl?: string; tracks?: PreviewTrack[]; previewing?: boolean; previewOpen?: boolean; error?: string; isPublic?: boolean };
  const [importQueue, setImportQueue] = useState<ImportEntry[]>([]);
  const [importingAll, setImportingAll] = useState(false);
  const handleOpenImportModal = useCallback(() => {
    setImportUrl('');
    setImportError('');
    setImportQueue([]);
    setIsImportModalOpen(true);
  }, []);
  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreenClosing(true);
    setTimeout(() => {
      setIsFullscreenOpen(false);
      setIsFullscreenClosing(false);
    }, 300);
  }, []);
  const [sidebarExpanded, setSidebarExpanded] = useState(() =>
    typeof window === 'undefined' ? true : localStorage.getItem('yt_sidebar_expanded') !== 'false'
  );
  const [sleepTimerRequest, setSleepTimerRequest] = useState<{ type: 'open' | 'set'; minutes?: number; id: number } | null>(null);

  useEffect(() => { playlistsRef.current = playlists; }, [playlists]);

  const apiFetch = useCallback(async (url: RequestInfo | URL, options?: RequestInit) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  }, []);

  // Add a URL to the import queue and immediately fetch preview.
  const handleAddUrlToQueue = useCallback(() => {
    const url = importUrl.trim();
    if (!url) return;
    setImportError('');
    // Prevent duplicates in the queue.
    if (importQueue.some((entry) => entry.url === url)) {
      setImportError('This URL is already in the queue.');
      return;
    }
    // Add entry with previewing=true and auto-expand, then fetch preview.
    setImportQueue((prev) => [...prev, { url, previewing: true, previewOpen: true }]);
    setImportUrl('');
    // Fetch preview immediately.
    (async () => {
      try {
        const res = await fetch('/api/playlist/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Preview failed');
        setImportQueue((prev) => prev.map((e) => e.url === url ? { ...e, title: data.title, coverUrl: data.coverUrl, tracks: data.tracks, previewing: false, isPublic: data.isPublic !== false, error: data.isPublic === false ? 'This playlist is not public. Make it public on Spotify to import.' : undefined } : e));
      } catch (e) {
        setImportQueue((prev) => prev.map((entry) => entry.url === url ? { ...entry, previewing: false, error: e instanceof Error ? e.message : 'Preview failed' } : entry));
      }
    })();
  }, [importUrl, importQueue]);

  // Toggle preview expand/collapse (data already loaded on add).
  const handleTogglePreview = useCallback((url: string) => {
    setImportQueue((prev) => prev.map((entry) => entry.url === url ? { ...entry, previewOpen: !entry.previewOpen } : entry));
  }, []);

  // Retry preview for a failed entry (e.g. after playlist is made public).
  const handleRetryPreview = useCallback((url: string) => {
    setImportQueue((prev) => prev.map((entry) => entry.url === url ? { ...entry, previewing: true, error: undefined } : entry));
    (async () => {
      try {
        const res = await fetch('/api/playlist/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Preview failed');
        setImportQueue((prev) => prev.map((e) => e.url === url ? { ...e, title: data.title, coverUrl: data.coverUrl, tracks: data.tracks, previewing: false, isPublic: data.isPublic !== false, error: data.isPublic === false ? 'This playlist is not public. Make it public on Spotify to import.' : undefined } : e));
      } catch (e) {
        setImportQueue((prev) => prev.map((entry) => entry.url === url ? { ...entry, previewing: false, error: e instanceof Error ? e.message : 'Preview failed' } : entry));
      }
    })();
  }, []);

  // Remove a URL from the import queue.
  const handleRemoveImportEntry = useCallback((url: string) => {
    setImportQueue((prev) => prev.filter((entry) => entry.url !== url));
  }, []);

  // Finalize: import all queued playlists (skip entries that are not public).
  const handleImportAll = useCallback(async () => {
    const importable = importQueue.filter((entry) => entry.isPublic !== false && !entry.error);
    if (importable.length === 0) return;
    setImportingAll(true);
    setImportError('');
    const importedIds: string[] = [];
    let lastError = '';
    for (const entry of importable) {
      try {
        const res = await apiFetch('/api/playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'import', url: entry.url }),
        });
        const data = await res.json();
        if (data.playlist) {
          importedIds.push(data.playlist.id);
          setPlaylists((prev) => prev.some((p) => p.id === data.playlist.id) ? prev : [data.playlist, ...prev]);
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Import failed';
      }
    }
    // Persist all imported playlist IDs.
    if (importedIds.length > 0) {
      setImportedPlaylistIds((prev) => {
        const next = [...prev, ...importedIds.filter((id) => !prev.includes(id))];
        apiFetch('/api/user/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importedPlaylists: next }),
        }).catch(() => {});
        return next;
      });
      // Refresh full playlist list.
      apiFetch('/api/playlists').then((r) => r.json()).then((d) => {
        if (Array.isArray(d?.playlists) && d.playlists.length > 0) {
          setPlaylists(d.playlists);
          playlistsRef.current = d.playlists;
        }
      }).catch(() => {});
    }
    if (lastError) {
      setImportError(lastError);
    } else {
      setIsImportModalOpen(false);
      setImportQueue([]);
    }
    setImportingAll(false);
  }, [apiFetch, importQueue]);


  useEffect(() => {
    if (!currentTrack) {
      setIsLyricsOpen(false);
      setIsQueueOpen(false);
      setIsFullscreenOpen(false);
    }
  }, [currentTrack]);

  const [undoAction, setUndoAction] = useState<{ track: Track; playlistId: string } | null>(null);
  useEffect(() => {
    if (!undoAction) return;
    const timeoutId = window.setTimeout(() => setUndoAction(null), 3000);
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
  // Do not let first-render defaults overwrite persisted player settings before
  // the localStorage hydration effect has finished.
  const [localSettingsHydrated, setLocalSettingsHydrated] = useState(false);
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
        if (Array.isArray(data?.playlistOrder)) {
          setPlaylistOrder(data.playlistOrder);
        }
        if (Array.isArray(data?.hiddenPlaylists)) setHiddenIds(data.hiddenPlaylists);
        if (Array.isArray(data?.importedPlaylists)) setImportedPlaylistIds(data.importedPlaylists);
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
    setLocalSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem('yt_playback_shuffle', JSON.stringify(isShuffle));
    } catch { }
  }, [isShuffle, localSettingsHydrated]);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem('yt_playback_repeat', JSON.stringify(repeatMode));
    } catch { }
  }, [repeatMode, localSettingsHydrated]);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem('yt_playback_volume', String(volume));
    } catch { }
  }, [volume, localSettingsHydrated]);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem('yt_playback_muted', JSON.stringify(isMuted));
    } catch { }
  }, [isMuted, localSettingsHydrated]);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem('yt_queue_width_pct', String(queueWidth));
    } catch { }
  }, [queueWidth, localSettingsHydrated]);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem('yt_lyrics_width_pct', String(lyricsWidth));
    } catch { }
  }, [lyricsWidth, localSettingsHydrated]);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem('yt_sidebar_expanded', String(sidebarExpanded));
    } catch { }
  }, [sidebarExpanded, localSettingsHydrated]);

  useEffect(() => {
    if (!localSettingsHydrated) return;
    try {
      localStorage.setItem(
        'yt_playback_session',
        JSON.stringify({
          track: currentTrack,
          queue,
          queuePosition,
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
  }, [currentTrack, queue, queuePosition, activePlaylistId, currentTime, isPlaying, isShuffle, repeatMode, volume, isMuted, isQueueOpen, isLyricsOpen, localSettingsHydrated]);

  const [downloadJobs, setDownloadJobs] = useState<Map<string, DownloadJob>>(new Map());
  const downloadSources = useRef<Map<string, EventSource>>(new Map());

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
      // Playlist management temporarily on standby â€” never activate it.
      setShowPlaylistManagement(false);
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
    const url = '/api/playlists?forceRefresh=1';
    apiFetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.playlists?.length) {
          return apiFetch('/api/playlists')
            .then((r) => r.json())
            .then((d) => {
              // Do not replace a valid library with a transient empty response.
              if (!cancelled && Array.isArray(d?.playlists) && d.playlists.length > 0 &&
                (playlistsRef.current.length === 0 || d.playlists.length >= playlistsRef.current.length)) {
                setPlaylists(d.playlists);
                playlistsRef.current = d.playlists;
              }
            });
        }
        if (Array.isArray(data?.playlists) && data.playlists.length > 0 &&
          (playlistsRef.current.length === 0 || data.playlists.length >= playlistsRef.current.length)) {
          setPlaylists(data.playlists);
          playlistsRef.current = data.playlists;
        }
      })
      .catch(() => {
        if (cancelled) return;
        apiFetch('/api/playlists')
          .then((r) => r.json())
          .then((d) => {
            if (!cancelled && Array.isArray(d?.playlists) && d.playlists.length > 0 &&
              (playlistsRef.current.length === 0 || d.playlists.length >= playlistsRef.current.length)) {
              setPlaylists(d.playlists);
              playlistsRef.current = d.playlists;
            }
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
  }, []);

  // Download all metadata thumbnails on app launch so playlist view only uses local images.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/download-metadata-images', { method: 'POST' }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenHiddenFolder = useCallback(() => {
    // Playlist management temporarily on standby â€” no-op.
  }, []);

  const handleToggleImport = useCallback((id: string) => {
    setPendingImportIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      return next;
    });
  }, []);

  const handlePinnedOrderChange = useCallback((ids: string[]) => {
    // Keep the pin state visible while persisting its reordered sequence.
    setPinnedIds(ids);
    pendingPinnedOrderRef.current = ids;
  }, []);

  const pendingPinnedOrderRef = useRef<string[] | null>(null);
  const handlePlaylistOrderChange = useCallback((ids: string[]) => {
    setPlaylistOrder(ids);
    const pinnedPlaylists = pendingPinnedOrderRef.current;
    pendingPinnedOrderRef.current = null;
    apiFetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistOrder: ids, ...(pinnedPlaylists ? { pinnedPlaylists } : {}) }),
    }).catch(() => { });
  }, []);

  const handleUnpinnedOrderChange = useCallback((ids: string[]) => {
    void apiFetch('/api/user/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenPinnedPlaylists: ids }),
    }).catch(() => { });
  }, [apiFetch]);

  const handleImportImmediate = useCallback(async (id: string) => {
    const removing = importedPlaylistIds.includes(id);
    const next = importedPlaylistIds.includes(id)
      ? importedPlaylistIds.filter((item) => item !== id)
      : [...importedPlaylistIds, id];
    setImportedPlaylistIds(next);
    if (removing && ((currentTrack as any)?.sourcePlaylistId === id || activePlaylistId === id)) {
      setCurrentTrack(null);
      currentTrackRef.current = null;
      setQueue([]);
      setQueuePosition(0);
      setIsPlaying(false);
      setIsQueueOpen(false);
      setIsLyricsOpen(false);
    }
    await apiFetch('/api/user/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ importedPlaylists: next }) }).catch(() => {});
    if (next.includes(id)) await apiFetch(`/api/playlist?playlistId=${encodeURIComponent(id)}&forceRefresh=1`).catch(() => null);
    else await apiFetch(`/api/playlist/delete?playlistId=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
  }, [activePlaylistId, apiFetch, currentTrack, importedPlaylistIds]);

  const handleDoneImport = useCallback(async () => {
    const next = [...pendingImportIds];
    setImportedPlaylistIds(next);
    await apiFetch('/api/user/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ importedPlaylists: next }) }).catch(() => {});
    await Promise.all(next.map((id) => apiFetch(`/api/playlist?playlistId=${encodeURIComponent(id)}&forceRefresh=1`).catch(() => null)));
    setPendingImportIds([]);
    navigateRoute({ kind: 'home' });
  }, [apiFetch, navigateRoute, pendingImportIds]);

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
    const baseQueue = newQueue.map((t) => ({ ...t, sourcePlaylistId: nextPlaylistId || undefined }));
    unshuffledQueueRef.current = baseQueue;
    let queuedTracks = baseQueue;
    if (isShuffle && baseQueue.length > 1) {
      const selected = baseQueue.find((item) => item.videoId === track.videoId) || baseQueue[0];
      const upcoming = baseQueue.filter((item) => item.videoId !== selected.videoId);
      for (let index = upcoming.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [upcoming[index], upcoming[swapIndex]] = [upcoming[swapIndex], upcoming[index]];
      }
      queuedTracks = [selected, ...upcoming];
    }

    const trackWithSource = {
      ...track,
      sourcePlaylistId: nextPlaylistId || undefined,
      playlistId: track.playlistId ?? (nextPlaylistId || undefined),
    };
    const requestedIndex = isShuffle ? 0 : Math.max(0, newQueue.indexOf(track), newQueue.findIndex((item) => item.videoId === track.videoId));
    const queueWithCurrent = queuedTracks.length > 0 ? queuedTracks : [trackWithSource];
    const position = Math.min(requestedIndex, queueWithCurrent.length - 1);
    queueWithCurrent[position] = trackWithSource;
    queueRef.current = queueWithCurrent;
    queuePositionRef.current = position;
    currentTrackRef.current = trackWithSource;
    setCurrentTrack(trackWithSource);
    setQueue(queueWithCurrent);
    setQueuePosition(position);
    setActivePlaylistId(nextPlaylistId);
    try {
      if (nextPlaylistId) localStorage.setItem('yt_active_playlist_id', nextPlaylistId);
      else localStorage.removeItem('yt_active_playlist_id');
    } catch { }
    setShouldAutoplay(true);
  }, [isShuffle, selectedPlaylist?.id]);

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

  // Shuffle play a playlist: enable shuffle, then play from a random track.
  // The shuffle flag is set BEFORE handlePlay so handlePlay's own shuffle
  // logic reshuffles the upcoming queue around the chosen starting track.
  const handleShufflePlayPlaylist = useCallback(async (playlistId: string) => {
    let tracks = Object.values(allTracks).filter((track) => track.playlistId === playlistId);
    if (tracks.length === 0) {
      const response = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlistId)}`);
      const data = await response.json().catch(() => ({}));
      tracks = Array.isArray(data.tracks) ? data.tracks : [];
      if (tracks.length > 0) {
        setAllTracks((prev) => ({ ...prev, ...Object.fromEntries(tracks.map((track: Track) => [track.videoId, { ...track, playlistId, playlistTitle: playlists.find((playlist) => playlist.id === playlistId)?.title || '' }])) }));
      }
    }
    if (tracks.length === 0) return;
    if (!isShuffle) setIsShuffle(true);
    const startTrack = tracks[Math.floor(Math.random() * tracks.length)];
    handlePlay(startTrack, tracks, playlistId);
  }, [allTracks, handlePlay, isShuffle, playlists]);

  const playingPlaylistId = activePlaylistId;
  const moveToQueuePosition = useCallback((position: number, tracks = queueRef.current) => {
    const nextTrack = tracks[position];
    if (!nextTrack) return;
    // Update refs before React schedules a render so rapid media-key/button
    // presses always advance from the last requested position.
    queueRef.current = tracks;
    queuePositionRef.current = position;
    const trackWithSource = { ...nextTrack, sourcePlaylistId: nextTrack.sourcePlaylistId || activePlaylistId || undefined };
    currentTrackRef.current = trackWithSource;
    setQueue(tracks);
    setQueuePosition(position);
    setCurrentTrack(trackWithSource);
    setCurrentTime(0);
    setShouldAutoplay(true);
  }, [activePlaylistId]);

  const canGoToPrevious = Boolean(currentTrack && (queuePosition > 0 || currentTime > 3));
  const canGoToNext = Boolean(currentTrack && (queuePosition < queue.length - 1 || repeatMode === 'all'));

  const handleNext = useCallback(() => {
    const tracks = queueRef.current;
    const position = queuePositionRef.current;
    if (!currentTrackRef.current || tracks.length === 0) return;
    if (repeatMode === 'one') {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (audio) { audio.currentTime = 0; void audio.play(); }
      return;
    }

    if (position < tracks.length - 1) {
      // When moving forward after Previous, this is deliberately the adjacent
      // entry in the existing sequence, never a newly shuffled replacement.
      setNavigation({ direction: 'next', tick: Date.now() });
      moveToQueuePosition(position + 1);
    } else if (repeatMode === 'all') {
      setNavigation({ direction: 'next', tick: Date.now() });
      moveToQueuePosition(0);
    }
  }, [moveToQueuePosition, repeatMode]);

  const handlePrev = useCallback(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (!currentTrackRef.current) return;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const position = queuePositionRef.current;
    if (position > 0) {
      setNavigation({ direction: 'prev', tick: Date.now() });
      moveToQueuePosition(position - 1);
    }
  }, [moveToQueuePosition]);

  const handleToggleShuffle = useCallback(() => {
    setIsShuffle((enabled) => {
      const nextEnabled = !enabled;
      if (nextEnabled) {
        const position = queuePositionRef.current;
        const tracks = queueRef.current;
        const upcoming = tracks.slice(position + 1);
        for (let index = upcoming.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [upcoming[index], upcoming[swapIndex]] = [upcoming[swapIndex], upcoming[index]];
        }
        const shuffled = [...tracks.slice(0, position + 1), ...upcoming];
        queueRef.current = shuffled;
        setQueue(shuffled);
      } else {
        const original = unshuffledQueueRef.current;
        const currentId = currentTrackRef.current?.videoId;
        if (original.length > 0 && currentId) {
          const position = Math.max(0, original.findIndex((item) => item.videoId === currentId));
          queueRef.current = original;
          queuePositionRef.current = position;
          setQueue(original);
          setQueuePosition(position);
        }
      }
      return nextEnabled;
    });
  }, []);
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
    if (isFullscreenOpen) {
      handleCloseFullscreen();
      return;
    }
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
  }, [isFullscreenOpen, isQueueOpen, isLyricsOpen, handleCloseFullscreen, handleCloseQueue, handleCloseLyrics]);

  const handleToggleLyrics = useCallback(() => {
    if (isFullscreenOpen) {
      handleCloseFullscreen();
      return;
    }
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
  }, [isFullscreenOpen, isQueueOpen, isLyricsOpen, handleCloseFullscreen, handleCloseQueue, handleCloseLyrics]);

  const handleAddToQueue = useCallback((track: Track) => {
    const tracks = [...queueRef.current];
    const insertAt = currentTrackRef.current ? queuePositionRef.current + 1 : 0;
    tracks.splice(insertAt, 0, track);
    queueRef.current = tracks;
    setQueue(tracks);
    if (!currentTrackRef.current) moveToQueuePosition(0, tracks);
  }, [moveToQueuePosition]);

  const handleReorderQueue = useCallback((fromIndex: number, toIndex: number, insertBefore: boolean) => {
    const tracks = [...queueRef.current];
    if (fromIndex <= queuePositionRef.current || toIndex <= queuePositionRef.current || fromIndex === toIndex) return;
    let targetIndex = insertBefore ? toIndex : toIndex + 1;
    if (fromIndex < targetIndex) targetIndex -= 1;
    if (fromIndex === targetIndex) return;
    const [moved] = tracks.splice(fromIndex, 1);
    tracks.splice(targetIndex, 0, moved);
    queueRef.current = tracks;
    setQueue(tracks);
  }, []);

  const handlePlayNext = useCallback((track: Track) => {
    const tracks = [...queueRef.current];
    const insertAt = currentTrackRef.current ? queuePositionRef.current + 1 : tracks.length;
    tracks.splice(insertAt, 0, track);
    queueRef.current = tracks;
    setQueue(tracks);
    if (!currentTrackRef.current) moveToQueuePosition(0, tracks);
  }, [moveToQueuePosition]);

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

    // Fire-and-forget â€” backend processes asynchronously via operation queue.
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
    // Enqueue the remote removal immediately, matching add behavior. The
    // operation engine persists and retries it in the background.
    apiFetch('/api/playlist/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId, playlistItemId: track.playlistItemId, videoId: track.videoId }),
    }).catch((error) => {
      const memberships = getCachedPlaylistMemberships(track.videoId);
      memberships.add(playlistId);
      primePlaylistMemberships(track.videoId, memberships);
      setPlaylistMutation({ type: 'add', track, playlistId, timestamp: Date.now() });
      setPlaylists((prev) => prev.map((playlist) => playlist.id === playlistId
        ? { ...playlist, trackCount: playlist.trackCount + 1 }
        : playlist));
      setRestoredTrack({ track, playlistId, timestamp: Date.now() });
      alert(error instanceof Error ? error.message : 'Failed to remove song from playlist');
    });
    setUndoAction({ track, playlistId });
  }, [activePlaylistId, apiFetch, currentTrack]);

  const handleUndoRemove = useCallback(() => {
    if (!undoAction) return;
    const target = undoAction;
    setUndoAction(null);
    const memberships = getCachedPlaylistMemberships(target.track.videoId);
    memberships.add(target.playlistId);
    primePlaylistMemberships(target.track.videoId, memberships);
    void handleAddToPlaylist(target.track, target.playlistId);
  }, [handleAddToPlaylist, undoAction]);

  const handleSetSleepTimer = useCallback((minutes: number) => {
    setSleepTimerRequest({ type: 'set', minutes, id: Date.now() });
  }, []);

  const handleOpenSleepTimer = useCallback(() => {
    setSleepTimerRequest({ type: 'open', id: Date.now() });
  }, []);

  const handleRemoveFromQueue = useCallback((queueIndex: number) => {
    if (queueIndex <= queuePositionRef.current) return;
    const tracks = [...queueRef.current];
    tracks.splice(queueIndex, 1);
    queueRef.current = tracks;
    setQueue(tracks);
  }, []);

  const handleClearQueue = useCallback(() => {
    const tracks = currentTrackRef.current ? queueRef.current.slice(0, queuePositionRef.current + 1) : [];
    queueRef.current = tracks;
    setQueue(tracks);
  }, []);

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
      // PlaylistView handles the optimistic track state update â€” no reload needed
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download song';
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
      // PlaylistView handles the optimistic track state update â€” no reload needed
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete download';
      alert(msg);
    }
  }, [apiFetch]);

  // Called by PlaylistView after a track is deleted â€” stops the player if it was playing
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

  const importedPlaylists = playlists.filter((playlist) => importedPlaylistIds.includes(playlist.id));
  const orderedImportedPlaylists = [...importedPlaylists].sort((a, b) => {
    const ai = playlistOrder.indexOf(a.id); const bi = playlistOrder.indexOf(b.id);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  const filteredPlaylists = searchQuery.trim()
    ? orderedImportedPlaylists.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : orderedImportedPlaylists;

  const playlistRecommendations = useMemo(() => {
    if (!selectedPlaylist) return [];
    return Object.values(allTracks)
      .filter((track) => track.playlistId !== selectedPlaylist.id && track.videoId)
      .slice(0, 6);
  }, [allTracks, selectedPlaylist]);

  const globalSearchResults = useMemo(() => {
    const q = (typedSearchInput || searchQuery).trim().toLowerCase();
    if (!q) return [];
    // Local library search â€” matches against both title and artist regardless
    // of the online source mode (auto/spotify/ytmusic). The mode selector
    // only affects the online search, not the local library filter.
    return Object.values(allTracks).filter((track) => {
      const titleMatch = track.title.toLowerCase().includes(q);
      const artistMatch = cleanArtistName(track.artist).toLowerCase().includes(q);
      return titleMatch || artistMatch;
    });
  }, [allTracks, typedSearchInput, searchQuery]);

  const waitingForInitialPlaylist = initialRoute.kind === 'playlist' && !selectedPlaylist && playlists.length > 0;

  const handleTracksLoaded = useCallback((playlist: Playlist, tracks: Track[]) => {
    // A transient empty response must not erase a playlist that is already
    // hydrated; an actually empty playlist remains valid on first load.
    if (tracks.length === 0 && playlist.trackCount > 0) return;
    setAllTracks((prev) => {
      const next = { ...prev };
      for (const track of tracks) {
        const key = track.videoId || track.sourceTrackId || track.title;
        next[key] = { ...track, playlistId: playlist.id, playlistTitle: playlist.title };
      }
      return next;
    });
    const artworkTracks = tracks.slice(0, 4);
    const thumbnailUrls = artworkTracks.map((track) => getTrackThumbnailUrl(track));
    const thumbnailVideoIds = artworkTracks.map((track) => track.videoId || track.sourceTrackId || '');
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
          if (!cancelled && response.ok && Array.isArray(data.tracks) && data.tracks.length > 0) {
            const artworkTracks = (data.tracks as Track[]).slice(0, 4);
            const thumbnailUrls = artworkTracks.map((t) => getTrackThumbnailUrl(t));
            const thumbnailVideoIds = artworkTracks.map((t) => t.videoId || t.sourceTrackId || '');
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
            if (!cancelled && response.ok && Array.isArray(data.tracks) && data.tracks.length > 0) {
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

  // Online search â€” when the local library has no matches, query the dual
    // Provider search engine using the selected
  // mode (auto/spotify/ytmusic). Results are normalized Track objects; the
  // renderer never sees tokens or secrets. In 'auto' mode both sources run
  // in parallel, results are deduplicated, and Spotify takes priority.
  useEffect(() => {
    const q = (typedSearchInput || searchQuery).trim();
    if (!q) {
      setOnlineSearchResults([]);
      setOnlineSearching(false);
      setOnlineSearchError('');
      return;
    }
    // Only hit the online sources when the local library has no matches â€”
    // avoids redundant API calls and respects the "local first" principle.
    if (globalSearchResults.length > 0) {
      setOnlineSearchResults([]);
      setOnlineSearching(false);
      setOnlineSearchError('');
      return;
    }
    if (searchMode === 'local') {
      setOnlineSearchResults([]);
      setOnlineSearching(false);
      setOnlineSearchError('');
      return;
    }

    let cancelled = false;
    setOnlineSearching(true);
    setOnlineSearchError('');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(searchMode)}&limit=20`,
          { cache: 'no-store' },
        );
        if (cancelled) return;
        if (!res.ok) {
          const failure = await res.json().catch(() => ({}));
          setOnlineSearchResults([]);
          setOnlineSearchError(typeof failure?.error === 'string' ? failure.error : 'Search is unavailable right now.');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setOnlineSearchResults(Array.isArray(data.tracks) ? data.tracks : []);
      } catch {
        if (!cancelled) {
          setOnlineSearchResults([]);
          setOnlineSearchError('Search is unavailable right now.');
        }
      } finally {
        if (!cancelled) setOnlineSearching(false);
      }
    }, 350); // debounce â€” avoids hammering the online sources on every keystroke

    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedSearchInput, searchQuery, globalSearchResults.length, searchMode]);

  const handleDeletePlaylist = useCallback(
    async (playlistId: string) => {
      try {
        const res = await apiFetch(`/api/playlist/delete?playlistId=${encodeURIComponent(playlistId)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setImportedPlaylistIds((prev) => {
            const next = prev.filter((id) => id !== playlistId);
            apiFetch('/api/user/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ importedPlaylists: next }) }).catch(() => {});
            return next;
          });
          setHiddenIds((prev) => prev.filter((id) => id !== playlistId));
          setPinnedIds((prev) => prev.filter((id) => id !== playlistId));
          if (selectedPlaylist?.id === playlistId) {
            setSelectedPlaylist(null);
          }
        } else {
          alert('Failed to remove playlist');
        }
      } catch {
        alert('Error removing playlist');
      }
    },
    [apiFetch, selectedPlaylist]
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

  // â”€â”€â”€ Volume step helper (Â±10%, clamped 0â€“1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Global keyboard shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      // Space â†’ play / pause
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

      // Cmd/Ctrl + Right â†’ next track
      if (mod && e.code === 'ArrowRight' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleNext();
        return;
      }

      // Cmd/Ctrl + Left â†’ previous track
      if (mod && e.code === 'ArrowLeft' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlePrev();
        return;
      }

      // Cmd/Ctrl + Up â†’ volume up (preventDefault stops browser address-bar focus / page scroll)
      if (mod && e.code === 'ArrowUp' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        handleVolumeStep('up');
        return;
      }

      // Cmd/Ctrl + Down â†’ volume down (preventDefault stops page scroll)
      if (mod && e.code === 'ArrowDown' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        handleVolumeStep('down');
        return;
      }

      // M or Ctrl/Cmd + M â†’ toggle mute
      if (e.code === 'KeyM' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleFullscreenMuteToggle();
        return;
      }

      // Ctrl + Shift + Down â†’ toggle mute (Win alternate)
      if (!isMac && e.ctrlKey && e.shiftKey && e.code === 'ArrowDown' && !e.altKey) {
        e.preventDefault();
        handleFullscreenMuteToggle();
        return;
      }

      // Win: Ctrl+S / Mac: Alt+S â†’ toggle shuffle
      const shuffleKey = isMac ? (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyS')
                                : (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyS');
      if (shuffleKey) {
        e.preventDefault();
        handleToggleShuffle();
        return;
      }

      // Win: Ctrl+R / Mac: Alt+R â†’ toggle repeat
      const repeatKey = isMac ? (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyR')
                               : (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyR');
      if (repeatKey) {
        e.preventDefault();
        handleToggleRepeat();
        return;
      }

      // Cmd/Ctrl + K â†’ focus search / open quick search
      if (mod && e.code === 'KeyK' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="earch"]');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Cmd/Ctrl + N â†’ create new playlist (placeholder â€” focuses sidebar add button)
      if (mod && e.code === 'KeyN' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const addBtn = document.querySelector<HTMLButtonElement>('button[aria-label="Add playlist"]');
        if (addBtn) addBtn.click();
        return;
      }

      // Alt + Shift + H â†’ go to home
      if (e.altKey && e.shiftKey && e.code === 'KeyH' && !mod) {
        e.preventDefault();
        navigateRoute({ kind: 'home' });
        return;
      }

      // Alt + Shift + Q â†’ go to queue
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

  const longestPlaylistTitle = playlists.reduce(
    (longest, playlist) => Math.max(longest, playlist.title.trim().length),
    0,
  );
  // Give shorter libraries a more compact footprint while reserving enough
  // room for names up to 20 characters. Longer names remain contained.
  const sidebarWidth = Math.min(310, Math.max(240, 210 + Math.min(20, longestPlaylistTitle) * 7));

  return (
    <div className="music-shell h-screen w-screen flex flex-col overflow-hidden">
      <Header
        user={user}
        activeDownloadCount={activeDownloadCount}
        downloadJobs={allJobs}
        onOpenPlaylist={handleSelectPlaylist}
        searchQuery={typedSearchInput || searchQuery}
        onSearchChange={(query) => {
          setTypedSearchInput(query);
          if (!query.trim()) {
            setSearchQuery('');
            navigateRoute({ kind: 'home' });
          }
        }}
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
        onHomeClick={() => {
          navigateRoute({ kind: 'home' });
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="music-content flex-1 flex overflow-hidden min-h-0 relative">
        <aside
          className={`music-sidebar h-full shrink-0 overflow-visible transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${sidebarExpanded ? 'min-w-[240px] max-w-[360px]' : 'w-[72px]'}`}
          style={{ width: sidebarExpanded ? `${sidebarWidth}px` : '72px' }}
        >
          <Sidebar
            playlists={orderedImportedPlaylists}
            selectedId={selectedPlaylist ? selectedPlaylist.id : showPlaylistManagement ? '__management__' : null}
            pinnedIds={pinnedIds}
            hiddenIds={hiddenIds}
            playingPlaylistId={playingPlaylistId}
            isPlaybackActive={isPlaying}
            isGlowDimmed={playlistGlowDimmed}
            onSelect={handleSelectPlaylist}
            onTogglePin={handleTogglePin}
            onOpenHiddenFolder={handleOpenHiddenFolder}
            onPlaylistOrderChange={handlePlaylistOrderChange}
            onPinnedOrderChange={handlePinnedOrderChange}
            onUnpinnedOrderChange={handleUnpinnedOrderChange}
            onPlayPlaylist={handlePlayPlaylist}
            onShufflePlayPlaylist={handleShufflePlayPlaylist}
            onDownloadPlaylist={handleDownload}
            onRemovePlaylist={handleDeletePlaylist}
            expanded={sidebarExpanded}
            onToggleExpanded={() => setSidebarExpanded((expanded) => !expanded)}
            onAddPlaylist={handleOpenImportModal}
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
                onlineResults={onlineSearchResults}
                isOnlineSearching={onlineSearching}
                onlineSearchError={onlineSearchError}
                onPlay={(track) => {
                  // For online tracks without a videoId (Spotify-only), the
                  // player resolves on-demand via /api/spotify/resolve. For
                  // local tracks or YTMusic results, the videoId is known.
                  const queue = globalSearchResults.length > 0
                    ? (globalSearchResults as Track[])
                    : onlineSearchResults;
                  handlePlay(track, queue);
                  navigateRoute({ kind: 'search', query: searchQuery, songId: track.videoId || track.sourceTrackId || '' });
                }}
              />
            ) : loadingPlaylists ? (
              selectedPlaylist ? <PlaylistViewSkeleton /> : <PlaylistGridSkeleton />
            ) : showPlaylistManagement ? (
              // Playlist management temporarily on standby â€” render grid as fallback.
              <PlaylistGrid
                playlists={filteredPlaylists}
                pinnedIds={pinnedIds}
                hiddenIds={[]}
                onSelect={handleSelectPlaylist}
                onTogglePin={handleTogglePin}
                onPlay={handlePlayPlaylist}
                onShufflePlay={handleShufflePlayPlaylist}
                onDownload={handleDownload}
                onRemove={handleDeletePlaylist}
              />
            ) : selectedPlaylist ? (
              <PlaylistView
                key={selectedPlaylist.id}
                playlist={selectedPlaylist}
                isPinned={pinnedIds.includes(selectedPlaylist.id)}
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
                onTracksLoaded={handleTracksLoaded}
                lastDownloadedTrack={lastDownloadedTrack}
                restoredTrack={restoredTrack}
                currentVideoId={currentTrack?.videoId}
                activePlaylistId={activePlaylistId}
                isPlaying={isPlaying}
                scrollToTrackRequest={playlistScrollRequest}
                onEditOrderChange={setIsPlaylistEditOrder}
                recommendations={playlistRecommendations}
                playlistMutation={playlistMutation}
              />
            ) : (
              <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
                <div className="min-h-[520px]">
                  <PlaylistGrid
                    playlists={filteredPlaylists}
                    pinnedIds={pinnedIds}
                    hiddenIds={[]}
                    onSelect={handleSelectPlaylist}
                    onTogglePin={handleTogglePin}
                    onPlay={handlePlayPlaylist}
                    onShufflePlay={handleShufflePlayPlaylist}
                    onDownload={handleDownload}
                    onRemove={handleDeletePlaylist}
                  />
                </div>
              </div>
            )}
          </div>

          {isQueueOpen && (
            <>
              <ResizeDivider onDelta={(d) => setQueueWidth((w) => clamp(w - (d / Math.max(window.innerWidth, 1)) * 100, QUEUE_MIN, QUEUE_MAX))} />
              <div
                className={`h-full shrink-0 border-l border-border overflow-hidden transition-[width] duration-300 ease-out ${isQueueClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'
                  }`}
                style={{ width: `${queueWidth}%` }}
              >
                <QueueDrawer
                  currentTrack={currentTrack}
                  queue={queue}
                  queuePosition={queuePosition}
                  onClose={handleCloseQueue}
                  onPlayTrack={(_, position) => moveToQueuePosition(position)}
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
                className={`h-full shrink-0 border-l border-border overflow-hidden transition-[width] duration-300 ease-out ${isLyricsClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'
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
        trackLoadKey={queuePosition}
        navigationDirection={navigation?.direction}
        navigationTick={navigation?.tick}
        queue={queue}
        onNext={handleNext}
        onPrev={handlePrev}
        canPrev={canGoToPrevious}
        canNext={canGoToNext}
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
        <div className="fixed bottom-[112px] left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-accent/30 bg-surface-elevated px-4 py-3 text-sm font-medium text-text shadow-2xl shadow-shadow/80 animate-fadeIn">
          <span className="h-2 w-2 rounded-full bg-accent shadow-accent-line" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {isSettingsOpen && (
        <SettingsPanel user={user} onClose={() => setIsSettingsOpen(false)} />
      )}



      {undoAction && (
        <div className="fixed bottom-[112px] left-1/2 z-[120] flex -translate-x-1/2 items-center gap-4 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm text-text shadow-2xl shadow-shadow/50">
          <span>Removed â€œ{undoAction.track.title}â€ from the playlist</span>
          <button onClick={handleUndoRemove} className="rounded-md px-2 py-1 font-semibold text-accent hover:bg-surface-hover">Undo</button>
        </div>
      )}

      {isImportModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-overlay/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsImportModalOpen(false); }}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-text">Import Playlists</h2>
                <p className="text-xs text-text-muted">Paste a YouTube or Spotify playlist URL, add to queue, then import</p>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="text-text-muted hover:text-text transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* URL input + Add button */}
            <div className="flex gap-2 px-6 pt-4">
              <input
                autoFocus
                type="url"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value); setImportError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && importUrl.trim()) handleAddUrlToQueue(); if (e.key === 'Escape') setIsImportModalOpen(false); }}
                placeholder="Enter link here"
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors"
              />
              <button
                onClick={handleAddUrlToQueue}
                disabled={!importUrl.trim()}
                className="flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>

            {importError && <p className="px-6 pt-2 text-xs text-error">{importError}</p>}

            {/* Queue list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
              {importQueue.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background-secondary py-8 text-center text-sm text-text-disabled">
                  No playlists in queue. Paste a URL above and click Add.
                </div>
              ) : (
                <div className="space-y-2">
                  {importQueue.map((entry) => (
                    <div key={entry.url} className="rounded-xl border border-border-subtle bg-background-secondary">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <button
                          onClick={() => entry.tracks ? handleTogglePreview(entry.url) : handleRetryPreview(entry.url)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          {/* Playlist artwork: 2x2 collage of first 4 track thumbnails, or cover image for Spotify */}
                          <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                            {entry.previewing ? (
                              <div className="flex h-full w-full items-center justify-center">
                                <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                              </div>
                            ) : entry.coverUrl && !entry.tracks?.some((t) => t.videoId) ? (
                              <img src={entry.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : entry.tracks && entry.tracks.length > 0 && entry.tracks.some((t) => t.thumbnailUrl || t.videoId) ? (
                              <div className="grid h-full w-full grid-cols-2 grid-rows-2">
                                {entry.tracks.slice(0, 4).map((track, i) => (
                                  (track.thumbnailUrl || track.videoId) ? (
                                    <img
                                      key={i}
                                      src={track.thumbnailUrl || getThumbnailUrl(track.videoId || '', track.title)}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div key={i} className="h-full w-full bg-surface" />
                                  )
                                ))}
                              </div>
                            ) : entry.coverUrl ? (
                              <img src={entry.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Music className="h-4 w-4 text-text-disabled" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text">{entry.title || entry.url}</p>
                            <p className="truncate text-xs text-text-disabled">
                              {entry.tracks ? `${entry.tracks.length} tracks` : entry.previewing ? 'Loadingâ€¦' : entry.url}
                            </p>
                          </div>
                          {entry.tracks && (
                            <div className="shrink-0">
                              {entry.previewOpen ? (
                                <ChevronDown className="h-4 w-4 text-text-muted" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-text-muted" />
                              )}
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => handleRemoveImportEntry(entry.url)}
                          className="shrink-0 rounded-lg p-1.5 text-text-disabled hover:bg-surface hover:text-text-secondary transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {/* Preview tracks */}
                      {entry.previewOpen && entry.tracks && (
                        <div className="border-t border-border-subtle px-3 py-2">
                          <div className="space-y-0.5">
                            {entry.tracks.slice(0, 10).map((track, i) => (
                              <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                                <span className="w-5 text-xs text-text-disabled">{i + 1}</span>
                                {track.thumbnailUrl ? (
                                  <img
                                    src={track.thumbnailUrl}
                                    alt=""
                                    className="h-8 w-8 rounded object-cover bg-surface"
                                    loading="lazy"
                                  />
                                ) : track.videoId ? (
                                  <img
                                    src={getThumbnailUrl(track.videoId, track.title)}
                                    alt=""
                                    className="h-8 w-8 rounded object-cover bg-surface"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-surface" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-text-secondary">{track.title}</p>
                                  <p className="truncate text-xs text-text-disabled">{track.artist}</p>
                                </div>
                              </div>
                            ))}
                            {entry.tracks.length > 10 && (
                              <p className="px-2 pt-1 text-xs text-text-disabled">+{entry.tracks.length - 10} more tracks</p>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Error / not public message */}
                      {entry.error && (
                        <div className="border-t border-border-subtle px-3 py-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-error">{entry.error}</p>
                            {entry.isPublic === false && (
                              <button
                                onClick={() => handleRetryPreview(entry.url)}
                                className="text-xs text-accent hover:underline"
                              >Retry</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer with Import button */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <span className="text-xs text-text-disabled">
                {importQueue.length > 0 ? `${importQueue.length} playlist${importQueue.length > 1 ? 's' : ''} queued` : ''}
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm text-text-secondary hover:bg-surface transition-colors"
                >Cancel</button>
                <button
                  onClick={() => void handleImportAll()}
                  disabled={importingAll || importQueue.filter((e) => e.isPublic !== false && !e.error).length === 0}
                  className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {importingAll ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Importingâ€¦</>
                  ) : (
                    <><Download className="h-4 w-4" /> Import {importQueue.filter((e) => e.isPublic !== false && !e.error).length > 0 ? `(${importQueue.filter((e) => e.isPublic !== false && !e.error).length})` : ''}</>
                  )}
                </button>
              </div>
            </div>
          </div>
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
  onlineResults,
  isOnlineSearching,
  onlineSearchError,
  onPlay,
}: {
  query: string;
  mode: SearchMode;
  results: Array<CachedTrack>;
  isIndexing: boolean;
  onlineResults?: Track[];
  isOnlineSearching?: boolean;
  onlineSearchError?: string;
  onPlay: (track: Track) => void;
}) {
  const hasLocal = results.length > 0;
  const showOnline = !hasLocal && onlineResults && onlineResults.length > 0;
  const showOnlineSearching = !hasLocal && isOnlineSearching && (!onlineResults || onlineResults.length === 0);
  const showEmpty = !hasLocal && !showOnline && !showOnlineSearching && !isIndexing;

  const modeLabel = mode === 'auto' ? 'Auto (Spotify + YTMusic)' : mode === 'spotify' ? 'Spotify' : mode === 'local' ? 'Local' : 'YTMusic';

  return (
    <div className="h-full min-h-0 overflow-y-auto px-8 py-8 scrollbar-thin animate-fadeIn">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.24em] text-text-muted">Global Search</p>
        <h2 className="mt-2 text-2xl font-black text-text">
          Results for "{query}"
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {isIndexing
            ? 'Loading songs from your playlists...'
            : hasLocal
              ? `${results.length} matching tracks in your library`
              : showOnline
                ? `${onlineResults!.length} tracks from ${modeLabel} (not yet in your library)`
                : mode === 'local'
                  ? 'No matches in your local library'
                  : showOnlineSearching
                  ? `Searching ${modeLabel}...`
                  : `No local matches — searching ${modeLabel}...`}
        </p>
      </div>

      <div className="space-y-2">
        {results.map((track) => (
          <button
            key={track.videoId}
            onClick={() => onPlay(track)}
            className="w-full flex items-center gap-4 rounded-3xl border border-border-subtle bg-surface px-4 py-3 text-left hover:bg-surface-hover transition-all duration-300 ease-out"
          >
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-surface shrink-0 border border-border-subtle">
              <img
                src={getTrackThumbnailUrl(track)}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text truncate">{track.title}</p>
              <p className="text-xs text-text-muted truncate mt-0.5">{cleanArtistName(track.artist)}</p>
            </div>
            <div className="hidden lg:block min-w-0 w-56">
              <p className="text-xs text-text-muted truncate">{track.playlistTitle}</p>
            </div>
            <div className="hidden md:block w-16 text-right text-xs text-text-muted">
              {track.duration ? formatDuration(track.duration) : '—'}
            </div>
            <div className="shrink-0 text-text-disabled">
              <Play className="w-4 h-4" />
            </div>
          </button>
        ))}

        {/* Online results — shown only when the local library has no matches.
            In 'auto' mode these are merged Spotify + YTMusic results (Spotify
            priority, deduped). Tracks from Spotify carry a spotifyId but may
            have no videoId; the player resolves them to a YouTube video
            on-demand via /api/spotify/resolve. YTMusic tracks already have a
            videoId. */}
        {showOnline && onlineResults!.map((track) => (
          <button
            key={track.videoId || track.sourceTrackId || track.title}
            onClick={() => onPlay(track)}
            className="w-full flex items-center gap-4 rounded-3xl border border-border-subtle bg-surface px-4 py-3 text-left hover:bg-surface-hover transition-all duration-300 ease-out"
          >
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-surface shrink-0 border border-border-subtle">
              <img
                src={getTrackThumbnailUrl(track)}
                alt={track.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text truncate">{track.title}</p>
              <p className="text-xs text-text-muted truncate mt-0.5">{cleanArtistName(track.artist)}</p>
              {track.album && <p className="text-xs text-text-disabled truncate mt-0.5">{track.album}</p>}
            </div>
            <div className="hidden lg:block min-w-0 w-56">
              <p className="text-xs text-text-muted truncate">YouTube Music</p>
            </div>
            <div className="hidden md:block w-16 text-right text-xs text-text-muted">
              {track.duration ? formatDuration(track.duration) : 'â€”'}
            </div>
            <div className="shrink-0 text-text-disabled">
              <Play className="w-4 h-4" />
            </div>
          </button>
        ))}

        {showOnlineSearching && (
          <div className="rounded-3xl border border-dashed border-border bg-background-secondary p-12 text-center text-text-muted">
            <Search className="w-5 h-5 mx-auto mb-3 text-text-disabled animate-pulse" />
            Searching {modeLabel} for "{query}"...
          </div>
        )}

        {!hasLocal && !showOnlineSearching && onlineSearchError && (
          <div className="rounded-3xl border border-error/30 bg-error/5 p-8 text-center text-sm text-error">
            {onlineSearchError}
          </div>
        )}

        {showEmpty && !onlineSearchError && (
          <div className="rounded-3xl border border-dashed border-border bg-background-secondary p-12 text-center text-text-muted">
            <Search className="w-5 h-5 mx-auto mb-3 text-text-disabled" />
            No matching tracks found.
          </div>
        )}
      </div>
    </div>
  );
}
