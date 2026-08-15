'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Playlist, Track, RepeatMode, SleepTimer } from '@/types';
import { formatDuration, cleanArtistName } from '@/lib/ytmusicApi';
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
  Library,
  Timer,
  X,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';
import { AddToPlaylistDropdown, getCachedPlaylistMemberships, primePlaylistMemberships } from './AddToPlaylistDropdown';

interface Props {
  track: Track | null;
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
  isOffline?: boolean;
  playlistMutation?: { type: 'add' | 'remove'; track: Track; playlistId: string; timestamp: number } | null;
}

export function PlayerBar({
  track,
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
  isOffline = false,
  playlistMutation,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const volume = volumeProp;
  const isMuted = isMutedProp;
  const [isSeeking, setIsSeeking] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<SleepTimer>({ isActive: false, endTime: null, remainingTime: 0 });
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const [addPlaylistMenuOpen, setAddPlaylistMenuOpen] = useState(false);
  const addPlaylistMenuRef = useRef<HTMLDivElement>(null);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const [playlistFeedback, setPlaylistFeedback] = useState(false);
  const [trackPlaylistIds, setTrackPlaylistIds] = useState<Set<string>>(new Set());
  const playlistFeedbackTimeoutRef = useRef<number | null>(null);

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
    if (isOffline) return;
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
  }, [isOffline, track]);

  useEffect(() => {
    if (!track || !playlistMutation || playlistMutation.track.videoId !== track.videoId) return;
    setTrackPlaylistIds((previous) => {
      const next = new Set(previous);
      if (playlistMutation.type === 'add') next.add(playlistMutation.playlistId);
      else next.delete(playlistMutation.playlistId);
      return next;
    });
  }, [playlistMutation, track]);

  // Close Add to Playlist popover on click outside
  useEffect(() => {
    if (!addPlaylistMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addPlaylistMenuRef.current && !addPlaylistMenuRef.current.contains(e.target as Node)) {
        setAddPlaylistMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addPlaylistMenuOpen]);

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
        const mp3Url = `/api/mp3?videoId=${encodeURIComponent(track.videoId)}`;
        if (cancelled) return;
        
        audio.src = mp3Url;
        audio.volume = 1;
        audio.load();
        
        if (!hasRestoredInitialTime.current) {
          hasRestoredInitialTime.current = true;
          if (resumeTime > 0) { audio.currentTime = resumeTime; setCurrentTime(resumeTime); }
        }
        
        if (autoPlay) {
          audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
      } catch (err) {
        if (!cancelled) { console.error('[Track Load Error]:', err); setIsPlaying(false); }
      }
    };

    void loadTrack();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.videoId]);

  // OS Lockscreen & Hardware Media Controls (MediaSession API)
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'YouTube Music',
      artwork: track.thumbnailUrl ? [{ src: track.thumbnailUrl, sizes: '512x512', type: 'image/png' }] : [],
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
  }, [volume, isMuted]);

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

      <div className="music-player relative w-full h-[96px] bg-[#0A0A0A] border-t border-[#00F2FE]/25 flex items-center px-5 justify-between z-30 select-none shrink-0">
        {/* Left Section: Track Info & Heart */}
        <div className="flex items-center gap-3 w-64 min-w-0">
          <div
            onClick={onToggleFullscreen}
            className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 shrink-0 cursor-pointer group relative shadow-md"
          >
            <img
              src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
              alt={track.title}
              className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
              <Maximize2 className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p
              onClick={onToggleFullscreen}
              className="text-sm font-medium text-white truncate hover:underline cursor-pointer"
            >
              {track.title}
            </p>
            <p className="text-xs text-white truncate hover:text-[#00F2FE] transition-colors hover:underline cursor-pointer">
              {cleanArtistName(track.artist)}
            </p>
          </div>
          {/* Playlist & Add-To-Playlist Buttons */}
          <div className="flex items-center gap-1 shrink-0 relative">
            {/* Library / Playlist button — reverted to icon, tooltip = "Playlist" */}
            <button
              onClick={handleOpenPlaylist}
              disabled={!onOpenPlaylist}
              className={`relative shrink-0 p-1.5 rounded-md transition-all duration-75 disabled:text-white/25 disabled:hover:bg-transparent ${
                playlistFeedback
                  ? 'text-white/40 bg-transparent'
                  : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
              }`}
              title="Show Playlist"
              aria-label="Show Playlist"
            >
              <Library className="w-4 h-4" />
            </button>

            {/* Add to Playlist button reflects whether the track is already saved */}
            <button
              onClick={() => setAddPlaylistMenuOpen((prev) => !prev)}
              disabled={!track}
              className={`relative shrink-0 p-1.5 rounded-md transition-all duration-75 disabled:text-white/25 disabled:hover:bg-transparent ${
                addPlaylistMenuOpen
                  ? 'text-[#00F2FE] bg-[#00F2FE]/10'
                  : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
              }`}
              title="Add to Playlist"
              aria-label="Add to Playlist"
            >
              {trackPlaylistIds.size > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-[#00F2FE]" strokeWidth={2.5} />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
            </button>

            {/* Add to Playlist Dropdown */}
            {addPlaylistMenuOpen && track && (
              <div ref={addPlaylistMenuRef} className="absolute bottom-12 left-0">
                <AddToPlaylistDropdown
                  track={track}
                  playlists={playlists}
                  onAdd={(t, pid) => {
                    onAddToPlaylist?.(t, pid);
                  }}
                  onRemove={(t, pid) => {
                    onRemoveFromPlaylist?.(t, pid);
                  }}
                  isOffline={isOffline}
                  onClose={() => setAddPlaylistMenuOpen(false)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Center Section: Controls & Progress */}
        <div className="flex-1 flex flex-col items-center gap-2 max-w-2xl px-5">
          {/* Top Control Buttons */}
          <div className="flex items-center gap-4">
            {/* Shuffle */}
            <button
              onClick={onToggleShuffle}
              className={`transition-colors relative p-1 ${isShuffle
                ? 'text-[#00F2FE]'
                : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
                }`}
              title="Enable shuffle"
            >
              <Shuffle className="w-4 h-4" />
              {isShuffle && (
                <div className="w-1 h-1 rounded-full bg-[#00F2FE] absolute -bottom-1 left-1/2 -translate-x-1/2" />
              )}
            </button>

            {/* Prev */}
            <button
              onClick={onPrev}
              disabled={!computedCanPrev}
              className="text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] disabled:text-white/25 transition-all duration-300 p-1 rounded-lg"
              title="Previous"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={handlePlayPause}
              className="w-8 h-8 rounded-2xl bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-black text-black" />
              ) : (
                <Play className="w-4 h-4 fill-black text-black ml-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              onClick={onNext}
              disabled={!computedCanNext}
              className="text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] disabled:text-white/25 transition-all duration-300 p-1 rounded-lg"
              title="Next"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            {/* Repeat */}
            <button
              onClick={onToggleRepeat}
              className={`transition-colors relative p-1 ${repeatMode !== 'off'
                ? 'text-[#00F2FE]'
                : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
                }`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
              {repeatMode !== 'off' && (
                <div className="w-1 h-1 rounded-full bg-[#00F2FE] absolute -bottom-1 left-1/2 -translate-x-1/2" />
              )}
            </button>
          </div>

          {/* Bottom Progress Bar */}
          <div className="flex items-center gap-2 w-full">
            <span className="text-[11px] font-medium text-white w-9 text-right shrink-0">
              {formatDuration(Math.floor(currentTime))}
            </span>
            <div className="relative flex-1 h-1 group flex items-center">
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
              <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                <div
                  className="h-full bg-[#00F2FE] group-hover:shadow-[0_0_12px_rgba(0,242,254,0.8)] rounded-full transition-none"
                  style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                />
              </div>
            </div>
            <span className="text-[11px] font-medium text-white w-9 shrink-0">
              {formatDuration(Math.floor(duration))}
            </span>
          </div>
        </div>

        {/* Right Section: Lyrics, Queue, Volume, Fullscreen */}
        <div className="flex items-center gap-3 w-80 justify-end">
          {/* Lyrics toggle */}
          <button
            onClick={onToggleLyrics}
            className={`p-1.5 rounded-md transition-colors ${isLyricsOpen ? 'text-[#00F2FE]' : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
              }`}
            title="Lyrics"
          >
            <Mic2 className="w-4 h-4" />
          </button>

          {/* Queue toggle */}
          <button
            onClick={onToggleQueue}
            className={`p-1.5 rounded-md transition-colors ${isQueueOpen ? 'text-[#00F2FE]' : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
              }`}
            title="Queue"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2 w-[140px] group relative">
            <button
              onClick={() => {
                if (onMuteChange) onMuteChange(!isMuted);
              }}
              className="text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300 p-1 rounded-lg shrink-0"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="relative flex-1 h-1.5 flex items-center group">
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
              <div className="relative w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all duration-200">
                {/* Active Volume Fill */}
                <div
                  className="h-full bg-[#00F2FE] rounded-full transition-all duration-75 group-hover:shadow-[0_0_10px_rgba(0,242,254,0.6)]"
                  style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Fullscreen Player toggle */}
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-md text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300"
            title="Full screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setTimerMenuOpen((p) => !p)}
              className={`p-1.5 rounded-md transition-all duration-300 ${sleepTimer.isActive ? 'text-[#00F2FE]' : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'}`}
              title="Sleep timer"
            >
              <Timer className="w-4 h-4" />
            </button>
            {timerMenuOpen && (
              <div className="absolute bottom-11 right-0 w-72 rounded-2xl border border-white/10 bg-[#121212] shadow-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Sleep timer</p>
                    <p className="text-xs text-white">
                      {sleepTimer.isActive ? `Ends in ${formatDuration(sleepTimer.remainingTime)}` : 'Stop playback automatically'}
                    </p>
                  </div>
                  {sleepTimer.isActive && (
                    <button onClick={clearSleepTimer} className="text-white hover:text-[#00F2FE] transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[15, 30, 60, 120].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => startSleepTimer(mins)}
                      className="rounded-xl bg-[#0A0A0A] hover:bg-[#1A1A1A] hover:text-[#00F2FE] hover:shadow-[0_0_14px_rgba(0,242,254,0.14)] px-3 py-2 text-sm text-white transition-all duration-300"
                    >
                      {mins < 60 ? `${mins} mins` : `${mins / 60} hr${mins > 60 ? 's' : ''}`}
                    </button>
                  ))}
                </div>

                <div className="mt-3 border-t border-white/5 pt-3">
                  <p className="text-xs uppercase tracking-widest text-white mb-2">Custom</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="hr"
                      className="w-16 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white outline-none focus:outline-none caret-[#00F2FE]"
                    />
                    <span className="text-white">:</span>
                    <input
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="mins"
                      className="w-20 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white outline-none focus:outline-none caret-[#00F2FE]"
                    />
                    <button
                      onClick={() => {
                        const hrs = Number(customHours || 0);
                        const mins = Number(customMinutes || 0);
                        if (hrs === 0 && mins === 0) return;
                        startSleepTimer(hrs * 60 + mins);
                      }}
                      className="ml-auto rounded-lg bg-[#00F2FE] px-3 py-2 text-sm font-semibold text-black hover:shadow-[0_0_18px_rgba(0,242,254,0.45)] transition-all duration-300"
                    >
                      Set
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
