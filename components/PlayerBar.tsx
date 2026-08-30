'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Playlist, Track, RepeatMode, SleepTimer } from '@/types';
import { formatPlayerTime, cleanArtistName, getTrackThumbnailUrl } from '@/lib/ytmusicFormat';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Mic2,
  ListMusic,
  Maximize2,
  Maximize,
  Library,
  Timer,
  X,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';
import { AddToPlaylistDropdown, getCachedPlaylistMemberships, primePlaylistMemberships } from './AddToPlaylistDropdown';
import { VolumeControl } from './VolumeControl';

interface Props {
  track: Track | null;
  trackLoadKey?: number;
  navigationDirection?: 'next' | 'prev';
  navigationTick?: number;
  queue: Track[];
  playlists?: Playlist[];
  activePlaylistId?: string | null;
  selectedPlaylistId?: string | null;
  isPlaylistEditOrder?: boolean;
  onNext: () => void;
  onPrev: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  onTrackEnd: () => void;
  onToggleQueue: () => void;
  onToggleLyrics: () => void;
  onOpenPlaylist?: () => void;
  onAddToPlaylist?: (track: Track, playlistId: string) => void;
  onRemoveFromPlaylist?: (track: Track, playlistId: string) => void;
  onToggleFullscreen: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  /** Reported when the player resolved a Spotify song to its YouTube video. */
  onVideoIdResolved?: (sourceTrackId: string, videoId: string) => void;
  resumeTime?: number;
  autoPlay?: boolean;
  onStateChange?: (state: { isPlaying: boolean; duration: number; volume: number; isMuted: boolean }) => void;
  isQueueOpen: boolean;
  isLyricsOpen: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  sleepTimerTarget: Track | null;
  sleepTimerRequest?: { type: 'open' | 'set'; minutes?: number; id: number } | null;
  isFullscreenOpen?: boolean;
  volume?: number;
  isMuted?: boolean;
  onVolumeChange?: (volume: number) => void;
  onMuteChange?: (isMuted: boolean) => void;
  playlistMutation?: { type: 'add' | 'remove'; track: Track; playlistId: string; timestamp: number } | null;
  /** Bumped from outside (e.g. after a YouTube override) so the cover <img> and OS media session re-fetch. */
  playerBarArtworkKey?: number;
}

