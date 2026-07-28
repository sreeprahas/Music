'use client';

import React from 'react';
import type { Track, RepeatMode } from '@/types';
import { formatDuration, cleanArtistName } from '@/lib/ytmusicApi';
import { LyricsDrawer } from './LyricsDrawer';
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
}: Props) {
  if (!track) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#070707] overflow-hidden flex flex-col animate-in fade-in duration-300">
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
        <div className="w-full lg:w-1/2 flex flex-col justify-between min-h-0 overflow-hidden pr-0 lg:pr-6">
          {/* Album art */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-4">
            <div className="rounded-2xl overflow-hidden shadow-2xl bg-white/5 aspect-square max-h-[min(45vw,320px)] w-full">
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
                <p className="text-sm text-white/60 truncate mt-0.5 font-medium">{cleanArtistName(track.artist)}</p>
              </div>
            </div>

            {/* Seek bar */}
            <div className="space-y-1.5">
              <div className="relative h-2 group flex items-center">
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={currentTime}
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
              <div className="flex justify-between text-[11px] font-semibold text-white/60">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <span>{formatDuration(Math.floor(duration))}</span>
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-between">
              <button
                onClick={onToggleShuffle}
                className={`p-2.5 rounded-2xl transition-all duration-300 ${
                  isShuffle ? 'text-[#00F2FE] bg-[#00F2FE]/10' : 'text-white/70 hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
                }`}
              >
                <Shuffle className="w-5 h-5" />
              </button>
              <button
                onClick={onPrev}
                className="p-2 rounded-xl text-white/80 hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300"
              >
                <SkipBack className="w-7 h-7" />
              </button>
              <button
                onClick={onPlayPause}
                className="w-14 h-14 rounded-3xl bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-0.5" />}
              </button>
              <button
                onClick={onNext}
                className="p-2 rounded-xl text-white/80 hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300"
              >
                <SkipForward className="w-7 h-7" />
              </button>
              <button
                onClick={onToggleRepeat}
                className={`p-2.5 rounded-2xl transition-all duration-300 ${
                  repeatMode !== 'off' ? 'text-[#00F2FE] bg-[#00F2FE]/10' : 'text-white/70 hover:text-[#00F2FE] hover:bg-[#1A1A1A]'
                }`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2 max-w-[160px]">
              <button
                onClick={onToggleMute}
                className="text-white/70 hover:text-[#00F2FE] hover:bg-[#1A1A1A] transition-all duration-300 p-1 rounded-lg shrink-0"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <div className="relative flex-1 h-1 flex items-center group">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer z-10 h-full"
                  aria-label="Volume"
                />
                <div className="h-1 w-full bg-white/15 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                  <div
                    className="h-full bg-[#00F2FE] group-hover:shadow-[0_0_12px_rgba(0,242,254,0.8)] rounded-full"
                    style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Embedded Lyrics Panel using shared LyricsDrawer component */}
        <div className="hidden lg:block w-1/2 h-full border-l border-white/10 overflow-hidden rounded-2xl bg-black/40 backdrop-blur-md">
          <LyricsDrawer
            track={track}
            currentTime={currentTime}
            onClose={onClose}
            onSeek={onSeek}
          />
        </div>
      </div>
    </div>
  );
}
