'use client';

import React from 'react';
import type { Playlist } from '@/types';
import { Pin, FolderLock, Music2 } from 'lucide-react';

interface SidebarProps {
  playlists: Playlist[];
  selectedId: string | null;
  pinnedIds: string[];
  hiddenIds: string[];
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onOpenHiddenFolder: () => void;
}

export function Sidebar({
  playlists = [],
  selectedId,
  pinnedIds = [],
  hiddenIds = [],
  onSelect,
  onTogglePin,
  onToggleHidden,
  onOpenHiddenFolder,
}: SidebarProps) {
  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const safePinnedIds = Array.isArray(pinnedIds) ? pinnedIds : [];
  const safeHiddenIds = Array.isArray(hiddenIds) ? hiddenIds : [];

  const pinnedSet = new Set(safePinnedIds);
  const hiddenSet = new Set(safeHiddenIds);
  const pinnedPlaylists = safePinnedIds
    .map((id) => safePlaylists.find((p) => p && p.id === id))
    .filter((p): p is Playlist => Boolean(p));
  const unpinnedPlaylists = safePlaylists.filter((p) => p && !pinnedSet.has(p.id) && !hiddenSet.has(p.id));
  const hiddenPlaylists = safePlaylists.filter((p) => p && hiddenSet.has(p.id));

  return (
    <div className="w-full h-full flex flex-col bg-[#111111] select-none overflow-hidden py-3">
      {/* Navigation section */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-5 scrollbar-thin">
        {/* Pinned Playlists Section */}
        {pinnedPlaylists.length > 0 && (
          <div>
            <div className="px-3 pb-2 flex items-center justify-between text-white/30 text-[11px] font-bold uppercase tracking-wider">
              <span>Pinned</span>
            </div>
            <div className="space-y-1">
              {pinnedPlaylists.map((pl) => (
                <PlaylistNavItem
                  key={pl.id}
                  playlist={pl}
                  active={pl.id === selectedId}
                  isPinned={true}
                  onSelect={() => onSelect(pl.id)}
                  onTogglePin={() => onTogglePin(pl.id)}
                  onToggleHidden={() => onToggleHidden(pl.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* All Playlists Section */}
        <div>
          <div className="px-3 pb-2 text-white/30 text-[11px] font-bold uppercase tracking-wider">
            Library
          </div>
          <div className="space-y-1">
            {unpinnedPlaylists.map((pl) => (
              <PlaylistNavItem
                key={pl.id}
                playlist={pl}
                active={pl.id === selectedId}
                isPinned={false}
                onSelect={() => onSelect(pl.id)}
                onTogglePin={() => onTogglePin(pl.id)}
                onToggleHidden={() => onToggleHidden(pl.id)}
              />
            ))}
          </div>
        </div>

        {/* Hidden Playlists */}
        <button
          onClick={onOpenHiddenFolder}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all duration-150 group cursor-pointer ${
            selectedId === '__hidden__'
              ? 'bg-white/10 text-white border border-white/10'
              : 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
          }`}
        >
          <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/5 shrink-0 relative flex items-center justify-center">
            <FolderLock className="w-4 h-4 text-[#00F2FE]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Hidden Playlists</p>
            <p className="text-xs text-white/30 truncate">{hiddenPlaylists.length} hidden</p>
          </div>
        </button>
      </nav>
    </div>
  );
}

function PlaylistNavItem({
  playlist,
  active,
  isPinned,
  onSelect,
  onTogglePin,
  onToggleHidden,
}: {
  playlist: Playlist;
  active: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onToggleHidden: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-left transition-all duration-150 group cursor-pointer ${
        active
          ? 'bg-white/10 text-white font-semibold border border-white/10'
              : 'text-white hover:bg-[#1A1A1A] hover:text-[#00F2FE] border border-transparent'
      }`}
    >
      {/* Cover art (Squircle) */}
      <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/5 shrink-0 relative shadow-sm">
        {playlist.thumbnailUrl ? (
          <img
            src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`}
            alt={playlist.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00F2FE]/30 to-[#1A1A1A]/30">
            <Music2 className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{playlist.title}</p>
        {playlist.trackCount > 0 && (
          <p className="text-xs text-white/30 truncate">{playlist.trackCount} tracks</p>
        )}
      </div>

      {/* Pin action button on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={`p-1.5 rounded-xl text-white hover:text-[#00F2FE] transition-opacity ${
          isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        title={isPinned ? 'Unpin playlist' : 'Pin playlist'}
      >
        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}
