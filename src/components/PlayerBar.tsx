import React, { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  ListMusic,
  Maximize2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

interface PlayerBarProps {
  onToggleQueue: () => void;
  onToggleExpanded: () => void;
  isQueueOpen: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  onToggleQueue,
  onToggleExpanded,
  isQueueOpen,
}) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    isLoadingStream,
    streamError,
    togglePlayPause,
    seek,
    setVolume,
    toggleMute,
    playNext,
    playPrevious,
    toggleShuffle,
    toggleRepeat,
    toggleLikeTrack,
    queue,
  } = usePlayer();

  const [hoverSeekTime, setHoverSeekTime] = useState<number | null>(null);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentTrack) {
    return (
      <footer className="h-20 bg-[#0f0f0f] border-t border-white/10 px-6 flex items-center justify-between text-neutral-500 text-xs shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#222] flex items-center justify-center border border-white/5">
            <span className="text-xl">🎵</span>
          </div>
          <div>
            <div className="font-medium text-neutral-400">No track selected</div>
            <div className="text-[11px] text-neutral-600">Select or search a song to play</div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="h-22 bg-[#000000] border-t border-white/10 px-4 md:px-6 flex flex-col justify-between shrink-0 select-none relative z-30 shadow-2xl">
      {/* Stream Error Alert */}
      {streamError && (
        <div className="absolute top-0 left-0 right-0 -translate-y-full bg-red-900/90 text-red-200 text-xs px-4 py-1.5 flex items-center justify-between z-40 border-t border-red-500/30">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{streamError}</span>
          </div>
          <button onClick={() => playNext()} className="underline hover:text-white cursor-pointer font-semibold">
            Skip Next
          </button>
        </div>
      )}

      {/* Top Scrubber / Seek Bar */}
      <div className="pt-2">
        <div className="relative group flex items-center gap-3">
          <span className="text-[11px] font-mono text-neutral-400 w-10 text-right shrink-0">
            {formatTime(currentTime)}
          </span>

          <div className="relative flex-1 h-3 flex items-center cursor-pointer">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                setHoverSeekTime(pos * (duration || 100));
              }}
              onMouseLeave={() => setHoverSeekTime(null)}
              className="absolute inset-0 w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-red-600 focus:outline-none"
            />
            <div
              className="absolute left-0 h-1 bg-red-600 rounded-full pointer-events-none"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <span className="text-[11px] font-mono text-neutral-400 w-10 shrink-0">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Controls & Track Details */}
      <div className="flex items-center justify-between gap-4 py-1.5 flex-1">
        {/* Left Track Info */}
        <div className="flex items-center gap-3 min-w-[200px] max-w-[30%]">
          <div className="relative w-12 h-12 rounded-lg bg-[#222] overflow-hidden shrink-0 border border-white/10 group cursor-pointer" onClick={onToggleExpanded}>
            <img src={currentTrack.thumbnailUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 className="w-4 h-4 text-white" />
            </div>
            {isLoadingStream && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
              </div>
            )}
          </div>

          <div className="overflow-hidden">
            <div className="font-semibold text-sm text-white truncate hover:underline cursor-pointer" onClick={onToggleExpanded}>
              {currentTrack.title}
            </div>
            <div className="text-xs text-neutral-400 truncate">{currentTrack.artist}</div>
          </div>

          <button
            onClick={() => toggleLikeTrack(currentTrack.id)}
            className="p-1.5 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0 ml-1"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                currentTrack.liked ? 'text-red-500 fill-red-500' : ''
              }`}
            />
          </button>
        </div>

        {/* Center Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            title="Shuffle"
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              isShuffle ? 'text-red-500 bg-red-500/10' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={playPrevious}
            title="Previous Track"
            className="p-2 text-neutral-300 hover:text-white transition-colors cursor-pointer"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={togglePlayPause}
            disabled={isLoadingStream}
            className="w-10 h-10 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isLoadingStream ? (
              <Loader2 className="w-5 h-5 animate-spin text-black" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-black" />
            ) : (
              <Play className="w-5 h-5 fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={playNext}
            title="Next Track"
            className="p-2 text-neutral-300 hover:text-white transition-colors cursor-pointer"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            onClick={toggleRepeat}
            title={`Repeat: ${repeatMode}`}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              repeatMode !== 'off' ? 'text-red-500 bg-red-500/10' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Right Controls (Queue & Volume) */}
        <div className="flex items-center gap-3 min-w-[180px] justify-end">
          <button
            onClick={onToggleQueue}
            title="Queue / Up Next"
            className={`p-2 rounded-lg relative transition-colors cursor-pointer ${
              isQueueOpen ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ListMusic className="w-5 h-5" />
            {queue.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                {queue.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 group">
            <button onClick={toggleMute} className="text-neutral-400 hover:text-white cursor-pointer">
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20 h-1 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-white"
            />
          </div>

          <button
            onClick={onToggleExpanded}
            title="Expand Fullscreen Player"
            className="p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </footer>
  );
};
