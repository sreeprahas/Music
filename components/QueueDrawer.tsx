import React, { useState, useRef } from 'react';
import type { Playlist, Track } from '@/types';
import { formatDuration, cleanArtistName } from '@/lib/ytmusicApi';
import { SongContextMenu } from './SongContextMenu';
import { X, Trash2, GripVertical } from 'lucide-react';

interface Props {
  currentTrack: Track | null;
  queue: Track[];
  playlists: Playlist[];
  onClose: () => void;
  onPlayTrack: (track: Track) => void;
  onRemoveFromQueue: (videoId: string) => void;
  onClearQueue: () => void;
  onReorderQueue: (fromVideoId: string, toVideoId: string, insertBefore: boolean) => void;
  onPlayNext: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (track: Track, playlistId: string) => void;
  onSetSleepTimer: (minutes: number) => void;
  onOpenSleepTimer: () => void;
  isHardwareOffline?: boolean;
}

export function QueueDrawer({
  currentTrack,
  queue,
  playlists,
  onClose,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
  onReorderQueue,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onSetSleepTimer,
  onOpenSleepTimer,
  isHardwareOffline = false,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [insertBefore, setInsertBefore] = useState<boolean>(true);
  const justDroppedRef = useRef<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{ track: Track; x: number; y: number } | null>(null);
  const visibleQueue = queue.filter((track) => track.videoId !== currentTrack?.videoId);

  return (
    <div className="h-full w-full bg-[#0c131a]/95 backdrop-blur-xl flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <h3 className="text-sm font-bold text-white tracking-tight">Play Queue</h3>
        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1.5 rounded-2xl hover:bg-white/5">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0">
        {currentTrack && (
          <div>
            <h4 className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">Now Playing</h4>
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/4 border border-white/5">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 shrink-0">
                <img src={`/api/thumbnail?videoId=${currentTrack.videoId}&url=${encodeURIComponent(currentTrack.thumbnailUrl)}`} alt={currentTrack.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#00F2FE] text-sm font-semibold truncate">{currentTrack.title}</p>
                <p className="text-xs text-white/40 truncate">{cleanArtistName(currentTrack.artist)}</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Next Up ({visibleQueue.length})</h4>
            {queue.length > 0 && <button onClick={onClearQueue} className="text-[10px] text-white/30 hover:text-white transition-colors flex items-center gap-1"><Trash2 className="w-3 h-3" />Clear</button>}
          </div>
          {visibleQueue.length === 0 ? (
            <p className="text-xs text-white/20 italic py-4">Queue is empty</p>
          ) : (
            <div className="space-y-0.5">
              {visibleQueue.map((track) => (
                <div
                  key={track.videoId}
                  draggable
                  data-song-context="true"
                  onDragStart={() => {
                    justDroppedRef.current = false;
                    setDraggingId(track.videoId);
                  }}
                  onDragEnd={() => { setDraggingId(null); setDropTargetId(null); }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggingId !== track.videoId) {
                      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                      setInsertBefore(event.clientY < rect.top + rect.height / 2);
                      setDropTargetId(track.videoId);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingId) {
                      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                      const before = event.clientY < rect.top + rect.height / 2;
                      justDroppedRef.current = true;
                      onReorderQueue(draggingId, track.videoId, before);
                    }
                    setDraggingId(null);
                    setDropTargetId(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenu({ track, x: event.clientX, y: event.clientY });
                  }}
                  className={`group relative flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-white/5 cursor-grab ${draggingId === track.videoId ? 'opacity-40' : ''} ${dropTargetId === track.videoId && insertBefore ? 'before:absolute before:-top-px before:left-2 before:right-2 before:z-10 before:h-0.5 before:rounded-full before:bg-[#00F2FE] before:shadow-[0_0_8px_rgba(0,242,254,0.9)]' : dropTargetId === track.videoId && !insertBefore ? 'after:absolute after:-bottom-px after:left-2 after:right-2 after:z-10 after:h-0.5 after:rounded-full after:bg-[#00F2FE] after:shadow-[0_0_8px_rgba(0,242,254,0.9)]' : ''}`}
                  onClick={() => {
                    if (justDroppedRef.current) {
                      justDroppedRef.current = false;
                      return;
                    }
                    onPlayTrack(track);
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <GripVertical className="h-4 w-4 shrink-0 text-white/20 group-hover:text-white/50" />
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-white/5 shrink-0">
                      <img src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`} alt={track.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white/80 truncate group-hover:text-white">{track.title}</p>
                      <p className="text-xs text-white/35 truncate">{cleanArtistName(track.artist)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-white/25">{track.duration ? formatDuration(track.duration) : ''}</span>
                    <button onClick={(event) => { event.stopPropagation(); onRemoveFromQueue(track.videoId); }} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 p-0.5 transition-all" aria-label="Remove from queue"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <SongContextMenu
          track={contextMenu.track}
          playlists={playlists}
          x={contextMenu.x}
          y={contextMenu.y}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onAddToPlaylist={onAddToPlaylist}
          onSetSleepTimer={onSetSleepTimer}
          onOpenSleepTimer={onOpenSleepTimer}
          isHardwareOffline={isHardwareOffline}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
