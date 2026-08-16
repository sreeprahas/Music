'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { Playlist } from '@/types';
import { Pin, FolderLock, Music2, Play, Plus, PanelLeftClose, PanelLeftOpen, Volume2 } from 'lucide-react';
import { PlaylistArtwork } from './PlaylistArtwork';

interface SidebarProps {
  playlists: Playlist[];
  selectedId: string | null;
  pinnedIds: string[];
  hiddenIds: string[];
  playingPlaylistId?: string | null;
  isPlaybackActive?: boolean;
  isGlowDimmed?: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onOpenHiddenFolder: () => void;
  onPlaylistOrderChange?: (ids: string[]) => void;
  onPinnedOrderChange?: (ids: string[]) => void;
  onUnpinnedOrderChange?: (ids: string[]) => void;
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
  isGlowDimmed = false,
  onSelect,
  onTogglePin,
  onOpenHiddenFolder,
  onPlaylistOrderChange,
  onPinnedOrderChange,
  onUnpinnedOrderChange,
  onPlayPlaylist = onSelect,
  expanded = true,
  onToggleExpanded,
}: SidebarProps) {
  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const safePinnedIds = Array.isArray(pinnedIds) ? pinnedIds : [];
  const safeHiddenIds: string[] = [];

  const pinnedSet = new Set(safePinnedIds);
  const hiddenSet = new Set(safeHiddenIds);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    return safePlaylists.map((playlist) => playlist.id);
  });
  const [draggingPlaylistId, setDraggingPlaylistId] = useState<string | null>(null);
  const [dropTargetPlaylistId, setDropTargetPlaylistId] = useState<string | null>(null);
  const [hoveredPlaylist, setHoveredPlaylist] = useState<{ playlist: Playlist; isPinned: boolean; x: number; y: number } | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/user/settings')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.playlistOrder) && data.playlistOrder.length > 0) {
          const order = data.playlistOrder as string[];
          setOrderedIds(order);
        }
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    safePlaylists.forEach((playlist) => {
      if (!playlist.thumbnailUrl) return;
      const image = new Image();
      image.src = `/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`;
    });
  }, [safePlaylists]);

  useEffect(() => {
    if (!settingsLoaded) return;
    const ids = [...orderedIds.filter((id) => safePlaylists.some((playlist) => playlist.id === id)), ...safePlaylists.map((playlist) => playlist.id).filter((id) => !orderedIds.includes(id))];
    if (ids.join('|') !== orderedIds.join('|')) {
      setOrderedIds(ids);
      publishPlaylistOrder(ids.filter((id) => pinnedSet.has(id)), ids.filter((id) => !pinnedSet.has(id)));
    }
  }, [safePlaylists, orderedIds, onPlaylistOrderChange, settingsLoaded]);

  const publishPlaylistOrder = (pinned: string[], unpinned: string[]) => {
    onPlaylistOrderChange?.([...pinned, ...unpinned.filter((id) => !pinned.includes(id))]);
  };

  const persistPlaylistOrder = (playlistOrder: string[], pinnedPlaylists: string[]) => {
    void fetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistOrder, pinnedPlaylists }),
    }).catch(() => { });
  };

  const orderedPlaylists = orderedIds
    .map((id) => safePlaylists.find((playlist) => playlist.id === id))
    .filter((playlist): playlist is Playlist => Boolean(playlist));
  const pinnedPlaylists = orderedPlaylists.filter((playlist) => pinnedSet.has(playlist.id));
  const unpinnedPlaylists = orderedPlaylists.filter((p) => p && !pinnedSet.has(p.id) && !hiddenSet.has(p.id));
  const hiddenPlaylists: Playlist[] = [];

  const reorder = (fromId: string, toId: string, insertBefore: boolean) => {
    // Only reorder within unpinned
    if (pinnedSet.has(fromId) || pinnedSet.has(toId)) return;
    setOrderedIds((current) => {
      // Reorder only the hidden-pinned (unpinned) sequence. Reconstructing
      // the combined list afterward prevents visible pins from acting as
      // anchors and corrupting the unpinned order.
      const next = current.filter((id) => !pinnedSet.has(id));
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from < 0 || to < 0 || from === to) return current;
      // Target position: before or after the drop target item
      let targetIdx = insertBefore ? to : to + 1;
      if (from < targetIdx) targetIdx -= 1;
      if (from === targetIdx) return current;
      next.splice(from, 1);
      next.splice(targetIdx, 0, fromId);
      const pinnedOrder = current.filter((id) => pinnedSet.has(id));
      const combined = [...pinnedOrder, ...next];
      persistPlaylistOrder(combined, pinnedOrder);
      onUnpinnedOrderChange?.(next);
      publishPlaylistOrder(pinnedOrder, next);
      // Keep the canonical state as the complete sequence. Returning only
      // `next` drops pinned IDs whenever a mixed list is reordered.
      return combined;
    });
  };

  const reorderPinned = (fromId: string, toId: string, insertBefore: boolean) => {
    setOrderedIds((current) => {
      const next = current.filter((id) => pinnedSet.has(id));
      const from = next.indexOf(fromId);
      const to = next.indexOf(toId);
      if (from < 0 || to < 0 || from === to) return current;
      let targetIdx = insertBefore ? to : to + 1;
      if (from < targetIdx) targetIdx -= 1;
      if (from === targetIdx) return current;
      next.splice(from, 1);
      next.splice(targetIdx, 0, fromId);
      const unpinnedOrder = current.filter((id) => !pinnedSet.has(id));
      const combined = [...next, ...unpinnedOrder];
      onPinnedOrderChange?.(next);
      persistPlaylistOrder(combined, next);
      publishPlaylistOrder(next, unpinnedOrder);
      return combined;
    });
  };

  // Dedicated Collapsed View Component
  if (!expanded) {
    const allPlaylists = [...pinnedPlaylists, ...unpinnedPlaylists];

    return (
      <div className="relative h-full w-[72px] flex flex-col select-none overflow-hidden bg-[#161513] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {/* Collapsed Header */}
        <div className="z-10 shrink-0 flex flex-col items-center justify-start gap-2 pt-3 pb-1 bg-[#161513]">
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

        <div className="flex-1min-h-0 overflow-hidden">
          <div className="h-full overflow-hidden flex items-center justify-center">
            <nav className="h-full w-full overflow-y-auto sidebar-scrollbar flex flex-col items-center justify-start gap-3 px-3 py-4">
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
                      playlist: { id: '__management__', title: 'Playlist Management', trackCount: 0 } as Playlist,
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

      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 space-y-5 sidebar-scrollbar"
        onDragOver={(event) => {
          event.preventDefault();
          const draggingPinned = event.dataTransfer.getData('text/playlist-pinned') === '1';
          const firstItem = event.currentTarget.querySelector<HTMLElement>(`[data-playlist-item="true"][data-playlist-pinned="${draggingPinned ? '1' : '0'}"]`);
          if (!firstItem) return;
          const navRect = event.currentTarget.getBoundingClientRect();
          if (event.clientY <= navRect.top + 28) {
            // Keep the guide visible when the pointer is above the first row;
            // dropping there is treated as an explicit move-to-top action.
            setDropTargetPlaylistId(firstItem.dataset.playlistId || null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData('text/playlist-id');
          const draggedPinned = event.dataTransfer.getData('text/playlist-pinned') === '1';
          if (!id) return;
          const group = [...event.currentTarget.querySelectorAll<HTMLElement>(
            `[data-playlist-item="true"][data-playlist-pinned="${draggedPinned ? '1' : '0'}"]`
          )];
          if (group.length === 0) return;
          const y = event.clientY;
          let target = group.find((item) => y <= item.getBoundingClientRect().bottom) || group[group.length - 1];
          const rect = target.getBoundingClientRect();
          const before = y <= rect.top + rect.height / 2;
          const targetId = target.dataset.playlistId;
          if (!targetId || targetId === id) return;
          if (draggedPinned) reorderPinned(id, targetId, before);
          else reorder(id, targetId, before);
        }}
      >
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
                  onPlay={() => onPlayPlaylist(pl.id)}
                  onDropOn={(id, insertBefore) => reorderPinned(id, pl.id, insertBefore)}
                  isPlaying={pl.id === playingPlaylistId}
                  isPlaybackActive={isPlaybackActive}
                  isGlowDimmed={isGlowDimmed}
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
                onPlay={() => onPlayPlaylist(pl.id)}
                onDropOn={(id, insertBefore) => reorder(id, pl.id, insertBefore)}
                isPlaying={pl.id === playingPlaylistId}
                isPlaybackActive={isPlaybackActive}
                isGlowDimmed={isGlowDimmed}
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
          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:outline-none active:ring-0 active:bg-transparent active:border-transparent active:shadow-none [webkit-tap-highlight-color:transparent] ${selectedId === '__management__'
            ? 'bg-white/10 text-white border border-white/10'
            : 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
        >
          <div className="h-9 w-9 rounded-xl relative flex shrink-0 items-center justify-center overflow-hidden bg-white/5">
            <FolderLock className="w-4 h-4 text-[#00F2FE]" />
          </div>
          <div className="min-w-0 flex-1 max-w-[240px] overflow-hidden">
            <p className="text-sm font-semibold truncate">Playlist Management</p>
            <p className="text-xs text-white/30 truncate">Import playlists</p>
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
      className="group flex h-12 w-12 mx-auto shrink-0 items-center justify-center p-0 transition-all duration-200 bg-transparent hover:bg-white/10 border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none active:ring-0 active:bg-transparent [webkit-tap-highlight-color:transparent]"
    >
      <div className="relative h-full w-full aspect-square overflow-hidden rounded-[4px] border border-transparent bg-white/5 transition-all duration-200 group-hover:border-[#00F2FE]/35 group-hover:bg-[#00F2FE]/15 group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.32),0_0_18px_rgba(0,242,254,0.28),0_12px_36px_rgba(110,72,180,0.3)]">
        <PlaylistArtwork playlist={playlist} />
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
  onPlay,
  onDropOn,
  isPlaying,
  isPlaybackActive,
  isGlowDimmed = false,
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
  onPlay: () => void;
  onDropOn: (id: string, insertBefore: boolean) => void;
  isPlaying: boolean;
  isPlaybackActive: boolean;
  isGlowDimmed?: boolean;
  draggingPlaylistId: string | null;
  dropTargetPlaylistId: string | null;
  onDragPlaylist: (id: string | null) => void;
  onDragTarget: (id: string | null) => void;
}) {
  const [canDrag, setCanDrag] = useState(false);
  const [insertBefore, setInsertBefore] = useState(true);
  const holdTimerRef = useRef<number | null>(null);

  const startHold = useCallback(() => {
    setCanDrag(false);
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      setCanDrag(true);
    }, 100);
  }, []);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setCanDrag(false);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    };
  }, []);

  return (
    <div
      data-playlist-item="true"
      data-playlist-id={playlist.id}
      data-playlist-pinned={isPinned ? '1' : '0'}
      draggable={canDrag}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      onDragStart={(event) => {
        if (!canDrag) {
          event.preventDefault();
          return;
        }
        onDragPlaylist(playlist.id);
        event.dataTransfer.setData('text/playlist-id', playlist.id);
        event.dataTransfer.setData('text/playlist-pinned', isPinned ? '1' : '0');
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        cancelHold();
        onDragPlaylist(null);
        onDragTarget(null);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (draggingPlaylistId !== playlist.id) {
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
          setInsertBefore(event.clientY < rect.top + rect.height / 2);
          onDragTarget(playlist.id);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData('text/playlist-id');
        const draggedPinned = event.dataTransfer.getData('text/playlist-pinned') === '1';
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        // Only allow drops within the same group (pinned↔pinned, unpinned↔unpinned)
        if (id && draggedPinned === isPinned) onDropOn(id, before);
        cancelHold();
        onDragPlaylist(null);
        onDragTarget(null);
      }}
      onClick={onSelect}
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left cursor-pointer transition-all duration-100 ease-in-out outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none active:ring-0 active:bg-transparent active:border-transparent active:shadow-none [webkit-tap-highlight-color:transparent] ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer active:cursor-pointer'
        } ${draggingPlaylistId === playlist.id ? 'opacity-40 cursor-grabbing' : ''
        } ${dropTargetPlaylistId === playlist.id && insertBefore
          ? 'before:absolute before:-top-px before:left-2 before:right-2 before:z-10 before:h-0.5 before:rounded-full before:bg-[#00F2FE] before:shadow-[0_0_8px_rgba(0,242,254,0.9)]'
          : dropTargetPlaylistId === playlist.id && !insertBefore
            ? 'after:absolute after:-bottom-px after:left-2 after:right-2 after:z-10 after:h-0.5 after:rounded-full after:bg-[#00F2FE] after:shadow-[0_0_8px_rgba(0,242,254,0.9)]'
            : ''
        } ${isPlaying && !isGlowDimmed
          ? 'border border-[#00F2FE]/25 bg-[#00F2FE]/10 text-[#00F2FE] shadow-[0_0_12px_rgba(0,242,254,0.15)] hover:bg-[#00F2FE]/15'
          : active
            ? 'border border-transparent bg-white/[0.05] text-white hover:bg-white/[0.12]'
            : 'border border-transparent text-white/75 hover:border-transparent hover:bg-white/[0.12] hover:text-white'
        }`}
    >
      <div className="h-9 w-9 aspect-square rounded-[4px] relative shrink-0 overflow-hidden bg-white/5 shadow-sm group/art">
        <PlaylistArtwork playlist={playlist} />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(event) => { event.stopPropagation(); onPlay(); }}
          className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/70 outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]"
          aria-label={`Play ${playlist.title}`}
        >
          <Play className="h-5 w-5 fill-current" />
        </button>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className={`text-sm font-medium leading-tight ${playlist.title.length <= 20 ? 'whitespace-nowrap' : 'truncate'}`}>
          {playlist.title}
        </p>
        {playlist.trackCount > 0 && (
          <p className="text-xs text-white/30 whitespace-nowrap">{playlist.trackCount} tracks</p>
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
        className={`p-1.5 rounded-xl text-white hover:text-[#00F2FE] transition-all duration-200 outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent] ${isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        title={isPinned ? 'Unpin playlist' : 'Pin playlist'}
      >
        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}
