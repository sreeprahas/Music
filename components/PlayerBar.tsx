'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Track, RepeatMode, SleepTimer } from '@/types';
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
  Timer,
  X,
} from 'lucide-react';

interface Props {
  track: Track | null;
  queue: Track[];
  onNext: () => void;
  onPrev: () => void;
  onTrackEnd: () => void;
  onToggleQueue: () => void;
  onToggleLyrics: () => void;
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
}

export function PlayerBar({
  track,
  queue,
  onNext,
  onPrev,
  onTrackEnd,
  onToggleQueue,
  onToggleLyrics,
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
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('yt_playback_volume');
      return saved ? parseFloat(saved) : 1;
    } catch { return 1; }
  });
  const [isMuted, setIsMuted] = useState(() => {
    try {
      const saved = localStorage.getItem('yt_playback_muted');
      return saved ? JSON.parse(saved) : false;
    } catch { return false; }
  });
  const [isSeeking, setIsSeeking] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<SleepTimer>({ isActive: false, endTime: null, remainingTime: 0 });
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');

  const setIsPlaying = useCallback((val: boolean | ((p: boolean) => boolean)) => {
    setIsPlayingState(val);
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

  // Dynamic Loudness AGC (Automatic Gain Control) Pipeline
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let animFrameId: number;

    const setupAudioPipeline = () => {
      if (audioCtxRef.current) return;
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();

        // Nodes: Source -> Analyser -> DynamicsCompressor -> Auto-Gain -> Destination
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-20, ctx.currentTime);
        compressor.knee.setValueAtTime(20, ctx.currentTime);
        compressor.ratio.setValueAtTime(8, ctx.currentTime);
        compressor.attack.setValueAtTime(0.005, ctx.currentTime);
        compressor.release.setValueAtTime(0.1, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

        source.connect(analyser);
        analyser.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(ctx.destination);

        audioCtxRef.current = ctx;
        gainNodeRef.current = gainNode;

        // Real-time RMS Loudness measurement and automatic gain correction loop
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const targetLoudnessRms = 0.18; // Desired calibrated playback RMS level

        const autoLevelLoop = () => {
          if (audio && !audio.paused && audio.readyState >= 2) {
            analyser.getByteTimeDomainData(dataArray);
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const norm = (dataArray[i] - 128) / 128;
              sumSquares += norm * norm;
            }
            const currentRms = Math.sqrt(sumSquares / dataArray.length);

            // Dynamically adjust gain if song is louder or softer than target
            if (currentRms > 0.02) {
              const delta = targetLoudnessRms / currentRms;
              const clampedGain = Math.min(Math.max(delta, 0.4), 2.5); // Smooth safety gain bounds
              // Smooth exponential ramp to prevent audio artifacts or clicks
              gainNode.gain.setTargetAtTime(clampedGain, ctx.currentTime, 0.15);
            }
          }
          animFrameId = requestAnimationFrame(autoLevelLoop);
        };

        autoLevelLoop();
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
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, []);

  // Load track when changed
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

    const srcUrl = `/api/mp3?videoId=${track.videoId}`;
    if (audio.src !== window.location.origin + srcUrl) {
      audio.src = srcUrl;
    }
    audio.volume = isMuted ? 0 : volume;

    if (!hasRestoredInitialTime.current) {
      hasRestoredInitialTime.current = true;
      if (resumeTime > 0) {
        audio.currentTime = resumeTime;
        setCurrentTime(resumeTime);
      }
    }

    if (autoPlay) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsPlaying(false);
            const resumeOnInteraction = () => {
              audio.play().then(() => setIsPlaying(true)).catch(() => {});
              window.removeEventListener('click', resumeOnInteraction);
              window.removeEventListener('keydown', resumeOnInteraction);
            };
            window.addEventListener('click', resumeOnInteraction, { once: true });
            window.addEventListener('keydown', resumeOnInteraction, { once: true });
          });
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.videoId]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // The fullscreen player shares this audio element, so its controls must see every update.
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isPlaying, duration, volume, isMuted });
    }
  }, [volume, isMuted, isPlaying, duration, onStateChange]);



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
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < queue.length - 1;

  if (!track) {
    return null;
  }

  return (
    <>
      <audio
        ref={audioRef}
        onVolumeChange={() => {
          if (!audioRef.current) return;
          setVolume(audioRef.current.volume);
          setIsMuted(audioRef.current.volume === 0);
        }}
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

      <div className="relative w-full h-[92px] bg-[#0A0A0A] border-t border-[#00F2FE]/25 flex items-center px-5 justify-between z-30 select-none shrink-0">
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
              disabled={!canPrev}
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
              disabled={!canNext}
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
              onClick={() => setIsMuted((m: boolean) => !m)}
              className="text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300 p-1 rounded-lg shrink-0"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-[#00F2FE]" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="relative flex-1 h-1 flex items-center">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={isMuted ? 0 : Math.round(volume * 100)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) / 100;
                  setIsMuted(false);
                  setVolume(val);
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10 h-full"
                aria-label="Volume"
              />
              <div className="h-1 w-full bg-white/15 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                <div
                  className={`h-full group-hover:shadow-[0_0_12px_rgba(0,242,254,0.8)] rounded-full transition-colors ${
                    !isMuted && volume * 100 > 90
                      ? 'bg-amber-400'
                      : 'bg-[#00F2FE]'
                  }`}
                  style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
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
