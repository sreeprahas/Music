import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@/types';
import { CirclePlus, ListPlus, SkipForward, Timer, Download, Trash2 } from 'lucide-react';
import { AddToPlaylistDropdown } from './AddToPlaylistDropdown';
import { calculateContextMenuPosition, type ContextMenuCalculatedPosition } from '@/lib/contextMenuPosition';

const SLEEP_TIMER_PRESETS = [
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

interface Props {
  track: Track;
  playlists: Playlist[];
  playlistId?: string;
  x: number;
  y: number;
  onPlayNext: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (track: Track, playlistId: string) => void;
  onRemoveFromPlaylist?: (track: Track, playlistId: string) => void;
  onSetSleepTimer: (minutes: number) => void;
  onOpenSleepTimer: () => void;
  onDownloadTrack?: (track: Track) => void;
  onDeleteTrack?: (track: Track) => void;
  onSetMatchOverride?: (track: Track) => void;
  isDownloading?: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  boundaryRef?: React.RefObject<HTMLElement | null>;
}

export function SongContextMenu({
  track,
  playlists,
  playlistId,
  x,
  y,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onSetSleepTimer,
  onOpenSleepTimer,
  onDownloadTrack,
  onDeleteTrack,
  onSetMatchOverride,
  isDownloading = false,
  onClose,
  anchorRef,
  boundaryRef,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const addSubmenuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [openSubmenu, setOpenSubmenu] = useState<'sleep' | 'add' | null>(null);
  const [closingSubmenu, setClosingSubmenu] = useState<'sleep' | 'add' | null>(null);
  const [isMenuClosing, setIsMenuClosing] = useState(false);

  const [pos, setPos] = useState<ContextMenuCalculatedPosition>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return calculateContextMenuPosition({
      cursorX: x,
      cursorY: y,
      menuWidth: 280,
      menuHeight: 240,
      viewportWidth: vw,
      viewportHeight: vh,
    });
  });

  const [submenuOffset, setSubmenuOffset] = useState(0);
  const [addSubmenuOffset, setAddSubmenuOffset] = useState(0);
  const [addSubmenuHeight, setAddSubmenuHeight] = useState<number | null>(null);

  const menuWidth = 280;
  const submenuWidth = 224;
  const addSubmenuWidth = 280;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (anchorRef?.current?.contains(event.target as Node)) return;
      if (modalRef.current?.contains(event.target as Node)) return;
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleViewportChange = () => onClose();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [anchorRef, onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const playerBarTop = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
      : undefined;

    const calculated = calculateContextMenuPosition({
      cursorX: x,
      cursorY: y,
      menuWidth: rect.width || menuWidth,
      menuHeight: rect.height || 240,
      viewportWidth: vw,
      viewportHeight: vh,
      bottomBoundary: playerBarTop ?? vh,
      horizontalGap: 4,
      verticalGap: 4,
    });

    setPos((current) => {
      if (
        current.x === calculated.x &&
        current.y === calculated.y &&
        current.placedAbove === calculated.placedAbove &&
        current.placedLeft === calculated.placedLeft
      ) {
        return current;
      }
      return calculated;
    });
  }, [x, y, openSubmenu, playlists.length]);

  useLayoutEffect(() => {
    setSubmenuOffset(0);
    const submenu = submenuRef.current;
    if (!submenu) return;
    const rect = submenu.getBoundingClientRect();
    const vh = window.innerHeight;
    const playerTop = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
      : undefined;
    const bottomEdge = Math.min(vh, playerTop ?? vh) - 8;
    const topEdge = 8;

    let offset = 0;
    if (rect.bottom > bottomEdge) offset -= rect.bottom - bottomEdge;
    if (rect.top + offset < topEdge) offset += topEdge - (rect.top + offset);
    setSubmenuOffset(offset);
  }, [openSubmenu, pos.y]);

  useLayoutEffect(() => {
    setAddSubmenuOffset(0);
    setAddSubmenuHeight(null);
    if (openSubmenu !== 'add' || !addSubmenuRef.current) return;
    const rect = addSubmenuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const playerTop = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
      : undefined;
    const bottomEdge = Math.min(vh, playerTop ?? vh) - 8;
    const topEdge = 8;

    let offset = 0;
    if (rect.bottom > bottomEdge) offset -= rect.bottom - bottomEdge;
    if (rect.top + offset < topEdge) offset += topEdge - (rect.top + offset);
    setAddSubmenuOffset(offset);

    const visibleTop = Math.max(topEdge, rect.top + offset);
    const availableHeight = Math.max(140, bottomEdge - visibleTop);
    if (rect.height > availableHeight) setAddSubmenuHeight(availableHeight);
  }, [openSubmenu, pos.y, playlists.length]);

  const run = (callback: () => void) => {
    onClose();
    callback();
  };

  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  const cancelMenuClose = () => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
      menuCloseTimeoutRef.current = null;
    }
    setIsMenuClosing(false);
  };

  const scheduleMenuClose = () => {
    if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
    setIsMenuClosing(true);
    menuCloseTimeoutRef.current = setTimeout(() => {
      menuCloseTimeoutRef.current = null;
      onClose();
    }, 160);
  };

  const openMenu = (submenu: 'sleep' | 'add') => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setClosingSubmenu(null);
    setOpenSubmenu(submenu);
  };

  const scheduleCloseMenu = (submenu: 'sleep' | 'add') => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => {
      setClosingSubmenu((current) => (openSubmenu === submenu ? submenu : current));
      leaveTimeoutRef.current = setTimeout(() => {
        setOpenSubmenu((current) => (current === submenu ? null : current));
        setClosingSubmenu((current) => (current === submenu ? null : current));
      }, 160);
    }, 100);
  };

  const toggleMenu = (submenu: 'sleep' | 'add') => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setClosingSubmenu(null);
    setOpenSubmenu((current) => {
      const next = current === submenu ? null : submenu;
      return next;
    });
  };

  const rightSpace = typeof window !== 'undefined' ? window.innerWidth - (pos.x + menuWidth) : 500;
  const leftSpace = pos.x;

  const submenuPlacement = rightSpace >= submenuWidth + 8
    ? 'right'
    : leftSpace >= submenuWidth + 8
      ? 'left'
      : pos.placedAbove
        ? 'above'
        : 'below';
  const addSubmenuPlacement = rightSpace >= addSubmenuWidth + 8 ? 'right' : 'left';

  const submenuPosition = submenuPlacement === 'left'
    ? 'right-full mr-1 top-0'
    : submenuPlacement === 'right'
      ? 'left-full ml-1 top-0'
      : submenuPlacement === 'below'
        ? 'left-0 top-full mt-1'
        : 'left-0 bottom-full mb-1';

  const menuAction = 'menu-action h-10 w-full text-[15px]';

  const handleDownloadClick = async () => {
    if (!onDownloadTrack) return;
    run(() => onDownloadTrack(track));
  };

  const handleDeleteClick = async () => {
    if (!onDeleteTrack) return;
    run(() => onDeleteTrack(track));
  };

  return (
    <div ref={modalRef}>
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${track.title}`}
        onMouseEnter={cancelMenuClose}
        onMouseLeave={scheduleMenuClose}
        className={`fixed z-[100] w-[280px] overflow-visible rounded-xl border border-border bg-surface p-1.5 shadow-2xl shadow-shadow/70 backdrop-blur-sm ${isMenuClosing ? 'animate-context-menu-out' : ''}`}
        style={{ left: pos.x, top: pos.y }}
      >
        {!isDownloading && (
          track.downloaded ? (
            onDeleteTrack && (
              <button onClick={handleDeleteClick} className={`${menuAction} hover:text-error`}>
                <Trash2 className="h-5 w-5 text-error" /> Delete download
              </button>
            )
          ) : (
            onDownloadTrack && (
              <button onClick={handleDownloadClick} className={menuAction}>
                <Download className="h-5 w-5 text-accent" /> Download song
              </button>
            )
          )
        )}

        <div
          className="relative"
          onMouseEnter={() => openMenu('add')}
          onMouseLeave={() => scheduleCloseMenu('add')}
        >
          <button
            onClick={() => toggleMenu('add')}
            className={menuAction}
          >
            <CirclePlus className="h-5 w-5" /> Add to playlist <span className="ml-auto text-text-secondary">›</span>
          </button>
          {openSubmenu === 'add' && (
            <div
              ref={addSubmenuRef}
              className={`absolute top-0 z-50 ${closingSubmenu === 'add' ? 'animate-dropdown-out' : 'animate-dropdown-in'} ${addSubmenuPlacement === 'right' ? 'left-full ml-1' : 'right-full mr-1'}`}
              style={{
                transform: `translateY(${addSubmenuOffset}px)`,
                ...(addSubmenuHeight
                  ? { height: `${addSubmenuHeight}px`, maxHeight: `${addSubmenuHeight}px`, overflow: 'hidden' }
                  : {}),
              }}
            >
              <AddToPlaylistDropdown
                track={track}
                playlists={playlists}
                style={addSubmenuHeight ? { height: `${addSubmenuHeight}px`, maxHeight: `${addSubmenuHeight}px` } : undefined}
                checkedIds={playlistId ? [playlistId] : []}
                onAdd={onAddToPlaylist}
                onRemove={(t, pid) => onRemoveFromPlaylist?.(t, pid)}
                onClose={() => {
                  setOpenSubmenu(null);
                  onClose();
                }}
              />
            </div>
          )}
        </div>

        <button onClick={() => run(() => onAddToQueue(track))} className={menuAction}>
          <ListPlus className="h-5 w-5" /> Add to queue
        </button>

        <div
          className="relative group border-t border-border pt-1"
          onMouseEnter={() => openMenu('sleep')}
          onMouseLeave={() => scheduleCloseMenu('sleep')}
        >
          <button onClick={() => toggleMenu('sleep')} className={menuAction}>
            <Timer className="h-5 w-5" /> Sleep timer <span className="ml-auto text-text-secondary">›</span>
          </button>
          {openSubmenu === 'sleep' && (
            <div
              ref={submenuRef}
              onMouseEnter={() => openMenu('sleep')}
              onMouseLeave={() => scheduleCloseMenu('sleep')}
              className={`absolute ${submenuPosition} w-[224px] rounded-xl border border-border bg-surface p-1.5 shadow-2xl z-50 ${closingSubmenu === 'sleep' ? 'animate-dropdown-out' : 'animate-dropdown-in'}`}
              style={{ transform: submenuPlacement === 'below' ? undefined : `translateY(${submenuOffset}px)` }}
            >
              {SLEEP_TIMER_PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  onClick={() => run(() => onSetSleepTimer(preset.minutes))}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors duration-150"
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => run(onOpenSleepTimer)}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors duration-150"
              >
                End of track
              </button>
              <button
                onClick={() => run(onOpenSleepTimer)}
                className="w-full rounded-lg border-t border-border px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors duration-150"
              >
                Custom timer…
              </button>
            </div>
          )}
        </div>

        <button onClick={() => run(() => onPlayNext(track))} className={menuAction}>
          <SkipForward className="h-5 w-5" /> Play next
        </button>
      </div>
    </div>
  );
}
