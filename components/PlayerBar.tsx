'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Playlist, Track, RepeatMode, SleepTimer } from '@/types';
import { formatDuration, cleanArtistName, getThumbnailUrl } from '@/lib/ytmusicFormat';
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
  Volume2,
  VolumeX,
  Maximize2,
  Maximize,
  Library,
  Timer,
  X,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';
import { AddToPlaylistDropdown, getCachedPlaylistMemberships, primePlaylistMemberships } from './AddToPlaylistDropdown';

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
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadGenerationRef = useRef(0);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progressHover, setProgressHover] = useState<number | null>(null);
  const [volumeHover, setVolumeHover] = useState<number | null>(null);
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

  // Web Audio pipeline: Source → Compressor → User Volume GainNode → Destination
  const audioCtxRef = useRef<AudioContext | null>(null);
  const userGainRef = useRef<GainNode | null>(null);  // user volume slider

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setupAudioPipeline = () => {
      if (audioCtxRef.current) return;
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();

        const source = ctx.createMediaElementSource(audio);

        // DynamicsCompressor to tame peaks cleanly without pumping
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(12, ctx.currentTime);
        compressor.ratio.setValueAtTime(6, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);

        // User Volume GainNode: responds to slider, smoothly ramped
        const userGain = ctx.createGain();
        const initialVol = isMuted ? 0 : Math.pow(volume, 2);
        userGain.gain.setValueAtTime(initialVol, ctx.currentTime);

        // Keep audio element at full volume — all level control via GainNodes
        audio.volume = 1;

        source.connect(compressor);
        compressor.connect(userGain);
        userGain.connect(ctx.destination);

        audioCtxRef.current = ctx;
        userGainRef.current = userGain;

      } catch { }
    };

    const handleUserGesture = () => {
      setupAudioPipeline();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };

    window.addEventListener('click', handleUserGesture, { once: true });
    window.addEventListener('keydown', handleUserGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, []);

  // Destroy HLS + sessions on unmount
  useEffect(() => () => {}, []);

  // ── Simple MP3 track loading ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const loadGeneration = ++loadGenerationRef.current;

    if (!track) {
      audio.pause();
      audio.src = '';
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    let cancelled = false;

    const loadTrack = async () => {
      try {
        // ── Spotify track resolution ──────────────────────────────────────
        // If the track came from Spotify and hasn't been resolved to a YouTube
        // video yet, resolve it on-demand via /api/spotify/resolve. The
        // resolver checks the Spotify→YouTube cache first, then searches
          // YouTube Music through the in-process matcher. The player itself never knows how Spotify auth
        // works — it just asks for a playable videoId.
        let videoId = track.videoId;
        if (!videoId && track.spotifyId) {
          if (cancelled || loadGeneration !== loadGenerationRef.current) return;
          try {
            const res = await fetch('/api/spotify/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: track.title,
                artist: track.artist,
                duration: track.duration,
                spotifyId: track.spotifyId,
                thumbnailUrl: track.thumbnailUrl,
              }),
            });
            if (cancelled || loadGeneration !== loadGenerationRef.current) return;
            if (res.ok) {
              const data = await res.json();
              if (data.videoId) videoId = data.videoId;
            }
          } catch {
            // Resolution failed — fall through; the mp3/stream load will fail
            // gracefully below.
          }
        }

        if (cancelled || loadGeneration !== loadGenerationRef.current) return;
        if (!videoId) {
          console.error('[Track Load Error]: No videoId and Spotify resolution failed for', track.title);
          setIsPlaying(false);
          return;
        }

        // Prefer the locally-downloaded MP3 (instant, offline-capable).
        // The /api/mp3 route returns 404 if the file isn't downloaded yet.
        const mp3Url = `/api/mp3?v=${encodeURIComponent(videoId)}`;
        const mp3Res = await fetch(mp3Url, { method: 'HEAD' }).catch(() => null);
        if (cancelled || loadGeneration !== loadGenerationRef.current) return;

        if (mp3Res && mp3Res.ok) {
          // Local MP3 exists — play it directly.
          audio.src = mp3Url;
        } else {
        // Not downloaded — resolve a live provider stream.
          const streamRes = await fetch(`/api/stream?videoId=${encodeURIComponent(videoId)}`).catch(() => null);
          if (cancelled || loadGeneration !== loadGenerationRef.current) return;
          if (!streamRes || !streamRes.ok) {
            console.error('[Track Load Error]: No local MP3 and stream extraction failed for', track.title);
            setIsPlaying(false);
            return;
          }
          const streamData = await streamRes.json();
          if (cancelled || loadGeneration !== loadGenerationRef.current) return;
          if (!streamData.streamUrl) {
            console.error('[Track Load Error]: Stream URL missing for', track.title);
            setIsPlaying(false);
            return;
          }
          audio.src = streamData.streamUrl;
        }

        audio.volume = 1;
        audio.load();
        
        if (!hasRestoredInitialTime.current) {
          hasRestoredInitialTime.current = true;
          if (resumeTime > 0) { audio.currentTime = resumeTime; setCurrentTime(resumeTime); }
        }
        
        if (autoPlay) {
          audio.play()
            .then(() => { if (!cancelled && loadGeneration === loadGenerationRef.current) setIsPlaying(true); })
            .catch(() => { if (!cancelled && loadGeneration === loadGenerationRef.current) setIsPlaying(false); });
        }
      } catch (err) {
        if (!cancelled) { console.error('[Track Load Error]:', err); setIsPlaying(false); }
      }
    };

    void loadTrack();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.videoId, track?.spotifyId, trackLoadKey]);

  // OS Lockscreen & Hardware Media Controls (MediaSession API)
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !track) return;

    // Use the local thumbnail route for Windows media controls. The route
    // serves the cached file from the data directory (and caches it on the
    // first request), avoiding a direct dependency on the remote image URL.
    const localArtwork = track.videoId
      ? `${window.location.origin}${getThumbnailUrl(track.videoId, track.title)}`
      : '';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'YouTube Music',
      artwork: localArtwork ? [{ src: localArtwork, sizes: '512x512', type: 'image/webp' }] : [],
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
  }, [track, onNext, onPrev]);

  // Sync user volume: write to userGainNode with a 15ms linear ramp (no creak/zipper noise)
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const userGain = userGainRef.current;
    if (!ctx || !userGain) {
      // Fallback: if pipeline not yet initialised, set audio.volume directly
      if (audioRef.current) audioRef.current.volume = isMuted ? 0 : Math.pow(volume, 2);
      return;
    }
    const targetGain = isMuted ? 0 : Math.pow(volume, 2);
    // Linear ramp over 15ms — smooth, no zipper clicks
    userGain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.015);
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

  const actualVolumePercent = isMuted ? 0 : volume * 100;
  const displayedVolumePercent = volumeHover ?? actualVolumePercent;

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
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="music-player relative w-full h-[88px] min-h-[88px] bg-background-secondary border-t border-border flex items-center gap-2 px-3 lg:px-5 justify-between z-30 select-none shrink-0">
        {/* Left Section: Track Info & Heart */}
        <div key={navigationTick} className={`flex items-center gap-2 w-56 lg:w-64 min-w-0 shrink-0 ${navigationDirection === 'next' ? 'animate-track-next' : navigationDirection === 'prev' ? 'animate-track-prev' : ''}`}>
          <div
            onClick={onToggleFullscreen}
              className="w-14 h-14 aspect-square rounded-[4px] overflow-hidden bg-surface shrink-0 cursor-pointer group relative shadow-md"
          >
            <img
              src={getThumbnailUrl(track.videoId, track.title)}
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
              {formatDuration(Math.floor(currentTime))}
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
                {progressHover !== null && (
                  <div
                    className="absolute inset-y-0 z-[1] rounded-full bg-surface-active"
                    style={{
                      left: `${Math.min(progressHover, duration > 0 ? (currentTime / duration) * 100 : 0)}%`,
                      width: `${Math.abs(progressHover - (duration > 0 ? (currentTime / duration) * 100 : 0))}%`,
                    }}
                  />
                )}
                <div
                  className={`relative z-[2] h-full rounded-full transition-colors duration-150 ${progressHover !== null ? 'bg-accent shadow-accent-strong' : 'bg-text'}`}
                  style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                />
                {progressHover !== null && duration > 0 && (
                  <>
                    <span
                      className="absolute z-[3] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-surface"
                      style={{ left: `${(currentTime / duration) * 100}%` }}
                    />
                    <span
                      className="absolute bottom-3 z-[4] -translate-x-1/2 rounded bg-text px-1.5 py-0.5 text-[11px] font-semibold leading-none text-background whitespace-nowrap"
                      style={{ left: `${progressHover}%` }}
                    >
                      {formatDuration(Math.floor((progressHover / 100) * duration))}
                    </span>
                    <span className="absolute inset-y-0 z-[2] w-px bg-surface-active" style={{ left: `${progressHover}%` }} />
                  </>
                )}
              </div>
            </div>
            <span className="text-[11px] font-medium text-text w-9 shrink-0">
              {formatDuration(Math.floor(duration))}
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
          <div className="flex items-center gap-2 w-[140px] max-[1200px]:w-[88px] group relative">
            <button
              onClick={() => {
                if (onMuteChange) onMuteChange(!isMuted);
              }}
              className="text-text hover:text-accent hover:bg-surface-hover transition-all duration-300 p-1 rounded-lg shrink-0"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-error" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div
              className="relative flex-1 h-1 flex items-center group"
              onMouseEnter={() => setVolumeHover(0)}
              onMouseLeave={() => setVolumeHover(null)}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setVolumeHover(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)));
              }}
            >
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={isMuted ? 0 : Math.round(volume * 100)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) / 100;
                  if (isMuted && onMuteChange) onMuteChange(false);
                  if (onVolumeChange) onVolumeChange(val);
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-20 h-full"
                aria-label="Volume"
              />
              {/* Background Track */}
              <div className="relative w-full h-1 bg-surface-active rounded-full overflow-visible">
                {/* Active Volume Fill */}
                <div
                  className={`h-full rounded-full transition-colors duration-150 ${volumeHover !== null ? 'bg-accent shadow-accent-small' : 'bg-text'}`}
                  style={{ width: `${displayedVolumePercent}%` }}
                />
                {volumeHover !== null && (
                  <>
                    <span
                      className="absolute z-[3] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-surface"
                      style={{ left: `${displayedVolumePercent}%` }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

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
                      {sleepTimer.isActive ? `Playback stops in ${formatDuration(sleepTimer.remainingTime)}` : 'Choose when playback should stop'}
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
