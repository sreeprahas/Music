'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { Playlist, Track } from '@/types';
import { Pin, Play, Plus, PanelLeftClose, PanelLeftOpen, Volume2, HardDriveDownload } from 'lucide-react';
import { PlaylistArtwork } from './PlaylistArtwork';
import { PlaylistContextMenu } from './PlaylistContextMenu';

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
  onAddPlaylist?: () => void;
  onPlaylistOrderChange?: (ids: string[]) => void;
  onPinnedOrderChange?: (ids: string[]) => void;
  onUnpinnedOrderChange?: (ids: string[]) => void;
  onPlayPlaylist?: (id: string) => void;
  onShufflePlayPlaylist?: (id: string) => void;
  onDownloadPlaylist?: (id: string) => void;
  onRemovePlaylist?: (id: string) => void;
  onSyncNow?: (id: string) => void;
  onSelectCachedSongs?: () => void;
  cachedSongsSelected?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Optional map of playlistId → first-N tracks used to build the dynamic 2×2 cover. */
  tracksByPlaylist?: Record<string, Track[]>;
}

/** Section label for a playlist based on its source platform. */
function sourceSection(playlist: Playlist): 'youtube' | 'spotify' | 'local' {
  if (playlist.source === 'youtube') return 'youtube';
  if (playlist.source === 'spotify') return 'spotify';
  return 'local';
}

