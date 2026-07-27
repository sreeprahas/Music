'use client';

import React from 'react';
import type { Playlist } from '@/types';
import { Pin, Play, Music } from 'lucide-react';

interface Props {
  playlists: Playlist[];
  pinnedIds: string[];
  hiddenIds: string[];
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
}

export function PlaylistGrid({
  playlists = [],
  pinnedIds = [],
  hiddenIds = [],
  onSelect,
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {pinnedPlaylists.map((pl) => (
                <PlaylistCard
                  key={pl.id}
                  playlist={pl}
                  isPinned={true}
                  onSelect={() => onSelect(pl.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main Library Grid */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">
            {pinnedPlaylists.length > 0 ? 'All Playlists' : 'Your Library'}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {unpinnedPlaylists.map((pl) => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                isPinned={false}
                onSelect={() => onSelect(pl.id)}
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
}: {
  playlist: Playlist;
  isPinned: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="group text-left cursor-pointer relative flex flex-col p-3 rounded-3xl bg-white/3 hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all duration-200"
    >
      <div className="aspect-square rounded-2xl overflow-hidden bg-white/5 mb-3 relative shadow-lg border border-white/5">
        {playlist.thumbnailUrl ? (
          <img
            src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`}
            alt={playlist.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00F2FE]/20 to-[#1a1a2e]">
            <Music className="w-8 h-8 text-white/20" />
          </div>
        )}

        {/* Play overlay (Squircle) */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-2xl bg-[#00F2FE] flex items-center justify-center shadow-xl transform group-hover:scale-105 transition-transform">
            <Play className="w-5 h-5 fill-white text-white" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 min-w-0 px-1">
        <p className="text-sm font-bold text-white truncate group-hover:text-[#00F2FE] transition-colors">
          {playlist.title}
        </p>
      </div>
      {playlist.trackCount > 0 && (
        <p className="text-xs text-white/40 mt-0.5 px-1">{playlist.trackCount} tracks</p>
      )}
    </div>
  );
}
