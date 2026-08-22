import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@/types';
import { CirclePlus, ListPlus, SkipForward, Timer, Download, Trash2 } from 'lucide-react';
import { AddToPlaylistDropdown } from './AddToPlaylistDropdown';

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
  const [openSubmenu, setOpenSubmenu] = useState<'sleep' | 'add' | null>(null);
  const [closingSubmenu, setClosingSubmenu] = useState<'sleep' | 'add' | null>(null);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const [menuTop, setMenuTop] = useState(y);
  const [submenuOffset, setSubmenuOffset] = useState(0);
  const [addSubmenuOffset, setAddSubmenuOffset] = useState(0);
  const [addSubmenuHeight, setAddSubmenuHeight] = useState<number | null>(null);
  const addSubmenuRef = useRef<HTMLDivElement>(null);
  const menuWidth = 280;
  const submenuWidth = 224;
  const addSubmenuWidth = 280;
  const boundary = boundaryRef?.current?.getBoundingClientRect();
  const playerBarTop = typeof document !== 'undefined'
    ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
    : undefined;
  const boundaryLeft = boundary?.left ?? 0;
  const boundaryRight = boundary?.right ?? window.innerWidth;
  const boundaryTop = boundary?.top ?? 0;
  const boundaryBottom = Math.min(boundary?.bottom ?? window.innerHeight, playerBarTop ?? window.innerHeight);
  const left = Math.min(Math.max(boundaryLeft + 8, x), Math.max(boundaryLeft + 8, boundaryRight - menuWidth - 8));
  const rightSpace = boundaryRight - (left + menuWidth);

  const modalRef = useRef<HTMLDivElement>(null);

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
    const bounds = boundaryRef?.current?.getBoundingClientRect();
    const topEdge = (bounds?.top ?? 0) + 8;
    const playerTop = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
      : undefined;
    const bottomEdge = Math.min(bounds?.bottom ?? window.innerHeight, playerTop ?? window.innerHeight) - 8;
    const nextTop = Math.min(Math.max(topEdge, y), Math.max(topEdge, bottomEdge - rect.height));
    if (Math.abs(nextTop - menuTop) > 1) setMenuTop(nextTop);
  }, [boundaryRef, menuTop, openSubmenu, playlists.length, y]);

  useLayoutEffect(() => {
    setSubmenuOffset(0);
    const submenu = submenuRef.current;
    if (!submenu) return;
    const rect = submenu.getBoundingClientRect();
    let offset = 0;
    const bounds = boundaryRef?.current?.getBoundingClientRect();
    const topEdge = (bounds?.top ?? 0) + 8;
    const playerTop = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
      : undefined;
    const bottomEdge = Math.min(bounds?.bottom ?? window.innerHeight, playerTop ?? window.innerHeight) - 8;
    if (rect.bottom > bottomEdge) offset -= rect.bottom - bottomEdge;
    if (rect.top + offset < topEdge) offset += topEdge - (rect.top + offset);
    setSubmenuOffset(offset);
  }, [boundaryRef, openSubmenu, playlists.length, menuTop]);

  useLayoutEffect(() => {
    setAddSubmenuOffset(0);
    setAddSubmenuHeight(null);
    if (openSubmenu !== 'add' || !addSubmenuRef.current) return;
    const rect = addSubmenuRef.current.getBoundingClientRect();
    let offset = 0;
    const bounds = boundaryRef?.current?.getBoundingClientRect();
    const topEdge = (bounds?.top ?? 0) + 8;
    const playerTop = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
      : undefined;
    const bottomEdge = Math.min(bounds?.bottom ?? window.innerHeight, playerTop ?? window.innerHeight) - 8;
    if (rect.bottom > bottomEdge) offset -= rect.bottom - bottomEdge;
    if (rect.top + offset < topEdge) offset += topEdge - (rect.top + offset);
    setAddSubmenuOffset(offset);
    const visibleTop = Math.max(topEdge, rect.top + offset);
    const availableHeight = Math.max(140, bottomEdge - visibleTop);
    if (rect.height > availableHeight) setAddSubmenuHeight(availableHeight);
  }, [boundaryRef, openSubmenu, menuTop, playlists.length]);

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

  const leftSpace = left;
  const submenuPlacement = rightSpace >= submenuWidth + 8
    ? 'right'
    : leftSpace >= submenuWidth + 8
      ? 'left'
      : boundaryBottom - menuTop >= 250
        ? 'below'
        : 'above';
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
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${track.title}`}
      onMouseEnter={cancelMenuClose}
      onMouseLeave={scheduleMenuClose}
      className={`absolute z-[100] w-[280px] overflow-visible rounded-xl border border-border bg-surface p-1.5 shadow-2xl shadow-shadow/70 backdrop-blur-sm ${isMenuClosing ? 'animate-context-menu-out' : ''}`}
      style={{ left: left - boundaryLeft, top: menuTop - boundaryTop }}
    >
      {/* Download / Delete Download */}
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
  );
}
