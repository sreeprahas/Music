'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { Playlist } from '@/types';
import {
  Download,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  Shuffle,
  Trash2,
} from 'lucide-react';
import { calculateContextMenuPosition } from '@/lib/contextMenuPosition';

interface Props {
  playlist: Playlist;
  isPinned: boolean;
  x: number;
  y: number;
  onPlay: (playlistId: string) => void;
  onShufflePlay: (playlistId: string) => void;
  onDownload: (playlistId: string) => void;
  onTogglePin: (playlistId: string) => void;
  onRemove: (playlistId: string) => void;
  onClose: () => void;
  onSyncNow?: (playlistId: string) => void;
  boundaryRef?: React.RefObject<HTMLElement | null>;
}

export function PlaylistContextMenu({
  playlist,
  isPinned,
  x,
  y,
  onPlay,
  onShufflePlay,
  onDownload,
  onTogglePin,
  onRemove,
  onClose,
  onSyncNow,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);

  // Start null so the menu is invisible until useLayoutEffect places it correctly.
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const [isMenuClosing, setIsMenuClosing] = useState(false);

  const menuCloseTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSyncable =
    (playlist.source === 'spotify' || playlist.source === 'youtube') &&
    Boolean(playlist.sourcePlaylistId);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  /**
   * Calculate position AFTER real menu dimensions are measured.
   * x/y are clientX/clientY (viewport coords).
   * Menu is portalled into document.body with position:fixed.
   */
  useLayoutEffect(() => {
    if (!mounted) return;
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const playerTop =
      document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top ?? vh;

    const pos = calculateContextMenuPosition({
      cursorX: x,
      cursorY: y,
      menuWidth: rect.width || 280,
      menuHeight: rect.height || 220,
      viewportWidth: vw,
      viewportHeight: vh,
      bottomBoundary: playerTop,
      horizontalGap: 4,
      verticalGap: 4,
    });

    setPosition({ left: pos.x, top: pos.y });
  }, [mounted, x, y, playlist.id]);

  /** Close on outside click / Escape / resize / scroll */
  useEffect(() => {
    if (!mounted) return;

    const handlePointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu && !menu.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleResize = () => onClose();
    const handleScroll = () => onClose();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [mounted, onClose]);

  useEffect(() => {
    return () => {
      if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
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

  const run = (callback: () => void) => {
    onClose();
    callback();
  };

  const handleSyncNowClick = () => {
    if (!onSyncNow) return;
    onClose();
    onSyncNow(playlist.id);
  };

  const menuAction = 'menu-action h-10 w-full text-[15px]';

  if (!mounted) return null;

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${playlist.title}`}
      onMouseEnter={cancelMenuClose}
      onMouseLeave={scheduleMenuClose}
      className={`fixed z-[99999] w-[280px] overflow-visible rounded-xl border border-border bg-surface p-1.5 shadow-2xl shadow-shadow/70 backdrop-blur-sm ${
        isMenuClosing ? 'animate-context-menu-out' : 'animate-context-menu-in'
      }`}
      style={{
        // Use visibility:hidden until position is known to avoid flash at raw cursor coords
        visibility: position ? 'visible' : 'hidden',
        left: position?.left ?? x,
        top: position?.top ?? y,
      }}
    >
      <button
        type="button"
        onClick={() => run(() => onPlay(playlist.id))}
        className={menuAction}
      >
        <Play className="h-5 w-5 text-accent" />
        Play
      </button>

      <button
        type="button"
        onClick={() => run(() => onShufflePlay(playlist.id))}
        className={menuAction}
      >
        <Shuffle className="h-5 w-5 text-accent" />
        Shuffle play
      </button>

      <button
        type="button"
        onClick={() => run(() => onDownload(playlist.id))}
        className={menuAction}
      >
        <Download className="h-5 w-5 text-accent" />
        Download all songs
      </button>

      {isSyncable && onSyncNow && (
        <>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={handleSyncNowClick}
            className={menuAction}
            title={`Sync this playlist with ${playlist.source === 'spotify' ? 'Spotify' : 'YouTube'}`}
          >
            <RefreshCw className="h-5 w-5 text-accent" />
            Sync now
          </button>
        </>
      )}

      <div className="my-1 border-t border-border" />

      <button
        type="button"
        onClick={() => run(() => onTogglePin(playlist.id))}
        className={menuAction}
      >
        {isPinned ? (
          <>
            <PinOff className="h-5 w-5" />
            Unpin playlist
          </>
        ) : (
          <>
            <Pin className="h-5 w-5" />
            Pin playlist
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() => run(() => onRemove(playlist.id))}
        className={`${menuAction} hover:text-error`}
      >
        <Trash2 className="h-5 w-5 text-error" />
        Remove playlist
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}