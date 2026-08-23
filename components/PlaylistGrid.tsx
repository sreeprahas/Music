'use client';

import React, { useRef, useState } from 'react';
import type { Playlist } from '@/types';
import { Pin, Play } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { PlaylistArtwork } from './PlaylistArtwork';
import { PlaylistContextMenu } from './PlaylistContextMenu';

interface Props {
  playlists: Playlist[];
  pinnedIds: string[];
  hiddenIds: string[];
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onPlay: (id: string) => void;
  onShufflePlay?: (id: string) => void;
  onDownload?: (id: string) => void;
  onRemove?: (id: string) => void;
  onSyncNow?: (id: string) => void;
}

export function PlaylistGridSkeleton() {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-8 space-y-8 select-none scrollbar-thin">
        <section aria-label="Loading playlists">
          <Skeleton className="mb-2 h-3 w-16 rounded-lg" />
          <Skeleton className="mb-2 h-9 w-56 rounded-lg" />
          <Skeleton className="mb-6 h-4 w-72 rounded-lg" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,180px))] gap-x-5 gap-y-7">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="w-[180px] min-w-[180px]">
                <Skeleton className="mb-4 h-[180px] w-[180px] rounded-[10px]" />
                <Skeleton className="mx-1 h-5 w-[148px] rounded-md" />
                <Skeleton className="mx-1 mt-2 h-4 w-[124px] rounded-md" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function PlaylistGrid({
  playlists = [],
  pinnedIds = [],
  hiddenIds = [],
  onSelect,
  onTogglePin,
  onPlay,
  onShufflePlay,
  onDownload,
  onRemove,
  onSyncNow,
}: Props) {
  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const safePinnedIds = Array.isArray(pinnedIds) ? pinnedIds : [];
  const safeHiddenIds = Array.isArray(hiddenIds) ? hiddenIds : [];
  const gridRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ playlist: Playlist; isPinned: boolean; x: number; y: number } | null>(null);

  const pinnedSet = new Set(safePinnedIds);
  const hiddenSet = new Set(safeHiddenIds);
  const pinnedPlaylists = safePinnedIds
    .map((id) => safePlaylists.find((p) => p && p.id === id))
    .filter((p): p is Playlist => Boolean(p));
  const unpinnedPlaylists = safePlaylists.filter((p) => p && !pinnedSet.has(p.id) && !hiddenSet.has(p.id));

  return (
      <div ref={gridRef} className="h-full flex flex-col min-h-0 relative">
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-8 space-y-8 select-none scrollbar-thin">
          <div className="mb-2 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3" aria-label="Your Library">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-accent/60" />
              <h2 className="text-3xl font-bold tracking-tight text-text">Your Library</h2>
              <span className="h-px w-10 bg-gradient-to-l from-transparent to-accent/60" />
            </div>
            <p className="text-sm text-text-muted">Your music, gathered in one place.</p>
          </div>
          {/* Pinned Playlists Section */}
          {pinnedPlaylists.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Pin className="w-4 h-4 text-accent fill-accent" />
                <h2 className="text-3xl font-bold text-text tracking-tight">Pinned Playlists</h2>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,180px))] gap-x-5 gap-y-7">
                {pinnedPlaylists.map((pl) => (
                  <PlaylistCard
                    key={pl.id}
                    playlist={pl}
                    isPinned={true}
                    onSelect={() => onSelect(pl.id)}
                    onPlay={() => onPlay(pl.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({ playlist: pl, isPinned: true, x: event.clientX, y: event.clientY });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Main Library Grid */}
          {unpinnedPlaylists.length > 0 && (
            <div>
              <h2 className="text-3xl font-bold text-text mb-6 tracking-tight">
                {pinnedPlaylists.length > 0 ? 'Playlists' : 'From your library'}
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,180px))] gap-x-5 gap-y-7">
                {unpinnedPlaylists.map((pl) => (
                  <PlaylistCard
                    key={pl.id}
                    playlist={pl}
                    isPinned={false}
                    onSelect={() => onSelect(pl.id)}
                    onPlay={() => onPlay(pl.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({ playlist: pl, isPinned: false, x: event.clientX, y: event.clientY });
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

      {contextMenu && onShufflePlay && onDownload && onRemove && (
        <PlaylistContextMenu
          playlist={contextMenu.playlist}
          isPinned={contextMenu.isPinned}
          x={contextMenu.x}
          y={contextMenu.y}
          boundaryRef={gridRef}
          onPlay={onPlay}
          onShufflePlay={onShufflePlay}
          onDownload={onDownload}
          onTogglePin={onTogglePin}
          onRemove={onRemove}
          onSyncNow={onSyncNow}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function PlaylistCard({
  playlist,
  isPinned,
  onSelect,
  onPlay,
  onContextMenu,
}: {
  playlist: Playlist;
  isPinned: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const [isPlayPressed, setIsPlayPressed] = useState(false);

  return (
    <div
      data-playlist-context="true"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className="group text-left cursor-pointer relative flex w-[180px] min-w-[180px] flex-col rounded-xl bg-transparent p-0"
    >
      <div className="h-[180px] w-[180px] rounded-[10px] overflow-hidden bg-surface mb-4 relative shadow-lg border border-border-subtle transition-all duration-300 group-hover:bg-accent/15 group-hover:shadow-accent-card-strong">
        <PlaylistArtwork playlist={playlist} />

        {/* Restrained cover tint/depth overlay on hover. */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-white/5 via-transparent to-black/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* YouTube Music-style corner play button */}
        <button type="button" onClick={(event) => { event.stopPropagation(); setIsPlayPressed(true); window.setTimeout(() => setIsPlayPressed(false), 140); onPlay(); }} aria-label={`Play ${playlist.title}`} className={`absolute bottom-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-200 ${isPlayPressed ? 'scale-[0.9]' : 'scale-100'}`}>
          <div className="w-11 h-11 rounded-full bg-text text-background flex items-center justify-center shadow-xl hover:bg-accent hover:shadow-accent-small transition-all duration-200">
            <Play className="w-5 h-5 fill-background text-background ml-0.5" />
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1.5 min-w-0 px-1">
        <p className="text-base font-semibold text-text truncate group-hover:text-accent transition-colors">
          {playlist.title}
        </p>
      </div>
      {playlist.trackCount > 0 && (
        <p className="text-xs text-text-muted mt-1 px-1">{playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'}</p>
      )}
    </div>
  );
}
