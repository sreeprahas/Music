'use client';

import React, { useState } from 'react';
import type { Track, RepeatMode } from '@/types';
import {
  formatDuration,
  cleanArtistName,
  getTrackThumbnailUrl,
} from '@/lib/ytmusicFormat';
import { LyricsDrawer } from './LyricsDrawer';
import { VolumeControl } from './VolumeControl';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
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
  isClosing?: boolean;
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
  isClosing = false,
}: Props) {
  const [artworkRefreshKey] = useState(() => Date.now());

  if (!track) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-background overflow-hidden flex flex-col ${
        isClosing ? 'animate-slide-down-full' : 'animate-slide-up-full'
      }`}
    >
      {/* Header bar */}
      <div className="fullscreen-modal-header relative z-10 flex h-[72px] min-h-[72px] max-h-[72px] items-center justify-between border-b border-border bg-header px-6 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-background-secondary hover:bg-surface-hover text-text hover:text-accent hover:shadow-accent-soft transition-all duration-300"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <p className="text-sm font-bold text-text tracking-widest uppercase text-center">
          Now Playing
        </p>

        <div className="w-9" />
      </div>

      {/* Content area */}
      <div className="relative z-10 flex-1 min-h-0 flex gap-0 overflow-hidden px-4 sm:px-8 pt-4 pb-4">
        {/* Left column: Art + Controls */}
        <div className="w-full lg:w-1/2 flex flex-col justify-between min-h-0 overflow-hidden pr-0 lg:pr-6">
          {/* Album art */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-4">
            <div className="rounded-[4px] overflow-hidden shadow-2xl bg-transparent aspect-square w-full max-w-[min(45vw,320px)] shrink-0">
              <img
                src={getTrackThumbnailUrl(track, artworkRefreshKey)}
                alt={track.title}
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>

          {/* Track info */}
          <div className="shrink-0 space-y-4 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-black text-text truncate tracking-tight leading-tight">
                  {track.title}
                </h2>

                <p className="text-sm text-text-secondary truncate mt-0.5 font-medium">
                  {cleanArtistName(track.artist)}
                </p>
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

                <div className="h-1.5 w-full bg-surface-active rounded-full overflow-hidden">
                  <div
                    className="h-full bg-text rounded-full"
                    style={{
                      width:
                        duration > 0
                          ? `${(currentTime / duration) * 100}%`
                          : '0%',
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-[11px] font-semibold text-text-secondary">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <span>{formatDuration(Math.floor(duration))}</span>
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-between">
              <button
                onClick={onToggleShuffle}
                className={`p-2.5 rounded-2xl transition-all duration-300 ${
                  isShuffle
                    ? 'text-accent bg-accent/10'
                    : 'text-text-secondary hover:text-accent hover:bg-surface-hover'
                }`}
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                onClick={onPrev}
                className="p-2 rounded-xl text-text-secondary hover:text-accent hover:bg-surface-hover transition-all duration-300"
              >
                <SkipBack className="w-7 h-7" />
              </button>

              <button
                onClick={onPlayPause}
                className="w-14 h-14 rounded-3xl bg-text text-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-background" />
                ) : (
                  <Play className="w-6 h-6 fill-background ml-0.5" />
                )}
              </button>

              <button
                onClick={onNext}
                className="p-2 rounded-xl text-text-secondary hover:text-accent hover:bg-surface-hover transition-all duration-300"
              >
                <SkipForward className="w-7 h-7" />
              </button>

              <button
                onClick={onToggleRepeat}
                className={`p-2.5 rounded-2xl transition-all duration-300 ${
                  repeatMode !== 'off'
                    ? 'text-accent bg-accent/10'
                    : 'text-text-secondary hover:text-accent hover:bg-surface-hover'
                }`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-5 h-5" />
                ) : (
                  <Repeat className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Volume */}
            <VolumeControl
              volume={volume}
              isMuted={isMuted}
              onVolumeChange={onVolumeChange}
              onToggleMute={onToggleMute}
              className="w-full max-w-[150px]"
              iconClassName="h-4 w-4"
            />
          </div>
        </div>

        {/* Right column: Embedded Lyrics Panel */}
        <div className="hidden lg:block w-1/2 h-full border-l border-border overflow-hidden rounded-2xl bg-overlay/55">
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