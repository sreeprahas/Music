import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { SLEEP_TIMER_PRESETS } from '../types';

interface PlayerBarProps {
  onToggleQueue: () => void;
  onToggleExpanded: () => void;
  onToggleLyrics?: () => void;
  isQueueOpen: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  onToggleQueue,
  onToggleExpanded,
  onToggleLyrics,
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
    library,
    // Sleep Timer
    sleepTimer,
    sleepTimerPresets,
    setSleepTimer,
    clearSleepTimer,
    setCustomSleepTimer,
  } = usePlayer();

  const [isHoveringSeek, setIsHoveringSeek] = useState(false);
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatSleepTime = (ms: number) => {
    if (ms <= 0) return '0:00';
    const totalSecs = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  const handlePresetClick = (durationSec: number) => {
    setSleepTimer(durationSec * 1000);
    setShowSleepTimerModal(false);
  };

  const handleCustomClick = () => {
    const hours = parseInt(customHours) || 0;
    const minutes = parseInt(customMinutes) || 0;
    if (hours > 0 || minutes > 0) {
      setCustomSleepTimer(hours, minutes);
      setShowSleepTimerModal(false);
      setCustomHours('');
      setCustomMinutes('');
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isLiked = currentTrack && library?.likedTrackIds.includes(currentTrack.id);

  if (!currentTrack) {
    return (
      <footer className="fixed bottom-0 left-0 w-full z-50 h-[80px] bg-[#1a1a1a]/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-between px-6 shadow-2xl select-none">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded bg-[#252525] flex items-center justify-center border border-white/5">
            <span className="material-symbols-outlined text-[#ebbbb4]/40">music_note</span>
          </div>
          <div>
            <p className="font-bold text-sm text-[#e5e2e1]">No track selected</p>
            <p className="text-xs text-[#ebbbb4]/50">Choose a song from your library or quick picks</p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="fixed bottom-0 left-0 w-full z-50 h-[80px] bg-[#201f1f]/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-between px-6 shadow-2xl select-none">
      {/* Optional Stream Error Popup Banner */}
      {streamError && (
        <div className="absolute top-0 left-0 right-0 -translate-y-full bg-[#93000a] text-[#ffdad6] text-xs px-6 py-2 flex items-center justify-between z-50 border-t border-red-500/30">
          <span>{streamError}</span>
          <button
            onClick={() => playNext()}
            className="underline font-bold hover:text-white cursor-pointer"
          >
            Skip Next Track
          </button>
        </div>
      )}

      {/* Left: Now Playing Info */}
      <div className="flex items-center gap-4 w-1/4">
        <div
          onClick={onToggleExpanded}
          className="w-14 h-14 rounded overflow-hidden shrink-0 cursor-pointer border border-white/10 relative group bg-[#252525]"
        >
          <img
            src={currentTrack.thumbnailUrl}
            alt={currentTrack.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <span className="material-symbols-outlined text-white text-[20px]">fullscreen</span>
          </div>
        </div>

        <div className="min-w-0">
          <p
            onClick={onToggleExpanded}
            className="font-bold text-sm text-[#e5e2e1] truncate hover:text-[#ff5540] cursor-pointer transition-colors"
          >
            {currentTrack.title}
          </p>
          <p className="text-xs text-[#ebbbb4]/60 truncate mt-0.5">{currentTrack.artist}</p>
        </div>

        <button
          onClick={() => toggleLikeTrack(currentTrack.id)}
          title="Like Song"
          className="text-[#ebbbb4]/60 hover:text-[#ff5540] transition-colors ml-2 cursor-pointer shrink-0"
        >
          <span
            className={`material-symbols-outlined text-[22px] ${
              isLiked ? 'text-[#ff5540] fill-1' : ''
            }`}
          >
            favorite
          </span>
        </button>
      </div>

      {/* Center Controls & Progress Bar */}
      <div className="flex flex-col items-center gap-2 w-1/2 max-w-xl">
        <div className="flex items-center gap-7">
          {/* Shuffle Button */}
          <button
            onClick={toggleShuffle}
            title="Toggle Shuffle Mode"
            className={`transition-colors cursor-pointer ${
              isShuffle ? 'text-[#ff5540]' : 'text-[#ebbbb4]/60 hover:text-[#e5e2e1]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">shuffle</span>
          </button>

          {/* Previous Track */}
          <button
            onClick={playPrevious}
            title="Previous Track"
            className="text-[#ebbbb4]/60 hover:text-[#e5e2e1] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[26px]">skip_previous</span>
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
            disabled={isLoadingStream}
            className="w-10 h-10 rounded-full bg-[#e5e2e1] text-[#131313] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-lg disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[30px] fill-1">
              {isLoadingStream ? 'sync' : isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>

          {/* Next Track */}
          <button
            onClick={playNext}
            title="Next Track"
            className="text-[#ebbbb4]/60 hover:text-[#e5e2e1] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[26px]">skip_next</span>
          </button>

          {/* Repeat Button */}
          <button
            onClick={toggleRepeat}
            title={`Repeat: ${repeatMode}`}
            className={`transition-colors cursor-pointer ${
              repeatMode !== 'off' ? 'text-[#ff5540]' : 'text-[#ebbbb4]/60 hover:text-[#e5e2e1]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {repeatMode === 'one' ? 'repeat_one' : 'repeat'}
            </span>
          </button>
        </div>

        {/* Progress Bar & Timestamps */}
        <div className="w-full flex items-center gap-3">
          <span className="text-[10px] font-mono text-[#ebbbb4]/60 w-8 text-right shrink-0">
            {formatTime(currentTime)}
          </span>

          <div
            onMouseEnter={() => setIsHoveringSeek(true)}
            onMouseLeave={() => setIsHoveringSeek(false)}
            className="flex-1 h-1.5 bg-[#353534] rounded-full relative group cursor-pointer flex items-center"
          >
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              className="h-full bg-[#ff5540] rounded-full transition-all relative"
              style={{ width: `${progressPercent}%` }}
            >
              <div
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md transition-opacity ${
                  isHoveringSeek ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          </div>

          <span className="text-[10px] font-mono text-[#ebbbb4]/60 w-8 shrink-0">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Right Actions: Lyrics, Queue, Sleep Timer, Volume, Fullscreen */}
      <div className="flex items-center justify-end gap-4 w-1/4">
        {/* Lyrics Button */}
        <button
          onClick={onToggleLyrics || onToggleExpanded}
          title="Track Lyrics"
          className="text-[#ebbbb4]/60 hover:text-[#e5e2e1] transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">lyrics</span>
        </button>

        {/* Queue Drawer Button */}
        <button
          onClick={onToggleQueue}
          title="Queue / Up Next"
          className={`transition-colors cursor-pointer relative ${
            isQueueOpen ? 'text-[#ff5540]' : 'text-[#ebbbb4]/60 hover:text-[#e5e2e1]'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">queue_music</span>
          {queue.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff5540] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {queue.length}
            </span>
          )}
        </button>

        {/* Sleep Timer Button */}
        <div className="relative">
          <button
            onClick={() => setShowSleepTimerModal(!showSleepTimerModal)}
            title="Sleep Timer"
            className={`transition-colors cursor-pointer p-1.5 rounded-full ${
              sleepTimer.isActive ? 'text-[#ff5540] bg-[#ff5540]/10' : 'text-[#ebbbb4]/60 hover:text-[#e5e2e1] hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">
              {sleepTimer.isActive ? 'bedtime' : 'bedtime'}
            </span>
            {sleepTimer.isActive && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff5540] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                ●
              </span>
            )}
          </button>

          {/* Sleep Timer Modal */}
          {showSleepTimerModal && (
            <div className="absolute bottom-full right-0 mb-2 w-56 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-4 z-50 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Sleep Timer</h3>
                {sleepTimer.isActive && (
                  <button
                    onClick={clearSleepTimer}
                    className="text-xs text-[#ff5540] hover:text-[#ff7766] font-medium"
                  >
                    Cancel Timer
                  </button>
                )}
              </div>

              {sleepTimer.isActive && (
                <div className="mb-3 p-2 bg-[#ff5540]/10 border border-[#ff5540]/20 rounded-lg text-center">
                  <p className="text-xs text-white/50">Time Remaining</p>
                  <p className="font-mono text-sm text-[#ff5540] font-bold">
                    {formatSleepTime(sleepTimer.remainingTime)}
                  </p>
                </div>
              )}

              <div className="space-y-2 mb-3">
                {sleepTimerPresets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset.duration)}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm transition-colors"
                  >
                    <span>{preset.label}</span>
                    <span className="material-symbols-outlined text-[18px] text-white/40">timer</span>
                  </button>
                ))}
              </div>

              <div className="border-t border-white/5 pt-3">
                <p className="text-xs text-white/40 mb-2">Custom Time</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    placeholder="Hrs"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    className="w-1/2 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#ff5540]/50"
                  />
                  <span className="text-white/40">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="Min"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    className="w-1/2 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#ff5540]/50"
                  />
                  <button
                    onClick={handleCustomClick}
                    className="ml-1 px-3 py-1.5 bg-[#ff5540] hover:bg-[#ff3322] rounded-lg text-white text-xs font-medium transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Volume Slider Control */}
        <div className="flex items-center gap-2 group">
          <button
            onClick={toggleMute}
            title="Mute / Unmute"
            className="text-[#ebbbb4]/60 hover:text-[#e5e2e1] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isMuted || volume === 0 ? 'volume_off' : 'volume_up'}
            </span>
          </button>
          <div className="w-24 h-1.5 bg-[#353534] rounded-full overflow-hidden relative cursor-pointer flex items-center">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              className="h-full bg-[#e5e2e1] group-hover:bg-[#ff5540] transition-colors rounded-full"
              style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
            />
          </div>
        </div>

        {/* Fullscreen Player Modal Button */}
        <button
          onClick={onToggleExpanded}
          title="Fullscreen Player"
          className="text-[#ebbbb4]/60 hover:text-[#e5e2e1] transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">fullscreen</span>
        </button>
      </div>
    </footer>
  );
};

