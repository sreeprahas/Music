'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Track, RepeatMode } from '@/types';
import { formatDuration, cleanArtistName } from '@/lib/ytmusicApi';
import { parseLRC, getActiveLyricIndex } from '@/lib/lyrics';
import type { LyricLine } from '@/lib/lyrics';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';

interface Props {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onClose: () => void;
  onStateChange?: (state: any) => void;
}

interface LyricsData {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  notFound?: boolean;
}

export function ExpandedPlayerModal({
  track,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isShuffle,
  repeatMode,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onClose,
  onStateChange,
}: Props) {
  /* ── Lyrics state ── */
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [parsedLines, setParsedLines] = useState<LyricLine[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeRef = useRef<HTMLDivElement>(null);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const lastFetchKey = useRef('');

  const fetchLyrics = useCallback(async (title: string, artist: string) => {
    setLoadingLyrics(true);
    setLyricsData(null);
    setParsedLines([]);
    try {
      const res = await fetch(
        `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
      );
      const data: LyricsData = await res.json();
      setLyricsData(data);
      if (data.syncedLyrics) setParsedLines(parseLRC(data.syncedLyrics));
    } catch {
      setLyricsData({ syncedLyrics: null, plainLyrics: null });
    } finally {
      setLoadingLyrics(false);
    }
  }, []);

  useEffect(() => {
    if (!track) return;
    const key = `${track.title}|${track.artist}`;
    if (key === lastFetchKey.current) return;
    lastFetchKey.current = key;
    fetchLyrics(track.title, track.artist);
  }, [track?.title, track?.artist, fetchLyrics]);

  // Sync active lyric line
  useEffect(() => {
    if (!parsedLines.length) return;
    setActiveIndex(getActiveLyricIndex(parsedLines, currentTime));
  }, [currentTime, parsedLines]);

  // Auto-scroll lyrics
  useEffect(() => {
    if (activeRef.current && lyricsScrollRef.current) {
      const c = lyricsScrollRef.current;
      const el = activeRef.current;
      c.scrollTo({ top: el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
    }
  }, [activeIndex]);

  if (!track) return null;

  const hasSynced = parsedLines.length > 0;
  const hasPlain = !!lyricsData?.plainLyrics;
  const hasLyrics = hasSynced || hasPlain;

  return (
    <div className="fixed inset-0 z-50 bg-[#070707] overflow-hidden flex flex-col">
      {/* Blurred album art background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
          alt=""
          className="w-full h-full object-cover scale-125 blur-3xl opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
      </div>

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5 pb-2 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-[#0A0A0A] hover:bg-[#1A1A1A] text-white hover:text-[#00F2FE] hover:shadow-[0_0_16px_rgba(0,242,254,0.16)] transition-all duration-300"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
        <p className="text-sm font-bold text-white tracking-widest uppercase text-center">
          Now Playing
        </p>
        <div className="w-9" />
      </div>

      {/* Content area */}
      <div className="relative z-10 flex-1 min-h-0 flex gap-0 overflow-hidden px-4 sm:px-8 pb-4">
        {/* Left column: Art + Controls */}
        <div
          className={`flex flex-col justify-between min-h-0 overflow-hidden ${
            hasLyrics ? 'w-1/2 pr-6' : 'w-full max-w-lg mx-auto'
          }`}
        >
          {/* Album art */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-4">
            <div
              className={`rounded-2xl overflow-hidden shadow-2xl bg-white/5 aspect-square ${
                hasLyrics ? 'max-h-[min(45vw,300px)] w-full' : 'max-h-[min(45vh,360px)] w-auto max-w-[360px]'
              }`}
            >
              <img
                src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Track info */}
          <div className="shrink-0 space-y-4 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-black text-white truncate tracking-tight leading-tight">
                  {track.title}
                </h2>
                <p className="text-sm text-white truncate mt-0.5 font-medium">{cleanArtistName(track.artist)}</p>
              </div>
            </div>

            {/* Seek bar */}
            <div className="space-y-1.5">
              <div className="relative h-2 group flex items-center">
                <input
                  type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
                  onChange={(e) => onSeek(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer z-10 h-full"
                />
                <div className="h-1.5 w-full bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-white">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <span>{formatDuration(Math.floor(duration))}</span>
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-between">
              <button onClick={onToggleShuffle}
                className={`p-2.5 rounded-2xl transition-all duration-300 ${isShuffle ? 'text-[#00F2FE] bg-[#00F2FE]/10' : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'}`}>
                <Shuffle className="w-5 h-5" />
              </button>
              <button onClick={onPrev} className="p-2 rounded-xl text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300">
                <SkipBack className="w-7 h-7" />
              </button>
              <button onClick={onPlayPause}
                className="w-14 h-14 rounded-3xl bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl">
                {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-0.5" />}
              </button>
              <button onClick={onNext} className="p-2 rounded-xl text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300">
                <SkipForward className="w-7 h-7" />
              </button>
              <button onClick={onToggleRepeat}
                className={`p-2.5 rounded-2xl transition-all duration-300 ${repeatMode !== 'off' ? 'text-[#00F2FE] bg-[#00F2FE]/10' : 'text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A]'}`}>
                {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2 max-w-[160px]">
              <button onClick={onToggleMute} className="text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300 p-1 rounded-lg shrink-0">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <div className="relative flex-1 h-1 flex items-center group">
                <input
                  type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer z-10 h-full"
                  aria-label="Volume"
                />
                <div className="h-1 w-full bg-white/15 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                  <div className="h-full bg-[#00F2FE] group-hover:shadow-[0_0_12px_rgba(0,242,254,0.8)] rounded-full" style={{ width: `${(isMuted ? 0 : volume) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Lyrics (only when available) */}
        {hasLyrics && (
          <div className="w-1/2 pl-8 border-l border-white/5 flex flex-col min-h-0 overflow-hidden select-none">
            <div className="shrink-0 mb-3 flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-widest">Lyrics</span>
              {loadingLyrics && <Loader2 className="w-3 h-3 text-[#00F2FE] animate-spin" />}
              {!hasSynced && hasPlain && (
                <span className="text-[10px] text-white uppercase tracking-wider">Plain</span>
              )}
            </div>

            <div ref={lyricsScrollRef} className="flex-1 overflow-y-auto px-2 min-h-0">
              {loadingLyrics && (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 text-[#00F2FE] animate-spin" />
                </div>
              )}

              {/* Synced lyrics — smooth non-janky highlight */}
              {!loadingLyrics && hasSynced && (
                <div className="py-28 space-y-1">
                  {parsedLines.map((line, i) => {
                    const isActive = i === activeIndex;
                    return (
                      <div
                        key={i}
                        ref={isActive ? activeRef : undefined}
                        onClick={() => onSeek(line.time)}
                        className={`group px-3 py-2 rounded-xl cursor-pointer transition-all duration-300 ease-out origin-left ${
                          isActive ? 'bg-white/5 border border-white/5 shadow-inner' : 'hover:bg-white/3'
                        }`}
                      >
                        <p className={`text-xl font-bold leading-snug tracking-tight transition-all duration-300 ease-out ${
                          isActive
                            ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.45)] scale-[1.02]'
                            : 'text-white group-hover:text-[#00F2FE] scale-100'
                        }`}>
                          {line.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Plain lyrics */}
              {!loadingLyrics && !hasSynced && hasPlain && (
                <div className="space-y-3 py-4">
                  {lyricsData!.plainLyrics!.split('\n').map((line, i) => (
                    <p key={i} className={`text-base font-semibold leading-relaxed ${
                      line.trim() ? 'text-white hover:text-[#00F2FE] cursor-default transition-colors' : 'my-2'
                    }`}>
                      {line.trim() || '\u00A0'}
                    </p>
                  ))}
                </div>
              )}

              {!loadingLyrics && lyricsData?.notFound && (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <p className="text-sm text-white">No lyrics available</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
