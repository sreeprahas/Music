import React, { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';

interface ExpandedPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExpandedPlayerModal: React.FC<ExpandedPlayerModalProps> = ({ isOpen, onClose }) => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    playNext,
    playPrevious,
    toggleLikeTrack,
    currentTime,
    duration,
    seek,
    isShuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    library,
    queue,
    playTrack,
  } = usePlayer();

  const [activeTab, setActiveTab] = useState<'cover' | 'lyrics' | 'queue'>('cover');

  if (!isOpen || !currentTrack) return null;

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isLiked = library?.likedTrackIds.includes(currentTrack.id);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Karaoke sample lyrics synchronized by time ratio
  const sampleLyrics = [
    'I feel the pulse inside the sound',
    'Atmospheric echoes all around',
    'Hypnotic synths that take control',
    'Deep frequency straight to the soul',
    'Lost in the rhythm of the night',
    'Drenched in glowing crimson light',
    'Moving forward into the void',
    'Pure melodic technoid',
  ];

  const activeLyricIdx = Math.min(
    sampleLyrics.length - 1,
    Math.floor((currentTime / (duration || 1)) * sampleLyrics.length)
  );

  return (
    <div className="fixed inset-0 bg-[#0e0e0e]/98 backdrop-blur-3xl z-50 flex flex-col justify-between p-6 md:p-10 select-none animate-in fade-in duration-200">
      {/* Background Ambient Glow Tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#ff5540]/15 via-transparent to-[#0e0e0e] pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#ebbbb4] hover:text-white transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">keyboard_arrow_down</span>
        </button>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[#201f1f] p-1 rounded-full border border-white/10">
          <button
            onClick={() => setActiveTab('cover')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'cover' ? 'bg-[#ff5540] text-white' : 'text-[#ebbbb4]/60 hover:text-white'
            }`}
          >
            Cover
          </button>
          <button
            onClick={() => setActiveTab('lyrics')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'lyrics' ? 'bg-[#ff5540] text-white' : 'text-[#ebbbb4]/60 hover:text-white'
            }`}
          >
            Lyrics
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'queue' ? 'bg-[#ff5540] text-white' : 'text-[#ebbbb4]/60 hover:text-white'
            }`}
          >
            Up Next
          </button>
        </div>

        <button
          onClick={() => toggleLikeTrack(currentTrack.id)}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#ebbbb4] hover:text-[#ff5540] transition-colors cursor-pointer"
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

      {/* Main Display Container */}
      <div className="relative z-10 flex-1 flex items-center justify-center my-6 max-w-4xl mx-auto w-full">
        {activeTab === 'cover' && (
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16 w-full justify-center">
            <div className="w-72 h-72 md:w-96 md:h-96 rounded-2xl overflow-hidden shadow-2xl border border-white/10 shrink-0 relative group">
              <img
                src={currentTrack.thumbnailUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              {isPlaying && (
                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-[#ff5540] border border-[#ff5540]/30 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ff5540] animate-ping" />
                  Playing Audio
                </div>
              )}
            </div>

            <div className="flex-1 max-w-md space-y-3 text-center md:text-left">
              <span className="text-xs font-bold text-[#ff5540] uppercase tracking-widest bg-[#ff5540]/10 px-3 py-1 rounded-full border border-[#ff5540]/20">
                Playing Now
              </span>
              <h1 className="text-3xl md:text-5xl font-black text-[#e5e2e1] tracking-tight leading-tight">
                {currentTrack.title}
              </h1>
              <p className="text-base text-[#ebbbb4]/80 font-medium">{currentTrack.artist}</p>
              <p className="text-xs text-[#ebbbb4]/40 font-mono">
                YouTube ID: {currentTrack.videoId}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'lyrics' && (
          <div className="w-full max-w-2xl py-8 space-y-6 text-center overflow-y-auto max-h-[450px] hide-scrollbar">
            <p className="text-xs font-bold text-[#ff5540] uppercase tracking-widest mb-4">
              Synchronized Karaoke Lyrics
            </p>
            {sampleLyrics.map((line, idx) => (
              <p
                key={idx}
                className={`text-2xl md:text-3xl font-black transition-all cursor-pointer ${
                  idx === activeLyricIdx
                    ? 'text-[#ff5540] scale-105 drop-shadow-[0_0_15px_rgba(255,85,64,0.5)]'
                    : 'text-white/30 hover:text-white/60'
                }`}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="w-full max-w-2xl py-4 space-y-2 overflow-y-auto max-h-[450px] custom-scrollbar">
            <h3 className="text-xs font-bold text-[#ff5540] uppercase tracking-widest mb-4">
              Queue ({queue.length} items)
            </h3>
            {queue.map((track, idx) => (
              <div
                key={`q-${track.id}-${idx}`}
                onClick={() => playTrack(track, queue, idx)}
                className={`flex items-center justify-between p-3 rounded-xl hover:bg-[#252525] transition-colors cursor-pointer border ${
                  track.id === currentTrack.id
                    ? 'bg-[#353534]/50 border-[#ff5540]/40'
                    : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={track.thumbnailUrl}
                    alt={track.title}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#e5e2e1] truncate">{track.title}</p>
                    <p className="text-xs text-[#ebbbb4]/60 truncate">{track.artist}</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[20px] text-[#ff5540]">
                  {track.id === currentTrack.id ? 'graphic_eq' : 'play_arrow'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Controls Area */}
      <div className="relative z-10 max-w-xl mx-auto w-full space-y-4">
        {/* Scrubber */}
        <div className="space-y-1">
          <div className="relative h-2 bg-[#353534] rounded-full overflow-hidden cursor-pointer">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              className="h-full bg-[#ff5540] rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-mono text-[#ebbbb4]/60">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-8 pt-2">
          <button
            onClick={toggleShuffle}
            className={`transition-colors cursor-pointer ${
              isShuffle ? 'text-[#ff5540]' : 'text-[#ebbbb4]/60 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[26px]">shuffle</span>
          </button>

          <button
            onClick={playPrevious}
            className="text-[#ebbbb4] hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[36px]">skip_previous</span>
          </button>

          <button
            onClick={togglePlayPause}
            className="w-16 h-16 rounded-full bg-[#e5e2e1] text-[#131313] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-2xl"
          >
            <span className="material-symbols-outlined text-[40px] fill-1">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>

          <button
            onClick={playNext}
            className="text-[#ebbbb4] hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[36px]">skip_next</span>
          </button>

          <button
            onClick={toggleRepeat}
            className={`transition-colors cursor-pointer ${
              repeatMode !== 'off' ? 'text-[#ff5540]' : 'text-[#ebbbb4]/60 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[26px]">
              {repeatMode === 'one' ? 'repeat_one' : 'repeat'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

