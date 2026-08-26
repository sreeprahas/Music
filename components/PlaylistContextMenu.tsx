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

  // Kept so existing callers don't need to be changed.
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
  const [position, setPosition] = useState({
    left: x,
    top: y,
  });

  const [isMenuClosing, setIsMenuClosing] = useState(false);

  const menuCloseTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSyncable =
    (playlist.source === 'spotify' || playlist.source === 'youtube') &&
    Boolean(playlist.sourcePlaylistId);

  /*
   * Wait until client mount before using document.body.
   */
  useEffect(() => {
    setMounted(true);

    return () => {
      setMounted(false);
    };
  }, []);

  /*
   * Calculate position after the real menu dimensions are known.
   *
   * IMPORTANT:
   * x/y are clientX/clientY -> viewport coordinates.
   *
   * The menu is:
   *   1. portalled into document.body
   *   2. position: fixed
   *
   * Therefore x/y can be used directly.
   */
  useLayoutEffect(() => {
    if (!mounted) return;

    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();

    const padding = 8;
    const cursorGap = 4;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    /*
     * Find the top of the bottom music player, if present.
     * Otherwise use the full viewport height.
     */
    const player =
      document.querySelector<HTMLElement>('.music-player');

    const playerTop =
      player?.getBoundingClientRect().top ?? viewportHeight;

    const usableBottom = Math.min(
      viewportHeight,
      playerTop
    );

    /*
     * Start slightly away from the cursor.
     */
    let left = x + cursorGap;
    let top = y + cursorGap;

    /*
     * If menu would overflow right side,
     * open it to the LEFT of the cursor.
     */
    if (left + rect.width > viewportWidth - padding) {
      left = x - rect.width - cursorGap;
    }

    /*
     * If menu would overflow bottom,
     * open it ABOVE the cursor.
     */
    if (top + rect.height > usableBottom - padding) {
      top = y - rect.height - cursorGap;
    }

    /*
     * Final viewport safety clamp.
     */
    left = Math.max(
      padding,
      Math.min(
        left,
        viewportWidth - rect.width - padding
      )
    );

    top = Math.max(
      padding,
      Math.min(
        top,
        usableBottom - rect.height - padding
      )
    );

    setPosition({
      left,
      top,
    });
  }, [mounted, x, y, playlist.id]);

  /*
   * Close when clicking outside, pressing Escape,
   * resizing, or scrolling.
   */
  useEffect(() => {
    if (!mounted) return;

    const handlePointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;

      if (
        menu &&
        !menu.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleResize = () => {
      onClose();
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener(
      'pointerdown',
      handlePointerDown
    );

    document.addEventListener(
      'keydown',
      handleKeyDown
    );

    window.addEventListener(
      'resize',
      handleResize
    );

    /*
     * capture=true catches scrolling from nested
     * playlist containers too.
     */
    window.addEventListener(
      'scroll',
      handleScroll,
      true
    );

    return () => {
      document.removeEventListener(
        'pointerdown',
        handlePointerDown
      );

      document.removeEventListener(
        'keydown',
        handleKeyDown
      );

      window.removeEventListener(
        'resize',
        handleResize
      );

      window.removeEventListener(
        'scroll',
        handleScroll,
        true
      );
    };
  }, [mounted, onClose]);

  /*
   * Clean up delayed close timer.
   */
  useEffect(() => {
    return () => {
      if (menuCloseTimeoutRef.current) {
        clearTimeout(menuCloseTimeoutRef.current);
      }
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
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
    }

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

  const menuAction =
    'menu-action h-10 w-full text-[15px]';

  if (!mounted) {
    return null;
  }

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${playlist.title}`}
      onMouseEnter={cancelMenuClose}
      onMouseLeave={scheduleMenuClose}
      className={`
        fixed
        z-[99999]
        w-[280px]
        overflow-visible
        rounded-xl
        border
        border-border
        bg-surface
        p-1.5
        shadow-2xl
        shadow-shadow/70
        backdrop-blur-sm
        ${
          isMenuClosing
            ? 'animate-context-menu-out'
            : ''
        }
      `}
      style={{
        left: position.left,
        top: position.top,
      }}
    >
      <button
        type="button"
        onClick={() =>
          run(() => onPlay(playlist.id))
        }
        className={menuAction}
      >
        <Play className="h-5 w-5 text-accent" />
        Play
      </button>

      <button
        type="button"
        onClick={() =>
          run(() => onShufflePlay(playlist.id))
        }
        className={menuAction}
      >
        <Shuffle className="h-5 w-5 text-accent" />
        Shuffle play
      </button>

      <button
        type="button"
        onClick={() =>
          run(() => onDownload(playlist.id))
        }
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
            title={`Sync this playlist with ${playlist.source === 'spotify' ? 'Spotify' : 'YouTube Music'}`}
          >
            <RefreshCw className="h-5 w-5 text-accent" />
            Sync now
          </button>
        </>
      )}

      <div className="my-1 border-t border-border" />

      <button
        type="button"
        onClick={() =>
          run(() => onTogglePin(playlist.id))
        }
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
        onClick={() =>
          run(() => onRemove(playlist.id))
        }
        className={`${menuAction} hover:text-error`}
      >
        <Trash2 className="h-5 w-5 text-error" />
        Remove playlist
      </button>
    </div>
  );

  /*
   * CRITICAL:
   *
   * Render outside PlaylistGrid and all of its transformed /
   * scrolling / positioned ancestors.
   */
  return createPortal(menu, document.body);
}