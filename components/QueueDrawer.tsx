'use client';

import React from 'react';
import type { Track } from '@/types';
import { formatDuration, cleanArtistName } from '@/lib/ytmusicApi';
import { X, Trash2 } from 'lucide-react';

interface Props {
  currentTrack: Track | null;
  queue: Track[];
  onClose: () => void;
  onPlayTrack: (track: Track) => void;
  onRemoveFromQueue: (videoId: string) => void;
  onClearQueue: () => void;
}

export function QueueDrawer({
  currentTrack,
  queue,
  onClose,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
}: Props) {
  const currentIdx = currentTrack
    ? queue.findIndex((t) => t.videoId === currentTrack.videoId)
    : -1;
  const nextUp = currentIdx >= 0 ? queue.slice(currentIdx + 1) : queue;

  return (
    <div className="h-full w-full bg-[#0A0A0A]/95 backdrop-blur-xl flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <h3 className="text-sm font-bold text-white tracking-tight">Play Queue</h3>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white transition-colors p-1.5 rounded-2xl hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scrollbar-thin min-h-0">
        {/* Now Playing */}
        {currentTrack && (
          <div>
            <h4 className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">
              Now Playing
            </h4>
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/4 border border-white/5">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 shrink-0">
                <img
                  src={`/api/thumbnail?videoId=${currentTrack.videoId}&url=${encodeURIComponent(currentTrack.thumbnailUrl)}`}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#00F2FE] text-sm font-semibold truncate">{currentTrack.title}</p>
                <p className="text-xs text-white/40 truncate">{cleanArtistName(currentTrack.artist)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Next Up */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-white/25 uppercase tracking-widest">
              Next Up ({nextUp.length})
            </h4>
            {nextUp.length > 0 && (
              <button
                onClick={onClearQueue}
                className="text-[10px] text-white/30 hover:text-white transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          {nextUp.length === 0 ? (
            <p className="text-xs text-white/20 italic py-4">Queue is empty</p>
          ) : (
            <div className="space-y-0.5">
              {nextUp.map((track, i) => (
                <div
                  key={`${track.videoId}-${i}`}
                  className="group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => onPlayTrack(track)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-white/5 shrink-0">
                      <img
                        src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white/80 truncate group-hover:text-white">{track.title}</p>
                      <p className="text-xs text-white/35 truncate">{cleanArtistName(track.artist)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-white/25">
                      {track.duration ? formatDuration(track.duration) : ''}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveFromQueue(track.videoId); }}
                      className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 p-0.5 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