const SECTION_LABELS: Record<'youtube' | 'spotify' | 'local', string> = {
  youtube: 'YouTube Playlists',
  spotify: 'Spotify Playlists',
  local: 'Playlists',
};

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
  onAddPlaylist,
  onPlaylistOrderChange,
  onPinnedOrderChange,
  onUnpinnedOrderChange,
  onPlayPlaylist = onSelect,
  onShufflePlayPlaylist,
  onDownloadPlaylist,
  onRemovePlaylist,
  onSyncNow,
  onSelectCachedSongs,
  cachedSongsSelected = false,
  expanded = true,
  onToggleExpanded,
  tracksByPlaylist,
}: SidebarProps) {
  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const safePinnedIds = Array.isArray(pinnedIds) ? pinnedIds : [];
  const safeHiddenIds: string[] = [];
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ playlist: Playlist; isPinned: boolean; x: number; y: number } | null>(null);

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

  // Unpinned playlists are grouped into separate source sections. They never
  // merge with each other — only pinned playlists mix sources.
  const sourceSections: Array<{ key: 'youtube' | 'spotify' | 'local'; playlists: Playlist[] }> = (['youtube', 'spotify', 'local'] as const)
    .map((key) => ({ key, playlists: unpinnedPlaylists.filter((p) => sourceSection(p) === key) }))
    .filter((section) => section.playlists.length > 0);

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

  // Shared row renderer so collapsed and expanded states always render the
  // exact same entry component (identical dimensions, one implementation).
  const renderItem = (pl: Playlist, isPinned: boolean) => (
    <PlaylistNavItem
      key={pl.id}
      playlist={pl}
      active={pl.id === selectedId}
      isPinned={isPinned}
      expanded={expanded}
      tracks={tracksByPlaylist?.[pl.id]}
      onSelect={() => onSelect(pl.id)}
      onTogglePin={() => onTogglePin(pl.id)}
      onPlay={() => onPlayPlaylist(pl.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ playlist: pl, isPinned, x: event.clientX, y: event.clientY });
      }}
      onDropOn={(id, insertBefore) => (isPinned ? reorderPinned : reorder)(id, pl.id, insertBefore)}
      onHover={(playlist, pinned, rect) =>
        setHoveredPlaylist({ playlist, isPinned: pinned, x: rect.right + 10, y: rect.top + rect.height / 2 })
      }
      onLeave={() => setHoveredPlaylist(null)}
      isPlaying={pl.id === playingPlaylistId}
      isPlaybackActive={isPlaybackActive}
      isGlowDimmed={isGlowDimmed}
      draggingPlaylistId={draggingPlaylistId}
      dropTargetPlaylistId={dropTargetPlaylistId}
      onDragPlaylist={setDraggingPlaylistId}
      onDragTarget={setDropTargetPlaylistId}
    />
  );

  // Unified sidebar — collapsed and expanded render the SAME tree so the whole
  // sidebar expands as one unit. The parent <aside> owns the single width
  // transition; child elements never animate layout independently (no delayed
  // text/opacity reveals). Artwork and row dimensions are identical in both
  // states, so expanding only adds horizontal room for text.
  return (
    <div ref={sidebarRef} className="relative h-full w-full flex flex-col select-none overflow-hidden bg-sidebar">
      {/* Header — one row when expanded, stacked icons when collapsed. The
          swap is instant (no transitions) so it never looks two-stage. */}
      <div
        className={`z-10 shrink-0 flex bg-sidebar ${
          expanded
            ? 'flex-row items-center gap-3 px-3 h-12 pt-3 pb-1'
            : 'flex-col items-center justify-start gap-1.5 px-3 pt-3 pb-2'
        }`}
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleExpanded}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-accent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]"
          aria-label={expanded ? 'Collapse playlist sidebar' : 'Expand playlist sidebar'}
          title={expanded ? 'Collapse playlist sidebar' : 'Expand playlist sidebar'}
        >
          {expanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <span
          className={`min-w-0 truncate text-base font-bold tracking-tight text-text ${
            expanded ? 'flex-1 block' : 'hidden'
          }`}
        >
          Your Library
        </span>
        {expanded && <div className="flex-1" />}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAddPlaylist}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary transition-colors hover:bg-surface-hover hover:text-accent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]"
          aria-label="Add playlist"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <nav
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-3 sidebar-scrollbar ${
          expanded ? 'space-y-5 pt-1' : 'space-y-3 pt-2'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          const draggingPinned = event.dataTransfer.getData('text/playlist-pinned') === '1';
          const firstItem = event.currentTarget.querySelector<HTMLElement>(`[data-playlist-item="true"][data-playlist-pinned="${draggingPinned ? '1' : '0'}"]`);
          if (!firstItem) return;
          const navRect = event.currentTarget.getBoundingClientRect();
          if (event.clientY <= navRect.top + 28) {
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
            {expanded && (
              <div className="flex max-h-8 items-center justify-between overflow-hidden text-text-disabled text-[11px] font-bold uppercase tracking-wider px-3 pb-2">
                <span>Pinned</span>
              </div>
            )}
            <div className="space-y-1">
              {pinnedPlaylists.map((pl) => renderItem(pl, true))}
            </div>
          </div>
        )}

        {expanded && sourceSections.map((section) => (
          <div key={section.key}>
            <div className="max-h-8 overflow-hidden text-text-disabled text-[11px] font-bold uppercase tracking-wider px-3 pb-2">
              {SECTION_LABELS[section.key]}
            </div>
            <div className="space-y-1">
              {section.playlists.map((pl) => renderItem(pl, false))}
            </div>
          </div>
        ))}

        {/* Collapsed rail keeps one flat list of the unpinned playlists. */}
        {!expanded && (
          <div className="space-y-1">
            {unpinnedPlaylists.map((pl) => renderItem(pl, false))}
          </div>
        )}

        {/* Cached Songs — always the last entry in the sidebar. */}
        {onSelectCachedSongs && (
          <button
            type="button"
            data-playlist-context="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSelectCachedSongs}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseEnter={(event) => {
              if (expanded) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setHoveredPlaylist({
                playlist: { id: '__cached__', title: 'Cached Songs', trackCount: 0 } as Playlist,
                isPinned: false,
                x: rect.right + 10,
                y: rect.top + rect.height / 2,
              });
            }}
            onMouseLeave={() => setHoveredPlaylist(null)}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 h-12 text-left outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none active:ring-0 active:bg-transparent [webkit-tap-highlight-color:transparent] ${cachedSongsSelected
              ? 'border border-transparent bg-surface text-text hover:bg-surface-active'
              : 'border border-transparent text-text-secondary hover:border-transparent hover:bg-surface-active hover:text-text'
              }`}
          >
            <div className="h-9 w-9 rounded-[4px] relative shrink-0 flex items-center justify-center overflow-hidden bg-surface shadow-sm">
              <HardDriveDownload className="h-4 w-4 text-accent" />
            </div>
            <div className={`min-w-0 flex-1 overflow-hidden ${expanded ? 'block' : 'hidden'}`}>
              <p className="text-sm font-medium leading-tight whitespace-nowrap">Cached Songs</p>
              <p className="text-xs text-text-disabled whitespace-nowrap">Offline library</p>
            </div>
          </button>
        )}
      </nav>

      {/* Right-click context menu */}
      {contextMenu && onShufflePlayPlaylist && onDownloadPlaylist && onRemovePlaylist && (
        <PlaylistContextMenu
          playlist={contextMenu.playlist}
          isPinned={contextMenu.isPinned}
          x={contextMenu.x}
          y={contextMenu.y}
          boundaryRef={sidebarRef}
          onPlay={onPlayPlaylist}
          onShufflePlay={onShufflePlayPlaylist}
          onDownload={onDownloadPlaylist}
          onTogglePin={onTogglePin}
          onRemove={onRemovePlaylist}
          onSyncNow={onSyncNow}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Hover tooltip — collapsed rail only */}
      {!expanded && hoveredPlaylist && (
        <div
          className="pointer-events-none fixed z-[120] flex flex-col justify-center -translate-y-1/2 rounded-md bg-surface-elevated px-3.5 py-2 shadow-xl min-w-max"
          style={{ left: hoveredPlaylist.x, top: hoveredPlaylist.y }}
        >
          <span className="truncate text-[15px] font-semibold tracking-wide text-accent mb-0.5">
            {hoveredPlaylist.playlist.title}
          </span>
          <div className="flex items-center text-[13px] font-medium text-text-muted">
            {hoveredPlaylist.isPinned && (
              <Pin className="mr-1 h-3.5 w-3.5 fill-accent text-accent" />
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

/**
 * Single sidebar entry used by BOTH the collapsed rail and the expanded list.
 *
 * Requirements: identical artwork dimensions (h-9 w-9), identical row height
 * (h-12) and identical padding in both states — expanding only reveals the
 * text column. Text/pin visibility is toggled with `hidden` (no opacity or
 * transform transitions) so nothing appears "after" the artwork while the
 * container width animates.
 */
function PlaylistNavItem({
  playlist,
  active,
  isPinned,
  expanded,
  onSelect,
  onTogglePin,
  onPlay,
  onContextMenu,
  onDropOn,
  onHover,
  onLeave,
  isPlaying,
  isPlaybackActive,
  isGlowDimmed = false,
  draggingPlaylistId,
  dropTargetPlaylistId,
  onDragPlaylist,
  onDragTarget,
  tracks,
}: {
  playlist: Playlist;
  active: boolean;
  isPinned: boolean;
  expanded: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onPlay: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onDropOn: (id: string, insertBefore: boolean) => void;
  onHover: (playlist: Playlist, isPinned: boolean, rect: DOMRect) => void;
  onLeave: () => void;
  isPlaying: boolean;
  isPlaybackActive: boolean;
  isGlowDimmed?: boolean;
  draggingPlaylistId: string | null;
  dropTargetPlaylistId: string | null;
  onDragPlaylist: (id: string | null) => void;
  onDragTarget: (id: string | null) => void;
  tracks?: Track[];
}) {
  const [canDrag, setCanDrag] = useState(false);
  const [insertBefore, setInsertBefore] = useState(true);
  const holdTimerRef = useRef<number | null>(null);

  const startHold = useCallback((event: React.MouseEvent) => {
    // Only start the drag-hold on a primary (left) click. Right-click should
    // open the context menu without arming the reorder drag or flickering the
    // active/hover styling.
    if (event.button !== 0) return;
    setCanDrag(false);
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      setCanDrag(true);
    }, 100);
  }, []);

  const startHoldTouch = useCallback(() => {
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
      data-playlist-context="true"
      data-playlist-id={playlist.id}
      data-playlist-pinned={isPinned ? '1' : '0'}
      draggable={canDrag}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={() => {
        cancelHold();
        onLeave();
      }}
      onTouchStart={startHoldTouch}
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
      onContextMenu={onContextMenu}
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
      onMouseEnter={(event) => {
        if (expanded) return;
        onHover(playlist, isPinned, event.currentTarget.getBoundingClientRect());
      }}
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-3 h-12 text-left cursor-pointer outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none active:ring-0 active:bg-transparent active:border-transparent active:shadow-none [webkit-tap-highlight-color:transparent] ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer active:cursor-pointer'
        } ${draggingPlaylistId === playlist.id ? 'opacity-40 cursor-grabbing' : ''
        } ${dropTargetPlaylistId === playlist.id && insertBefore
          ? 'before:absolute before:-top-px before:left-2 before:right-2 before:z-10 before:h-0.5 before:rounded-full before:bg-accent before:shadow-accent-line'
          : dropTargetPlaylistId === playlist.id && !insertBefore
            ? 'after:absolute after:-bottom-px after:left-2 after:right-2 after:z-10 after:h-0.5 after:rounded-full after:bg-accent after:shadow-accent-line'
            : ''
        } ${isPlaying && !isGlowDimmed
          ? 'border border-accent/25 bg-accent/10 text-accent shadow-accent-subtle hover:bg-accent/15'
          : active
            ? 'border border-transparent bg-surface text-text hover:bg-surface-active'
            : 'border border-transparent text-text-secondary hover:border-transparent hover:bg-surface-active hover:text-text'
        }`}
    >
      <div className="h-9 w-9 aspect-square rounded-[4px] relative shrink-0 overflow-hidden bg-surface shadow-sm group/art">
        <PlaylistArtwork playlist={playlist} tracks={tracks} />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(event) => { event.stopPropagation(); onPlay(); }}
          className="absolute inset-0 flex items-center justify-center bg-overlay/55 text-text opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-overlay/70 outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent]"
          aria-label={`Play ${playlist.title}`}
        >
          <Play className="h-4 w-4 fill-current" />
        </button>
      </div>

      <div className={`min-w-0 flex-1 overflow-hidden ${expanded ? 'block' : 'hidden'}`}>
        <p className={`text-sm font-medium leading-tight ${playlist.title.length <= 20 ? 'whitespace-nowrap' : 'truncate'}`}>
          {playlist.title}
        </p>
        {playlist.trackCount > 0 && (
          <p className="text-xs text-text-disabled whitespace-nowrap">{playlist.trackCount} tracks</p>
        )}
      </div>

      {expanded && isPlaying && isPlaybackActive && <Volume2 className="h-4 w-4 shrink-0 text-accent" aria-label="Playing" />}

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={`p-1.5 rounded-xl text-text hover:text-accent transition-colors outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none active:bg-transparent [webkit-tap-highlight-color:transparent] ${expanded ? (isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100') : 'hidden'
          }`}
        title={isPinned ? 'Unpin playlist' : 'Pin playlist'}
      >
        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}
