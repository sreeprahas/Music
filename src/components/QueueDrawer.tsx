import React from 'react';
import { usePlayer } from '../context/PlayerContext';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
  const { queue, currentTrack, currentIndex, playTrack, removeFromQueue, clearQueue } = usePlayer();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 md:w-96 bg-[#201f1f] border-l border-white/10 z-50 flex flex-col shadow-2xl transition-transform animate-in slide-in-from-right duration-200 select-none">
      {/* Drawer Header */}
      <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#ff5540] text-[22px]">queue_music</span>
          <h3 className="font-bold text-[#e5e2e1] text-base">Up Next Queue</h3>
          <span className="text-xs text-[#ebbbb4]/60 font-mono">({queue.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="text-xs text-[#ebbbb4]/60 hover:text-[#ffb4ab] transition-colors p-1 flex items-center gap-1 cursor-pointer"
              title="Clear Queue"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              <span>Clear</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full text-[#ebbbb4]/60 hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      {/* Queue Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {queue.length === 0 ? (
          <div className="text-center py-12 text-[#ebbbb4]/40 text-xs">
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
                    ? 'bg-[#ff5540]/15 border border-[#ff5540]/30 text-white'
                    : 'bg-[#1c1b1b] hover:bg-[#353534]/50 text-[#e5e2e1]'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-[#252525] overflow-hidden shrink-0 relative group-hover:opacity-90">
                  <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover" />
                  <button
                    onClick={() => playTrack(track, queue, idx)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-white fill-1 text-[20px]">play_arrow</span>
                  </button>
                </div>

                <div className="flex-1 overflow-hidden min-w-0">
                  <div
                    onClick={() => playTrack(track, queue, idx)}
                    className={`text-xs font-semibold truncate cursor-pointer ${
                      isCurrentlyPlaying ? 'text-[#ff5540]' : 'text-[#e5e2e1]'
                    }`}
                  >
                    {track.title}
                  </div>
                  <div className="text-[11px] text-[#ebbbb4]/60 truncate mt-0.5">{track.artist}</div>
                </div>

                <span className="text-[10px] text-[#ebbbb4]/50 font-mono shrink-0">
                  {track.durationFormatted || '3:30'}
                </span>

                <button
                  onClick={() => removeFromQueue(idx)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-md text-[#ebbbb4]/50 hover:text-[#ffb4ab] transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

