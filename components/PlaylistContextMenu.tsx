'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playlist } from '@/types';
import { Download, Pin, PinOff, Play, RefreshCw, Shuffle, Trash2 } from 'lucide-react';
import { useSpotifySyncAction } from '@/hooks/useSpotifySyncAction';
import { SpotifySyncConfirmModal } from './SpotifySyncConfirmModal';

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
  /** Called after confirmation to execute an immediate Spotify sync. Spotify playlists only. */
  onSyncNow?: (playlistId: string) => void;
  boundaryRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Right-click context menu for a playlist card/nav item.
 *
 * For Spotify-imported playlists it also exposes "Sync now",
 * which routes through the shared SpotifySync confirmation flow.
 */
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
  boundaryRef,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const [menuTop, setMenuTop] = useState(y);
  const menuWidth = 280;
  const menuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared Spotify sync confirmation flow
  const { requestSyncAction, isModalOpen, handleModalCancel, handleModalContinue } = useSpotifySyncAction();

  const isSpotify = playlist.source === 'spotify' && Boolean(playlist.sourcePlaylistId);

  const boundary = boundaryRef?.current?.getBoundingClientRect();
  const playerBarTop = typeof document !== 'undefined'
    ? document.querySelector<HTMLElement>('.music-player')?.getBoundingClientRect().top
    : undefined;
  const boundaryLeft = boundary?.left ?? 0;
  const boundaryRight = boundary?.right ?? window.innerWidth;
  const boundaryTop = boundary?.top ?? 0;
  const boundaryBottom = Math.min(boundary?.bottom ?? window.innerHeight, playerBarTop ?? window.innerHeight);
  // Use viewport coordinates (position: fixed) so the menu can escape any
  // `overflow: hidden` ancestor (e.g. the narrow sidebar) without being
  // clipped at its edges.
  //
  // When the cursor is inside a narrow boundary (the sidebar), spawn the
  // menu to the right of the cursor so it extends into the main content
  // area instead of being squeezed against the sidebar's right edge.
  const cursorInsideBoundary = boundary ? x >= boundaryLeft && x <= boundaryRight : false;
  const boundaryTooNarrow = boundary ? boundaryRight - boundaryLeft < menuWidth + 16 : false;
  const preferredLeft = cursorInsideBoundary && boundaryTooNarrow ? x + 4 : x;
  const left = Math.min(
    Math.max(8, preferredLeft),
    Math.max(8, window.innerWidth - menuWidth - 8)
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
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
  }, [onClose]);

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
  }, [boundaryRef, menuTop, y]);

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
    requestSyncAction({
      onConfirm: () => onSyncNow(playlist.id),
    });
  };

  const menuAction = 'menu-action h-10 w-full text-[15px]';

  return (
    <div ref={modalRef}>
      {/* Sync confirmation modal rendered outside menu so it is never clipped */}
      {isModalOpen && (
        <SpotifySyncConfirmModal
          onCancel={handleModalCancel}
          onContinue={handleModalContinue}
        />
      )}
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${playlist.title}`}
        onMouseEnter={cancelMenuClose}
        onMouseLeave={scheduleMenuClose}
        className={`fixed z-[100] w-[280px] overflow-visible rounded-xl border border-border bg-surface p-1.5 shadow-2xl shadow-shadow/70 backdrop-blur-sm ${isMenuClosing ? 'animate-context-menu-out' : ''}`}
        style={{ left, top: menuTop }}
      >
        <button onClick={() => run(() => onPlay(playlist.id))} className={menuAction}>
          <Play className="h-5 w-5 text-accent" /> Play
        </button>

        <button onClick={() => run(() => onShufflePlay(playlist.id))} className={menuAction}>
          <Shuffle className="h-5 w-5 text-accent" /> Shuffle play
        </button>

        <button onClick={() => run(() => onDownload(playlist.id))} className={menuAction}>
          <Download className="h-5 w-5 text-accent" /> Download all songs
        </button>

        {/* Spotify-specific sync action */}
        {isSpotify && onSyncNow && (
          <>
            <div className="border-t border-border my-1" />
            <button
              onClick={handleSyncNowClick}
              className={menuAction}
              title="Sync this playlist with Spotify"
            >
              <RefreshCw className="h-5 w-5 text-accent" /> Sync now
            </button>
          </>
        )}

        <div className="border-t border-border my-1" />

        <button onClick={() => run(() => onTogglePin(playlist.id))} className={menuAction}>
          {isPinned ? (
            <>
              <PinOff className="h-5 w-5" /> Unpin playlist
            </>
          ) : (
            <>
              <Pin className="h-5 w-5" /> Pin playlist
            </>
          )}
        </button>

        <button onClick={() => run(() => onRemove(playlist.id))} className={`${menuAction} hover:text-error`}>
          <Trash2 className="h-5 w-5 text-error" /> Remove playlist
        </button>
      </div>
    </div>
  );
}
