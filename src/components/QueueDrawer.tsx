import React from 'react';
import { X, Trash2, Play, Music, GripVertical } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
  const { queue, currentTrack, currentIndex, playTrack, removeFromQueue, clearQueue } = usePlayer();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 md:w-96 bg-[#121212] border-l border-white/10 z-40 flex flex-col shadow-2xl transition-transform animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-red-500" />
          <h3 className="font-bold text-white text-base">Up Next Queue</h3>
          <span className="text-xs text-neutral-400 font-mono">({queue.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="text-xs text-neutral-400 hover:text-red-400 transition-colors p-1 flex items-center gap-1 cursor-pointer"
              title="Clear Queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Queue Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {queue.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-sm">
            Queue is empty. Play a song or playlist to populate queue.
          </div>
        ) : (
          queue.map((track, idx) => {
            const isCurrentlyPlaying = currentTrack?.id === track.id && idx === currentIndex;
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-all group ${
                  isCurrentlyPlaying
                    ? 'bg-red-600/15 border border-red-500/30 text-white'
                    : 'bg-[#1a1a1a] hover:bg-[#252525] text-neutral-300'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-[#222] overflow-hidden shrink-0 relative group-hover:opacity-90">
                  <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover" />
                  <button
                    onClick={() => playTrack(track, queue, idx)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white text-white" />
                  </button>
                </div>

                <div className="flex-1 overflow-hidden min-w-0">
                  <div className={`text-xs font-semibold truncate ${isCurrentlyPlaying ? 'text-red-400' : 'text-white'}`}>
                    {track.title}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate mt-0.5">{track.artist}</div>
                </div>

                <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                  {track.durationFormatted || '3:30'}
                </span>

                <button
                  onClick={() => removeFromQueue(idx)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-md text-neutral-400 hover:text-red-400 transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