export function PlayerBar({
  track,
  trackLoadKey,
  navigationDirection,
  navigationTick,
  queue,
  playlists = [],
  activePlaylistId,
  selectedPlaylistId,
  isPlaylistEditOrder = false,
  onNext,
  onPrev,
  canPrev,
  canNext,
  onTrackEnd,
  onToggleQueue,
  onToggleLyrics,
  onOpenPlaylist,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onToggleFullscreen,
  onTimeUpdate,
  onVideoIdResolved,
  resumeTime = 0,
  autoPlay = true,
  onStateChange,
  isQueueOpen,
  isLyricsOpen,
  isShuffle,
  repeatMode,
  onToggleShuffle,
  onToggleRepeat,
  sleepTimerTarget,
  sleepTimerRequest,
  isFullscreenOpen,
  volume: volumeProp = 1,
  isMuted: isMutedProp = false,
  onVolumeChange,
  onMuteChange,
  playlistMutation,
  playerBarArtworkKey,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadGenerationRef = useRef(0);

  // Cover: use the same helper as PlaylistView — getTrackThumbnailUrl returns
  // track.thumbnailUrl (a local /api/thumbnail URL set at import time) with a
  // refresh query param that forces the browser to re-fetch the current file.
  const coverSrc = track ? getTrackThumbnailUrl(track, playerBarArtworkKey) : '';
  // Latest onVideoIdResolved callback without retriggering the load effect.
  const onVideoIdResolvedRef = useRef(onVideoIdResolved);
  onVideoIdResolvedRef.current = onVideoIdResolved;
  const [isPlaying, setIsPlayingState] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [progressHover, setProgressHover] = useState<number | null>(null);
  const volume = volumeProp;
  const isMuted = isMutedProp;
  const [isSeeking, setIsSeeking] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<SleepTimer>({ isActive: false, endTime: null, remainingTime: 0 });
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const [isTimerMenuClosing, setIsTimerMenuClosing] = useState(false);
  const [addPlaylistMenuOpen, setAddPlaylistMenuOpen] = useState(false);
  const [isAddPlaylistClosing, setIsAddPlaylistClosing] = useState(false);
  const addPlaylistMenuRef = useRef<HTMLDivElement>(null);
  const popoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const [playlistFeedback, setPlaylistFeedback] = useState(false);
  const [trackPlaylistIds, setTrackPlaylistIds] = useState<Set<string>>(new Set());
  const playlistFeedbackTimeoutRef = useRef<number | null>(null);

  const cancelPopoverClose = () => {
    if (popoverCloseTimeoutRef.current) clearTimeout(popoverCloseTimeoutRef.current);
    popoverCloseTimeoutRef.current = null;
    setIsTimerMenuClosing(false);
    setIsAddPlaylistClosing(false);
  };

  const schedulePopoverClose = (type: 'timer' | 'add') => {
    if (type === 'timer' && !timerMenuOpen) return;
    if (type === 'add' && !addPlaylistMenuOpen) return;
    if (popoverCloseTimeoutRef.current) clearTimeout(popoverCloseTimeoutRef.current);
    if (type === 'timer') setIsTimerMenuClosing(true);
    else setIsAddPlaylistClosing(true);
    popoverCloseTimeoutRef.current = setTimeout(() => {
      popoverCloseTimeoutRef.current = null;
      if (type === 'timer') {
        setTimerMenuOpen(false);
        setIsTimerMenuClosing(false);
      } else {
        setAddPlaylistMenuOpen(false);
        setIsAddPlaylistClosing(false);
      }
    }, 160);
  };

  useEffect(() => () => {
    if (popoverCloseTimeoutRef.current) clearTimeout(popoverCloseTimeoutRef.current);
  }, []);

  const setIsPlaying = useCallback((val: boolean | ((p: boolean) => boolean)) => {
    setIsPlayingState(val);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!track) {
      setTrackPlaylistIds(new Set());
      return;
    }
    if (!track.videoId) {
      setTrackPlaylistIds(track.playlistId ? new Set([track.playlistId]) : new Set());
      return;
    }
    const knownIds = getCachedPlaylistMemberships(track.videoId);
    if (track.playlistId) knownIds.add(track.playlistId);
    primePlaylistMemberships(track.videoId, knownIds);
    setTrackPlaylistIds(knownIds);
    fetch(`/api/playlist/memberships?videoId=${encodeURIComponent(track.videoId)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.playlistIds)) {
          const memberships = new Set([...knownIds, ...data.playlistIds]);
          primePlaylistMemberships(track.videoId, memberships);
          setTrackPlaylistIds(memberships);
        }
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [track]);

  useEffect(() => {
    if (!track || !playlistMutation || playlistMutation.track.videoId !== track.videoId) return;
    setTrackPlaylistIds((previous) => {
      const next = new Set(previous);
      if (playlistMutation.type === 'add') next.add(playlistMutation.playlistId);
      else next.delete(playlistMutation.playlistId);
      return next;
    });
  }, [playlistMutation, track]);

  const handleOpenPlaylist = useCallback(() => {
    if (!onOpenPlaylist) return;
    onOpenPlaylist();
    setPlaylistFeedback(true);
    if (playlistFeedbackTimeoutRef.current) window.clearTimeout(playlistFeedbackTimeoutRef.current);
    playlistFeedbackTimeoutRef.current = window.setTimeout(() => setPlaylistFeedback(false), 100);
  }, [onOpenPlaylist]);

  useEffect(() => () => {
    if (playlistFeedbackTimeoutRef.current) window.clearTimeout(playlistFeedbackTimeoutRef.current);
  }, []);

  // Track position persistence across abrupt refreshes
  const hasRestoredInitialTime = useRef(false);

  useEffect(() => {
    if (!sleepTimer.isActive || !sleepTimer.endTime) return;
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((sleepTimer.endTime! - Date.now()) / 1000));
      setSleepTimer((prev) => ({ ...prev, remainingTime: remaining }));
      if (remaining <= 0) {
        const audio = audioRef.current;
        if (audio) audio.pause();
        setIsPlaying(false);
        setSleepTimer({ isActive: false, endTime: null, remainingTime: 0 });
        setTimerMenuOpen(false);
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [sleepTimer.isActive, sleepTimer.endTime, setIsPlaying]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sleep_timer');
      if (!stored) return;
      const parsed = JSON.parse(stored) as SleepTimer;
      if (parsed?.isActive && parsed.endTime && parsed.endTime > Date.now()) {
        setSleepTimer({
          isActive: true,
          endTime: parsed.endTime,
          remainingTime: Math.max(0, Math.ceil((parsed.endTime - Date.now()) / 1000)),
        });
      }
    } catch { }
  }, []);

  const persistSleepTimer = useCallback((next: SleepTimer) => {
    setSleepTimer(next);
    try {
      if (next.isActive) localStorage.setItem('sleep_timer', JSON.stringify(next));
      else localStorage.removeItem('sleep_timer');
    } catch { }
  }, []);

  const startSleepTimer = useCallback((minutes: number) => {
    const endTime = Date.now() + minutes * 60 * 1000;
    persistSleepTimer({ isActive: true, endTime, remainingTime: minutes * 60 });
    setTimerMenuOpen(false);
  }, [persistSleepTimer]);

  const clearSleepTimer = useCallback(() => {
    persistSleepTimer({ isActive: false, endTime: null, remainingTime: 0 });
    setTimerMenuOpen(false);
  }, [persistSleepTimer]);

  useEffect(() => {
    if (!sleepTimerRequest) return;
    if (sleepTimerRequest.type === 'set' && sleepTimerRequest.minutes) {
      startSleepTimer(sleepTimerRequest.minutes);
    } else {
      setTimerMenuOpen(true);
    }
  }, [sleepTimerRequest, startSleepTimer]);

  // Direct HTML5 audio element volume synchronization
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
    }
  }, [volume, isMuted]);

  // Destroy HLS + sessions on unmount
  useEffect(() => () => {}, []);

  // ── Simple MP3 track loading ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Increment the generation counter FIRST so any in-flight async work
    // from a previous render detects it is stale and aborts.
    const loadGeneration = ++loadGenerationRef.current;

    // Immediately stop old playback — synchronous, no await.
    // This guarantees the old audio stops the moment the user clicks a new
    // track, regardless of how long the new stream URL takes to resolve.
    audio.pause();
    audio.src = '';
    setIsPlaying(false);
    setBuffered(0);

    if (!track) {
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    let cancelled = false;

    // Start matching/stream warming immediately, before the player waits for
    // anything. The server coalesces duplicate requests, so the actual load
    // below can await the same in-flight work. Keep the window small to avoid
    // unnecessary network traffic.
    const currentIndex = queue.findIndex((item) =>
      (track.videoId && item.videoId === track.videoId) ||
      (track.sourceTrackId && item.sourceTrackId === track.sourceTrackId),
    );
    const prefetchWindow = [
      ...(currentIndex < 0 ? [track] : []),
      ...(currentIndex >= 0 ? queue.slice(currentIndex, currentIndex + 4) : queue.slice(0, 4)),
    ]
      .filter(Boolean)
      .map((item) => ({
        title: item.title,
        artist: item.artist,
        duration: item.duration,
        spotifyId: item.sourceTrackId,
        album: item.album,
        thumbnailUrl: item.thumbnailUrl,
        videoId: item.videoId,
        downloaded: item.downloaded,
      }));

    // Warm Spotify tracks via the match+stream resolver (handles Spotify→YT mapping).
    void fetch('/api/spotify/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: prefetchWindow }),
    }).catch(() => {});

    // Also warm pure YouTube tracks (no Spotify ID) — these skip the Spotify
    // resolver entirely, so without this call the yt-dlp extraction runs cold
    // on first play. /api/stream/prefetch calls getStreamUrl directly, which
    // coalesces duplicate requests and caches the URL in memory.
    for (const item of prefetchWindow) {
      if (item.videoId && !item.spotifyId) {
        void fetch(`/api/stream/prefetch?videoId=${encodeURIComponent(item.videoId)}`).catch(() => {});
      }
    }

    const loadTrack = async () => {
      try {
        // ── Spotify track resolution ──────────────────────────────────────
        // If the track came from Spotify and hasn't been resolved to a YouTube
        // video yet, resolve it on-demand via /api/spotify/resolve. The
        // resolver checks the Spotify→YouTube cache first, then searches
          // YouTube Music through the in-process matcher. The player itself never knows how Spotify auth
        // works — it just asks for a playable videoId.
        let videoId = track.videoId;
        if (!videoId && track.sourceTrackId) {
          if (cancelled || loadGeneration !== loadGenerationRef.current) return;
          try {
            const res = await fetch('/api/spotify/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: track.title,
                artist: track.artist,
                duration: track.duration,
                spotifyId: track.sourceTrackId,
                thumbnailUrl: track.thumbnailUrl,
              }),
            });
            if (cancelled || loadGeneration !== loadGenerationRef.current) return;
            if (res.ok) {
              const data = await res.json();
              if (data.videoId) {
                videoId = data.videoId;
                // Keep the parent state in sync so the currently-playing song
                // stays highlighted in the playlist view and the resolved id
                // is reused for cache/download lookups.
                onVideoIdResolvedRef.current?.(track.sourceTrackId, data.videoId);
              }
            }
          } catch {
            // Resolution failed — fall through; the mp3/stream load will fail
            // gracefully below.
          }
        }

        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        if (!videoId) {
          console.warn('[Track unavailable]: No playable YouTube match is available for', track.title);
          setIsPlaying(false);
          return;
        }

        // Set audio.src directly to the live streaming endpoint — one HTTP request
        // instead of two (JSON round-trip to /api/stream + then to /api/stream/live).
        // /api/stream/live checks the local store itself, resolves the upstream URL
        // (coalesced via the same in-memory cache that prefetch warms), and
        // tees the stream to disk for future plays.
        const streamParams = new URLSearchParams({ videoId });
        if (track.title) streamParams.set('title', track.title);
        if (track.artist) streamParams.set('artist', track.artist);
        if (track.thumbnailUrl) streamParams.set('thumbnailUrl', track.thumbnailUrl);

        audio.src = `/api/stream/live?${streamParams.toString()}`;

        // Restore user's volume — never reset to 1 (that wipes user preference).
        audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
        audio.load();

        if (!hasRestoredInitialTime.current) {
          hasRestoredInitialTime.current = true;
          if (resumeTime > 0) { audio.currentTime = resumeTime; setCurrentTime(resumeTime); }
        }
        
        // Guard play() with BOTH the cancelled flag AND the generation counter.
        // A bare autoPlay check is not enough — the effect may have re-run for
        // a newer track between the last await and this point.
        if (autoPlay && !cancelled && loadGeneration === loadGenerationRef.current) {
          audio.play()
            .then(() => { if (!cancelled && loadGeneration === loadGenerationRef.current) setIsPlaying(true); })
            .catch(() => { if (!cancelled && loadGeneration === loadGenerationRef.current) setIsPlaying(false); });
        }
      } catch (err) {
        if (!cancelled && loadGeneration === loadGenerationRef.current) {
          console.error('[Track Load Error]:', err);
          setIsPlaying(false);
        }
      }
    };

    void loadTrack();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.videoId, track?.sourceTrackId, trackLoadKey]);

  // OS Lockscreen & Hardware Media Controls (MediaSession API)
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !track) return;

    // Build the hi-res (1280x1280) artwork URL from the same track thumbnail.
    // Adding ?size=hi to the existing thumbnail URL switches the thumbnail route
    // to serve the .hi.webp rendition. If the OS needs a size smaller than 1280,
    // it scales the sharp source rather than upscaling a small image.
    const localArtworkSrc = coverSrc
      ? coverSrc.startsWith('http')
        ? coverSrc
        : `${window.location.origin}${coverSrc}`
      : '';
    const hiArtworkSrc = localArtworkSrc
      ? `${localArtworkSrc}${localArtworkSrc.includes('?') ? '&' : '?'}size=hi`
      : '';

    // Declare multiple sizes so the OS picks the closest rendition for its
    // surface (lock screen tile, taskbar, hardware display, media overlay).
    const artworkSizes = ['96x96', '128x128', '192x192', '256x256', '512x512', '1024x1024'] as const;
    const artwork: MediaImage[] = hiArtworkSrc
      ? artworkSizes.map((sizes) => ({ src: hiArtworkSrc, sizes, type: 'image/webp' }))
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'YouTube Music',
      artwork,
    });

    navigator.mediaSession.setActionHandler('play', () => {
      const audio = audioRef.current;
      if (audio) {
        audio.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        setIsPlaying(false);
      }
    });

    if (onPrev) {
      navigator.mediaSession.setActionHandler('previoustrack', onPrev);
    } else {
      navigator.mediaSession.setActionHandler('previoustrack', null);
    }

    if (onNext) {
      navigator.mediaSession.setActionHandler('nexttrack', onNext);
    } else {
      navigator.mediaSession.setActionHandler('nexttrack', null);
    }

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      const audio = audioRef.current;
      if (audio && details.seekTime !== undefined && details.seekTime !== null) {
        audio.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });
  }, [track, onNext, onPrev, coverSrc, playerBarArtworkKey]);

  // Sync user volume: directly set audio.volume on HTMLAudioElement
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
    }
  }, [volume, isMuted, track?.videoId]);

  // Sync playing state and duration up to parent
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isPlaying, duration, volume, isMuted });
    }
  }, [isPlaying, duration, onStateChange]);



  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => { });
    }
  }, [isPlaying, track]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const val = parseFloat(e.target.value);
    audio.currentTime = val;
    setCurrentTime(val);
  }, []);

  const handleEnded = useCallback(() => {
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { });
      return;
    }
    setIsPlaying(false);
    onTrackEnd();
  }, [repeatMode, onTrackEnd]);

  const currentIdx = track ? queue.findIndex((t) => t.videoId === track.videoId) : -1;
  const computedCanPrev = canPrev ?? (currentIdx > 0);
  const computedCanNext = canNext ?? (currentIdx >= 0 && currentIdx < queue.length - 1);

  if (!track) {
    return null;
  }

  return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        autoPlay={autoPlay}
        suppressHydrationWarning
        onTimeUpdate={() => {
          if (!isSeeking && audioRef.current) {
            const t = audioRef.current.currentTime;
            setCurrentTime(t);
            onTimeUpdate?.(t);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            const d = audioRef.current.duration;
            // NaN/Infinity (metadata not really loaded) must never reach the UI.
            setDuration(Number.isFinite(d) && d > 0 ? d : 0);
          }
        }}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onProgress={() => {
          const audio = audioRef.current;
          if (!audio || !duration) return;
          const bufferedRanges = audio.buffered;
          if (bufferedRanges.length > 0) {
            setBuffered(bufferedRanges.end(bufferedRanges.length - 1));
          }
        }}
      />

      <div className="music-player relative w-full h-[88px] min-h-[88px] bg-background-secondary border-t border-border flex items-center gap-2 px-3 lg:px-5 justify-between z-30 select-none shrink-0">
        {/* Left Section: Track Info & Heart */}
        <div key={navigationTick} className={`flex items-center gap-2 w-56 lg:w-64 min-w-0 shrink-0 ${navigationDirection === 'next' ? 'animate-track-next' : navigationDirection === 'prev' ? 'animate-track-prev' : ''}`}>
          <div
            key={`cover-${track.videoId}-${playerBarArtworkKey ?? 0}`}
            onClick={onToggleFullscreen}
              className="w-14 h-14 aspect-square rounded-[4px] overflow-hidden bg-surface shrink-0 cursor-pointer group relative shadow-md"
          >
            <img
              src={coverSrc}
              alt={track.title}
              className="w-full h-full aspect-square object-cover group-hover:opacity-75 transition-opacity"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-overlay/40">
              <Maximize2 className="w-4 h-4 text-text" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">
              {track.title}
            </p>
            <p className="text-xs text-text truncate">
              {cleanArtistName(track.artist)}
            </p>
          </div>
          {/* Playlist & Add-To-Playlist Buttons */}
          <div ref={addPlaylistMenuRef} onMouseEnter={cancelPopoverClose} className="flex items-center gap-1 shrink-0 relative">
            {/* Library / Playlist button — reverted to icon, tooltip = "Playlist" */}
            <button
              onClick={handleOpenPlaylist}
              disabled={!onOpenPlaylist}
              className={`relative shrink-0 p-1.5 rounded-md transition-all duration-75 disabled:text-text-disabled disabled:hover:bg-transparent ${
                playlistFeedback
                  ? 'text-text-muted bg-transparent'
                  : 'text-text hover:text-accent hover:bg-surface-hover'
              }`}
              title="Show Playlist"
              aria-label="Show Playlist"
            >
              <Library className="w-4 h-4" />
            </button>

            {/* Add to Playlist button reflects whether the track is already saved */}
            <button
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                cancelPopoverClose();
                setAddPlaylistMenuOpen((prev) => !prev);
              }}
              disabled={!track}
              className={`relative shrink-0 p-1.5 rounded-md transition-all duration-75 disabled:text-text-disabled disabled:hover:bg-transparent ${
                addPlaylistMenuOpen
                  ? 'text-accent bg-accent/10'
                  : 'text-text hover:text-accent hover:bg-surface-hover'
              }`}
              title="Add to Playlist"
              aria-label="Add to Playlist"
            >
              {trackPlaylistIds.size > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-accent" strokeWidth={2.5} />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
            </button>

            {/* Add to Playlist Dropdown */}
            {addPlaylistMenuOpen && track && (
              <div
                onMouseEnter={cancelPopoverClose}
                onMouseLeave={() => schedulePopoverClose('add')}
                className={`absolute bottom-12 left-0 ${isAddPlaylistClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
              >
                <AddToPlaylistDropdown
                  track={track}
                  playlists={playlists}
                  anchorRef={addPlaylistMenuRef}
                  onAdd={(t, pid) => {
                    onAddToPlaylist?.(t, pid);
                  }}
                  onRemove={(t, pid) => {
                    onRemoveFromPlaylist?.(t, pid);
                  }}
                  onClose={() => {
                    setIsAddPlaylistClosing(false);
                    setAddPlaylistMenuOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Center Section: Controls & Progress */}
        <div className="flex-1 min-w-[220px] flex flex-col items-center gap-2 max-w-2xl px-2 lg:px-5">
          {/* Top Control Buttons */}
          <div className="playerbar-control-icons flex items-center gap-4 text-text">
            {/* Shuffle */}
            <button
              onClick={onToggleShuffle}
              className={`transition-colors relative p-1 ${isShuffle
                ? 'text-accent'
                : 'text-text hover:text-accent hover:bg-surface-hover'
                }`}
              title="Enable shuffle"
            >
              <Shuffle className="w-4 h-4" />
              {isShuffle && (
                <div className="w-1 h-1 rounded-full bg-accent absolute -bottom-1 left-1/2 -translate-x-1/2" />
              )}
            </button>

            {/* Prev */}
            <button
              onClick={onPrev}
              disabled={!computedCanPrev}
              className="text-text hover:text-accent hover:bg-surface-hover disabled:text-text-disabled transition-all duration-300 p-1 rounded-lg"
              title="Previous"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={handlePlayPause}
              className="playerbar-primary w-8 h-8 rounded-2xl bg-text text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-background text-background" />
              ) : (
                <Play className="w-4 h-4 fill-background text-background ml-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              onClick={onNext}
              disabled={!computedCanNext}
              className="text-text hover:text-accent hover:bg-surface-hover disabled:text-text-disabled transition-all duration-300 p-1 rounded-lg"
              title="Next"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            {/* Repeat */}
            <button
              onClick={onToggleRepeat}
              className={`transition-colors relative p-1 ${repeatMode !== 'off'
                ? 'text-accent'
                : 'text-text hover:text-accent hover:bg-surface-hover'
                }`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
              {repeatMode !== 'off' && (
                <div className="w-1 h-1 rounded-full bg-accent absolute -bottom-1 left-1/2 -translate-x-1/2" />
              )}
            </button>
          </div>

          {/* Bottom Progress Bar */}
          <div className="flex items-center gap-2 w-full">
            <span className="text-[11px] font-medium text-text w-9 text-right shrink-0">
              {formatPlayerTime(currentTime)}
            </span>
            <div
              className="relative flex-1 h-1 group flex items-center"
              onMouseEnter={() => setProgressHover(0)}
              onMouseLeave={() => setProgressHover(null)}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setProgressHover(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)));
              }}
            >
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                onMouseDown={() => setIsSeeking(true)}
                onMouseUp={() => setIsSeeking(false)}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10 h-full"
                aria-label="Seek"
              />
              <div className="relative h-1 w-full min-w-0 bg-surface-active rounded-full overflow-visible">
                {/* Buffer: how much has loaded (always visible, darker gray) */}
                <div
                  className="absolute inset-y-0 left-0 z-[1] rounded-full bg-border"
                  style={{ width: duration > 0 ? `${(buffered / duration) * 100}%` : '0%' }}
                />
                {/* Hover fill: accent fill from 0% to cursor (guide line that follows cursor) */}
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 z-[2] rounded-full bg-accent/30 transition-opacity duration-150 ${
                    progressHover !== null ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ width: `${progressHover ?? 0}%` }}
                />
                {/* Current position: playhead fill */}
                <div
                  className={`relative z-[3] h-full rounded-full transition-colors duration-150 ${
                    progressHover !== null ? 'bg-accent shadow-accent-strong' : 'bg-text'
                  }`}
                  style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                />
                {/* Hover: tooltip + playhead thumb */}
                {progressHover !== null && duration > 0 && (
                  <>
                    <span
                      className="absolute z-[4] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-surface"
                      style={{ left: `${(currentTime / duration) * 100}%` }}
                    />
                    <span
                      className="absolute bottom-3 z-[5] -translate-x-1/2 rounded bg-text px-1.5 py-0.5 text-[11px] font-semibold leading-none text-background whitespace-nowrap"
                      style={{ left: `${progressHover}%` }}
                    >
                      {formatPlayerTime((progressHover / 100) * duration)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="text-[11px] font-medium text-text w-9 shrink-0">
              {formatPlayerTime(duration)}
            </span>
          </div>
        </div>

        {/* Right Section: Lyrics, Queue, Volume, Fullscreen */}
        <div className="flex items-center gap-1.5 lg:gap-3 w-64 lg:w-80 justify-end shrink-0">
          {/* Lyrics toggle */}
          <button
            onClick={onToggleLyrics}
            className={`p-1.5 rounded-md transition-colors ${isLyricsOpen ? 'text-accent' : 'text-text hover:text-accent hover:bg-surface-hover'
              }`}
            title="Lyrics"
          >
            <Mic2 className="w-4 h-4" />
          </button>

          {/* Queue toggle */}
          <button
            onClick={onToggleQueue}
            className={`p-1.5 rounded-md transition-colors ${isQueueOpen ? 'text-accent' : 'text-text hover:text-accent hover:bg-surface-hover'
              }`}
            title="Queue"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          {/* Volume */}
          <VolumeControl volume={volume} isMuted={isMuted} onVolumeChange={(value) => onVolumeChange?.(value)} onToggleMute={() => onMuteChange?.(!isMuted)} className="w-[140px] max-[1200px]:w-[88px]" />

          <div className="relative" onMouseEnter={cancelPopoverClose}>
            <button
              onClick={() => {
                cancelPopoverClose();
                setTimerMenuOpen((p) => !p);
              }}
              className={`p-1.5 rounded-md transition-all duration-300 ${sleepTimer.isActive ? 'text-accent' : 'text-text hover:text-accent hover:bg-surface-hover'}`}
              title="Sleep timer"
            >
              <Timer className="w-4 h-4" />
            </button>
            {timerMenuOpen && (
              <div
                onMouseEnter={cancelPopoverClose}
                onMouseLeave={() => schedulePopoverClose('timer')}
                className={`absolute bottom-11 right-0 w-80 rounded-3xl border border-border bg-surface shadow-2xl shadow-shadow/60 p-4 backdrop-blur-xl ${isTimerMenuClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Timer className="w-4 h-4 text-accent" />
                      <p className="text-sm font-bold text-text">Sleep timer</p>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {sleepTimer.isActive ? `Playback stops in ${formatPlayerTime(sleepTimer.remainingTime)}` : 'Choose when playback should stop'}
                    </p>
                  </div>
                  {sleepTimer.isActive && (
                    <button
                      onClick={clearSleepTimer}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-error hover:bg-error/15 hover:text-error transition-all duration-300"
                      title="Clear sleep timer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-2">Quick presets</p>
                <div className="grid grid-cols-2 gap-2">
                  {[5, 10, 15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => startSleepTimer(mins)}
                      className="rounded-xl border border-border-subtle bg-background-secondary hover:border-accent/25 hover:bg-accent/10 hover:text-accent hover:shadow-accent-soft px-3 py-2.5 text-sm text-text transition-all duration-300"
                    >
                      {mins === 60 ? '1 hour' : `${mins} minutes`}
                    </button>
                  ))}
                  <button
                    onClick={() => startSleepTimer(Math.max(1, Math.ceil((duration - currentTime) / 60)))}
                    className="col-span-2 rounded-xl border border-border-subtle bg-background-secondary hover:border-accent/25 hover:bg-accent/10 hover:text-accent hover:shadow-accent-soft px-3 py-2.5 text-sm text-text transition-all duration-300"
                  >
                    End of track
                  </button>
                </div>

                <div className="mt-3 border-t border-border-subtle pt-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-2">Custom duration</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="hr"
                      className="w-16 rounded-lg bg-overlay/30 border border-border px-3 py-2 text-sm text-text placeholder:text-text-disabled outline-none focus:border-accent/40 focus:outline-none caret-accent transition-colors"
                    />
                    <span className="text-text">:</span>
                    <input
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="mins"
                      className="w-20 rounded-lg bg-overlay/30 border border-border px-3 py-2 text-sm text-text placeholder:text-text-disabled outline-none focus:border-accent/40 focus:outline-none caret-accent transition-colors"
                    />
                    <button
                      onClick={() => {
                        const hrs = Number(customHours || 0);
                        const mins = Number(customMinutes || 0);
                        if (hrs === 0 && mins === 0) return;
                        startSleepTimer(hrs * 60 + mins);
                      }}
                      className="ml-auto rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-background hover:shadow-accent-medium transition-all duration-300"
                    >
                      Set
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-md text-text hover:text-accent hover:bg-surface-hover transition-colors"
            title="Fullscreen"
            aria-label="Fullscreen"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>

    </>
  );
}
