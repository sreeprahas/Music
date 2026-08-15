'use client';

import React, { useState } from 'react';
import type { Playlist } from '@/types';
import { Pin, Play } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { PlaylistArtwork } from './PlaylistArtwork';

interface Props {
  playlists: Playlist[];
  pinnedIds: string[];
  hiddenIds: string[];
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onPlay: (id: string) => void;
}

export function PlaylistGridSkeleton() {
  return (
    <div className="h-full min-h-0 overflow-y-auto px-8 py-8 select-none">
      <Skeleton className="mb-6 h-8 w-44" />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="rounded-3xl border border-white/5 bg-white/[0.03] p-3">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <Skeleton className="mt-4 h-4 w-4/5" />
            <Skeleton className="mt-2 h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlaylistGrid({
  playlists = [],
  pinnedIds = [],
  hiddenIds = [],
  onSelect,
  onPlay,
}: Props) {
  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const safePinnedIds = Array.isArray(pinnedIds) ? pinnedIds : [];
  const safeHiddenIds = Array.isArray(hiddenIds) ? hiddenIds : [];

  const pinnedSet = new Set(safePinnedIds);
  const hiddenSet = new Set(safeHiddenIds);
  const pinnedPlaylists = safePinnedIds
    .map((id) => safePlaylists.find((p) => p && p.id === id))
    .filter((p): p is Playlist => Boolean(p));
  const unpinnedPlaylists = safePlaylists.filter((p) => p && !pinnedSet.has(p.id) && !hiddenSet.has(p.id));

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-8 space-y-8 select-none scrollbar-thin">
        {/* Pinned Playlists Section */}
        {pinnedPlaylists.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Pin className="w-4 h-4 text-[#00F2FE] fill-[#00F2FE]" />
              <h2 className="text-xl font-bold text-white tracking-tight">Pinned Playlists</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-7">
              {pinnedPlaylists.map((pl) => (
                <PlaylistCard
                  key={pl.id}
                  playlist={pl}
                  isPinned={true}
                  onSelect={() => onSelect(pl.id)}
                  onPlay={() => onPlay(pl.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main Library Grid */}
        <div>
          <h2 className="text-3xl font-bold text-white mb-6 tracking-tight">
            {pinnedPlaylists.length > 0 ? 'All Playlists' : 'From your library'}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-7">
            {unpinnedPlaylists.map((pl) => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                isPinned={false}
                onSelect={() => onSelect(pl.id)}
                onPlay={() => onPlay(pl.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaylistCard({
  playlist,
  isPinned,
  onSelect,
  onPlay,
}: {
  playlist: Playlist;
  isPinned: boolean;
  onSelect: () => void;
  onPlay: () => void;
}) {
  const [isPlayPressed, setIsPlayPressed] = useState(false);

  return (
    <div
      onClick={onSelect}
      className="group text-left cursor-pointer relative flex min-w-0 flex-col rounded-xl bg-transparent p-0"
    >
      <div className="aspect-square rounded-[10px] overflow-hidden bg-white/5 mb-4 relative shadow-lg border border-white/5 transition-all duration-300 group-hover:bg-[#00F2FE]/15 group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.32),0_0_18px_rgba(0,242,254,0.28),0_12px_36px_rgba(110,72,180,0.3)]">
        <PlaylistArtwork playlist={playlist} />

        {/* Restrained cover tint/depth overlay on hover. */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-white/5 via-transparent to-black/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* YouTube Music-style corner play button */}
        <button type="button" onClick={(event) => { event.stopPropagation(); setIsPlayPressed(true); window.setTimeout(() => setIsPlayPressed(false), 140); onPlay(); }} aria-label={`Play ${playlist.title}`} className={`absolute bottom-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-200 ${isPlayPressed ? 'scale-[0.9]' : 'scale-100'}`}>
          <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:bg-[#00F2FE] hover:shadow-[0_0_12px_rgba(0,242,254,0.6)] transition-all duration-200">
            <Play className="w-5 h-5 fill-black text-black ml-0.5" />
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1.5 min-w-0 px-1">
        <p className="text-base font-semibold text-white truncate group-hover:text-[#00F2FE] transition-colors">
          {playlist.title}
        </p>
      </div>
      {playlist.trackCount > 0 && (
        <p className="text-sm text-white/50 mt-1 px-1">Sree Prahas · {playlist.trackCount} tracks</p>
      )}
    </div>
  );
}
