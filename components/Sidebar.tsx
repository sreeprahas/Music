'use client';

import React, { useEffect, useState } from 'react';
import type { Playlist } from '@/types';
import { Pin, FolderLock, Music2, Play, Plus, PanelLeftClose, PanelLeftOpen, Volume2 } from 'lucide-react';

interface SidebarProps {
  playlists: Playlist[];
  selectedId: string | null;
  pinnedIds: string[];
  hiddenIds: string[];
  playingPlaylistId?: string | null;
  isPlaybackActive?: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onOpenHiddenFolder: () => void;
  onPlayPlaylist?: (id: string) => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

export function Sidebar({
  playlists = [],
  selectedId,
  pinnedIds = [],
  hiddenIds = [],
  playingPlaylistId = null,
  isPlaybackActive = false,
  onSelect,
  onTogglePin,
  onToggleHidden,
  onOpenHiddenFolder,
  onPlayPlaylist = onSelect,
  expanded = true,
  onToggleExpanded,
}: SidebarProps) {
  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const safePinnedIds = Array.isArray(pinnedIds) ? pinnedIds : [];
  const safeHiddenIds = Array.isArray(hiddenIds) ? hiddenIds : [];

  const pinnedSet = new Set(safePinnedIds);
  const hiddenSet = new Set(safeHiddenIds);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('yt_playlist_order');
      return saved ? JSON.parse(saved) : safePlaylists.map((playlist) => playlist.id);
    } catch {
      return safePlaylists.map((playlist) => playlist.id);
    }
  });
  const [draggingPlaylistId, setDraggingPlaylistId] = useState<string | null>(null);
  const [dropTargetPlaylistId, setDropTargetPlaylistId] = useState<string | null>(null);
  const [hoveredPlaylist, setHoveredPlaylist] = useState<{ playlist: Playlist; isPinned: boolean; x: number; y: number } | null>(null);

  useEffect(() => {
    fetch('/api/user/settings')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.playlistOrder) && data.playlistOrder.length > 0) {
          setOrderedIds(data.playlistOrder);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    safePlaylists.forEach((playlist) => {
      if (!playlist.thumbnailUrl) return;
      const image = new Image();
      image.src = `/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`;
    });
  }, [safePlaylists]);

  useEffect(() => {
    const ids = [...orderedIds.filter((id) => safePlaylists.some((playlist) => playlist.id === id)), ...safePlaylists.map((playlist) => playlist.id).filter((id) => !orderedIds.includes(id))];
    if (ids.join('|') !== orderedIds.join('|')) setOrderedIds(ids);
    fetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistOrder: ids }),
    }).catch(() => { });
  }, [safePlaylists, orderedIds]);

  const [pinnedOrderedIds, setPinnedOrderedIds] = useState<string[]>(() => safePinnedIds);

  // Sync pinnedOrderedIds when pinnedIds prop changes (new pin/unpin)
  useEffect(() => {
    setPinnedOrderedIds((prev) => {
      const next = [
        ...prev.filter((id) => safePinnedIds.includes(id)),
        ...safePinnedIds.filter((id) => !prev.includes(id)),
      ];
      if (next.join('|') === prev.join('|')) return prev;
      return next;
    });
  }, [safePinnedIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedPlaylists = orderedIds
    .map((id) => safePlaylists.find((playlist) => playlist.id === id))
    .filter((playlist): playlist is Playlist => Boolean(playlist));
  const pinnedPlaylists = pinnedOrderedIds
    .map((id) => safePlaylists.find((p) => p && p.id === id))
    .filter((p): p is Playlist => Boolean(p));
  const unpinnedPlaylists = orderedPlaylists.filter((p) => p && !pinnedSet.has(p.id) && !hiddenSet.has(p.id));
  const hiddenPlaylists = orderedPlaylists.filter((p) => p && hiddenSet.has(p.id));

  const reorder = (fromId: string, toId: string) => {
    // Only reorder within unpinned
    if (pinnedSet.has(fromId) || pinnedSet.has(toId)) return;
    setOrderedIds((current) => {
      const next = [...current];
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from < 0 || to < 0 || from === to) return current;
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      return next;
    });
  };

  const reorderPinned = (fromId: string, toId: string) => {
    setPinnedOrderedIds((current) => {
      const next = [...current];
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from < 0 || to < 0 || from === to) return current;
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      return next;
    });
  };

  // Dedicated Collapsed View Component
  if (!expanded) {
    const allPlaylists = [...pinnedPlaylists, ...unpinnedPlaylists];

    return (
      <div className="relative h-full w-[72px] flex flex-col select-none overflow-hidden bg-[#161513] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {/* Collapsed Header */}
        <div className="z-10 shrink-0 flex flex-col items-center justify-start gap-2 pt-1 pb-1 bg-[#161513]">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleExpanded}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-[#00F2FE] outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]"
            aria-label="Expand playlist sidebar"
            title="Expand playlist sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#242424] text-white/60 transition-colors hover:bg-[#303030] hover:text-[#00F2FE] outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]"
            aria-label="Add playlist"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-hidden">
            <nav className="h-full w-full overflow-y-auto sidebar-scrollbar">
              <div className="w-full min-h-full flex flex-col items-center justify-start gap-3 px-2 py-4">
                {allPlaylists.map((pl) => (
                  <CollapsedNavItem
                    key={pl.id}
                    playlist={pl}
                    isPinned={pinnedSet.has(pl.id)}
                    onSelect={() => onSelect(pl.id)}
                    onHover={(playlist, isPinned, rect) =>
                      setHoveredPlaylist({ playlist, isPinned, x: rect.right + 10, y: rect.top + rect.height / 2 })
                    }
                    onLeave={() => setHoveredPlaylist(null)}
                  />
                ))}

                {/* Hidden Folder Button */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onOpenHiddenFolder}
                  onMouseEnter={(e) =>
                    setHoveredPlaylist({
                      playlist: { id: '__hidden__', title: 'Hidden Playlists', trackCount: hiddenPlaylists.length } as Playlist,
                      isPinned: false,
                      x: e.currentTarget.getBoundingClientRect().right + 10,
                      y: e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2,
                    })
                  }
                  onMouseLeave={() => setHoveredPlaylist(null)}
                  className="flex h-12 w-12 mx-auto shrink-0 items-center justify-center rounded-xl p-1 transition-all duration-200 hover:bg-white/10 border-0 outline-none ring-0 focus:outline-none focus-visible:outline-none active:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]"
                >
                  <div className="flex h-full w-full items-center justify-center rounded-lg bg-white/5">
                    <FolderLock className="h-4 w-4 text-[#00F2FE]" />
                  </div>
                </button>
              </div>
            </nav>
          </div>
        </div>

        {/* Hover Tooltip */}
        {hoveredPlaylist && (
          <div
            className="pointer-events-none fixed z-[120] flex flex-col justify-center -translate-y-1/2 rounded-md bg-[#282828] px-3.5 py-2 shadow-xl min-w-max"
            style={{ left: hoveredPlaylist.x, top: hoveredPlaylist.y }}
          >
            <span className="truncate text-[15px] font-semibold tracking-wide text-[#00F2FE] mb-0.5">
              {hoveredPlaylist.playlist.title}
            </span>
            <div className="flex items-center text-[13px] font-medium text-[#a7a7a7]">
              {hoveredPlaylist.isPinned && (
                <Pin className="mr-1 h-3.5 w-3.5 fill-[#00F2FE] text-[#00F2FE]" />
              )}
              <span>
                Playlist {hoveredPlaylist.playlist.trackCount > 0 ? `• ${hoveredPlaylist.playlist.trackCount} tracks` : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded Sidebar
  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden bg-[#161513] py-3 transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]">
      <div className="relative shrink-0 h-12">
        <div className="absolute inset-0 flex items-center gap-3 px-3 opacity-100 translate-y-0 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <button 
            type="button" 
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleExpanded} 
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-[#00F2FE] outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]" 
            aria-label="Collapse playlist sidebar" 
            title="Collapse playlist sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <span className="truncate text-base font-bold tracking-tight text-white">Your Library</span>
          <div className="flex-1" />
          <button 
            type="button" 
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#242424] text-white/60 transition-colors hover:bg-[#303030] hover:text-[#00F2FE] outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]" 
            aria-label="Add playlist"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 space-y-5 sidebar-scrollbar">
        {pinnedPlaylists.length > 0 && (
          <div>
            <div className="flex max-h-8 items-center justify-between overflow-hidden text-white/30 text-[11px] font-bold uppercase tracking-wider px-3 pb-2 opacity-100 translate-x-0">
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
                  onPlay={() => onPlayPlaylist(pl.id)}
                  onDropOn={(id) => reorderPinned(id, pl.id)}
                  isPlaying={pl.id === playingPlaylistId}
                  isPlaybackActive={isPlaybackActive}
                  draggingPlaylistId={draggingPlaylistId}
                  dropTargetPlaylistId={dropTargetPlaylistId}
                  onDragPlaylist={setDraggingPlaylistId}
                  onDragTarget={setDropTargetPlaylistId}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="max-h-8 overflow-hidden text-white/30 text-[11px] font-bold uppercase tracking-wider px-3 pb-2 opacity-100 translate-x-0">
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
                onPlay={() => onPlayPlaylist(pl.id)}
                onDropOn={(id) => reorder(id, pl.id)}
                isPlaying={pl.id === playingPlaylistId}
                isPlaybackActive={isPlaybackActive}
                draggingPlaylistId={draggingPlaylistId}
                dropTargetPlaylistId={dropTargetPlaylistId}
                onDragPlaylist={setDraggingPlaylistId}
                onDragTarget={setDropTargetPlaylistId}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenHiddenFolder}
          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:outline-none active:ring-0 active:bg-transparent active:border-transparent active:shadow-none [webkit-tap-highlight-color:transparent] ${
            selectedId === '__hidden__'
              ? 'bg-white/10 text-white border border-white/10'
              : 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
          }`}
        >
          <div className="h-9 w-9 rounded-xl relative flex shrink-0 items-center justify-center overflow-hidden bg-white/5">
            <FolderLock className="w-4 h-4 text-[#00F2FE]" />
          </div>
          <div className="min-w-0 flex-1 max-w-[240px] overflow-hidden">
            <p className="text-sm font-semibold truncate">Hidden Playlists</p>
            <p className="text-xs text-white/30 truncate">{hiddenPlaylists.length} hidden</p>
          </div>
        </button>
      </nav>
    </div>
  );
}

// Collapsed Item Helper Component
function CollapsedNavItem({
  playlist,
  isPinned,
  onSelect,
  onHover,
  onLeave,
}: {
  playlist: Playlist;
  isPinned: boolean;
  onSelect: () => void;
  onHover: (playlist: Playlist, isPinned: boolean, rect: DOMRect) => void;
  onLeave: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      onMouseEnter={(e) => onHover(playlist, isPinned, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={onLeave}
      className="group flex h-12 w-12 mx-auto shrink-0 items-center justify-center rounded-xl p-1 transition-all duration-200 bg-transparent hover:bg-white/10 border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none active:ring-0 active:bg-transparent [webkit-tap-highlight-color:transparent]"
    >
      <div className="relative h-full w-full overflow-hidden rounded-lg bg-white/5">
        {playlist.thumbnailUrl ? (
          <img
            src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`}
            alt={playlist.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#00F2FE]/30 to-[#1A1A1A]/30">
            <Music2 className="h-4 w-4 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

// Expanded Item Helper Component
function PlaylistNavItem({
  playlist,
  active,
  isPinned,
  onSelect,
  onTogglePin,
  onToggleHidden,
  onPlay,
  onDropOn,
  isPlaying,
  isPlaybackActive,
  draggingPlaylistId,
  dropTargetPlaylistId,
  onDragPlaylist,
  onDragTarget,
}: {
  playlist: Playlist;
  active: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onToggleHidden: () => void;
  onPlay: () => void;
  onDropOn: (id: string) => void;
  isPlaying: boolean;
  isPlaybackActive: boolean;
  draggingPlaylistId: string | null;
  dropTargetPlaylistId: string | null;
  onDragPlaylist: (id: string | null) => void;
  onDragTarget: (id: string | null) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        onDragPlaylist(playlist.id);
        event.dataTransfer.setData('text/playlist-id', playlist.id);
        event.dataTransfer.setData('text/playlist-pinned', isPinned ? '1' : '0');
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => { onDragPlaylist(null); onDragTarget(null); }}
      onDragOver={(event) => {
        event.preventDefault();
        if (draggingPlaylistId !== playlist.id) onDragTarget(playlist.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData('text/playlist-id');
        const draggedPinned = event.dataTransfer.getData('text/playlist-pinned') === '1';
        // Only allow drops within the same group (pinned↔pinned, unpinned↔unpinned)
        if (id && draggedPinned === isPinned) onDropOn(id);
        onDragPlaylist(null);
        onDragTarget(null);
      }}
      onClick={onSelect}
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left cursor-pointer active:cursor-grabbing transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none active:ring-0 active:bg-transparent active:border-transparent active:shadow-none [webkit-tap-highlight-color:transparent] ${
        draggingPlaylistId === playlist.id ? 'opacity-40 cursor-grabbing' : ''
      } ${
        dropTargetPlaylistId === playlist.id
          ? 'before:absolute before:-top-px before:left-2 before:right-2 before:z-10 before:h-0.5 before:rounded-full before:bg-[#00F2FE] before:shadow-[0_0_8px_rgba(0,242,254,0.9)]'
          : ''
      } ${
        isPlaying
          ? 'border border-[#00F2FE]/25 bg-[#00F2FE]/10 text-[#00F2FE] hover:bg-[#00F2FE]/15'
          : active
            ? 'border border-white/5 bg-white/[0.05] text-white hover:bg-white/[0.12]'
            : 'border border-transparent text-white/75 hover:bg-white/[0.12] hover:text-white'
      }`}
    >
      <div className="h-9 w-9 rounded-xl relative shrink-0 overflow-hidden bg-white/5 shadow-sm group/art">
        {playlist.thumbnailUrl ? (
          <img src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`} alt={playlist.title} className="h-full w-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00F2FE]/30 to-[#1A1A1A]/30">
            <Music2 className="w-4 h-4 text-white" />
          </div>
        )}
        <button 
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(event) => { event.stopPropagation(); onPlay(); }} 
          className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]" 
          aria-label={`Play ${playlist.title}`}
        >
          <Play className="h-5 w-5 fill-current" />
        </button>
      </div>

      <div className="min-w-0 flex-1 max-w-[240px] overflow-hidden">
        <p className="text-sm font-medium truncate">{playlist.title}</p>
        {playlist.trackCount > 0 && (
          <p className="text-xs text-white/30 truncate">{playlist.trackCount} tracks</p>
        )}
      </div>

      {isPlaying && isPlaybackActive && <Volume2 className="h-4 w-4 shrink-0 text-[#00F2FE]" aria-label="Playing" />}

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={`p-1.5 rounded-xl text-white hover:text-[#00F2FE] transition-all duration-200 outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent] ${
          isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        title={isPinned ? 'Unpin playlist' : 'Pin playlist'}
      >
        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}