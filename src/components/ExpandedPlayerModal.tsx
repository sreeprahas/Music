import React, { useState } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Heart, Music, Sparkles, Volume2, Info } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

interface ExpandedPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExpandedPlayerModal: React.FC<ExpandedPlayerModalProps> = ({ isOpen, onClose }) => {
  const { currentTrack, isPlaying, togglePlayPause, playNext, playPrevious, toggleLikeTrack, currentTime, duration, seek } = usePlayer();
  const [activeTab, setActiveTab] = useState<'visualizer' | 'info'>('visualizer');

  if (!isOpen || !currentTrack) return null;

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 bg-[#080808]/95 backdrop-blur-2xl z-50 flex flex-col justify-between p-6 md:p-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
            <Music className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-bold text-lg text-white">YouTube Music Player</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('visualizer')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'visualizer' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Visualizer
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'info' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Metadata Info
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer ml-4"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 my-8 max-w-5xl mx-auto w-full">
        {/* Large Album Art */}
        <div className="relative w-72 h-72 md:w-96 md:h-96 rounded-3xl overflow-hidden shadow-2xl border border-white/10 shrink-0 group">
          <img
            src={currentTrack.thumbnailUrl}
            alt={currentTrack.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />

          {/* Audio Wave Visualizer Overlay when playing */}
          {isPlaying && activeTab === 'visualizer' && (
            <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end justify-center gap-1.5 h-32">
              {[40, 70, 30, 90, 60, 100, 45, 80, 55, 95, 35, 75, 50, 85].map((h, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-red-500 rounded-full animate-pulse"
                  style={{
                    height: `${isPlaying ? h : 10}%`,
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: '0.8s',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Track Metadata & Interactive Controls */}
        <div className="flex-1 flex flex-col justify-center space-y-6 max-w-md w-full">
          {activeTab === 'visualizer' ? (
            <div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight leading-snug">
                    {currentTrack.title}
                  </h1>
                  <p className="text-base text-neutral-400 mt-1 font-medium">{currentTrack.artist}</p>
                </div>
                <button
                  onClick={() => toggleLikeTrack(currentTrack.id)}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-full cursor-pointer transition-colors"
                >
                  <Heart
                    className={`w-6 h-6 ${currentTrack.liked ? 'text-red-500 fill-red-500' : 'text-neutral-400'}`}
                  />
                </button>
              </div>

              {/* Progress Slider */}
              <div className="space-y-2 mt-8">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-red-600"
                />
                <div className="flex justify-between text-xs font-mono text-neutral-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-8 mt-8">
                <button onClick={playPrevious} className="p-3 text-neutral-300 hover:text-white cursor-pointer">
                  <SkipBack className="w-8 h-8" />
                </button>
                <button
                  onClick={togglePlayPause}
                  className="w-16 h-16 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center shadow-xl active:scale-95 transition-transform cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-8 h-8 fill-black" /> : <Play className="w-8 h-8 fill-black ml-1" />}
                </button>
                <button onClick={playNext} className="p-3 text-neutral-300 hover:text-white cursor-pointer">
                  <SkipForward className="w-8 h-8" />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <Info className="w-4 h-4" />
                <span>yt-dlp Track Metadata</span>
              </div>
              <div className="space-y-2 text-xs font-mono text-neutral-300">
                <div><span className="text-neutral-500">Video ID:</span> {currentTrack.videoId}</div>
                <div><span className="text-neutral-500">Title:</span> {currentTrack.title}</div>
                <div><span className="text-neutral-500">Artist / Channel:</span> {currentTrack.artist}</div>
                <div><span className="text-neutral-500">Duration:</span> {currentTrack.durationFormatted || formatTime(currentTrack.duration)}</div>
                <div><span className="text-neutral-500">Added Date:</span> {new Date(currentTrack.addedAt).toLocaleDateString()}</div>
                <div><span className="text-neutral-500">Storage Backend:</span> data/playlists.json</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-neutral-500">
        Streaming via Node.js yt-dlp process wrapper • Audio Proxy Active
      </div>
    </div>
  );
};
