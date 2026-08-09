import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@/types';
import { CircleMinus, CirclePlus, ListPlus, SkipForward, Timer } from 'lucide-react';

const SLEEP_TIMER_PRESETS = [
  { label: '15 mins', minutes: 15 },
  { label: '30 mins', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
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
  onClose: () => void;
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
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<'playlist' | 'sleep' | null>(null);
  const [menuTop, setMenuTop] = useState(y);
  const [submenuOffset, setSubmenuOffset] = useState(0);
  const menuWidth = 280;
  const submenuWidth = 224;
  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - menuWidth - 8));
  const rightSpace = window.innerWidth - (left + menuWidth);
  const leftSpace = left;
  const submenuPlacement = rightSpace >= submenuWidth + 8
    ? 'right'
    : leftSpace >= submenuWidth + 8
      ? 'left'
      : 'below';
  const submenuSideSpace = submenuPlacement === 'left' ? leftSpace : window.innerWidth - left - 16;
  const playlistColumns = Math.max(1, Math.min(
    Math.ceil(Math.max(playlists.length, 1) / 8),
    Math.floor(submenuSideSpace / submenuWidth) || 1,
  ));

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
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
    const nextTop = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - rect.height - 8));
    if (Math.abs(nextTop - menuTop) > 1) setMenuTop(nextTop);
  }, [menuTop, openSubmenu, playlists.length, y]);

  useLayoutEffect(() => {
    setSubmenuOffset(0);
    const submenu = submenuRef.current;
    if (!submenu) return;
    const rect = submenu.getBoundingClientRect();
    let offset = 0;
    if (rect.bottom > window.innerHeight - 8) offset -= rect.bottom - (window.innerHeight - 8);
    if (rect.top + offset < 8) offset += 8 - (rect.top + offset);
    setSubmenuOffset(offset);
  }, [openSubmenu, playlists.length, menuTop]);

  const run = (callback: () => void) => {
    onClose();
    callback();
  };

  const openMenu = (submenu: 'playlist' | 'sleep') => setOpenSubmenu(submenu);
  const toggleMenu = (submenu: 'playlist' | 'sleep') => {
    setOpenSubmenu((current) => current === submenu ? null : submenu);
  };

  const submenuPosition = submenuPlacement === 'left'
    ? 'right-full mr-1 top-0'
    : submenuPlacement === 'right'
      ? 'left-full ml-1 top-0'
      : 'left-0 top-full mt-1';
  const menuAction = 'menu-action h-10 w-full text-[15px]';

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${track.title}`}
      className="fixed z-[100] w-[280px] rounded-lg border border-white/10 bg-[#292929] p-1.5 shadow-2xl shadow-black/60"
      style={{ left, top: menuTop }}
    >
      <div className="relative group" onMouseEnter={() => openMenu('playlist')}>
        <button onClick={() => toggleMenu('playlist')} className={menuAction}>
          <CirclePlus className="h-5 w-5" /> Add to playlist <span className="ml-auto text-white/60">›</span>
        </button>
        {openSubmenu === 'playlist' && (
          <div ref={submenuRef} className={`absolute ${submenuPosition} grid gap-1 rounded-lg border border-white/10 bg-[#292929] p-1.5 shadow-2xl ${openSubmenu === 'playlist' ? 'grid' : 'hidden group-hover:grid'}`} style={{ width: playlistColumns * submenuWidth, gridTemplateColumns: `repeat(${playlistColumns}, minmax(0, 1fr))`, transform: submenuPlacement === 'below' ? undefined : `translateY(${submenuOffset}px)` }}>
            {playlists.length === 0 ? (
              <p className="px-3 py-2 text-xs text-white/40">No playlists available</p>
            ) : playlists.map((playlist) => (
              <button
                key={playlist.id}
                onClick={() => run(() => onAddToPlaylist(track, playlist.id))}
                className="w-full min-w-0 truncate rounded-md px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 hover:text-[#00F2FE]"
              >
                {playlist.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {playlistId && onRemoveFromPlaylist && (
        <button onClick={() => run(() => onRemoveFromPlaylist(track, playlistId))} className={menuAction}>
          <CircleMinus className="h-5 w-5" /> Remove from this playlist
        </button>
      )}
      <button onClick={() => run(() => onAddToQueue(track))} className={menuAction}>
        <ListPlus className="h-5 w-5" /> Add to queue
      </button>
      <div className="relative group border-t border-white/10 pt-1" onMouseEnter={() => openMenu('sleep')}>
        <button onClick={() => toggleMenu('sleep')} className={menuAction}>
          <Timer className="h-5 w-5" /> Sleep timer <span className="ml-auto text-white/60">›</span>
        </button>
        {openSubmenu === 'sleep' && (
          <div ref={submenuRef} className={`absolute ${submenuPosition} w-[224px] rounded-lg border border-white/10 bg-[#292929] p-1.5 shadow-2xl ${openSubmenu === 'sleep' ? 'block' : 'hidden group-hover:block'}`} style={{ transform: submenuPlacement === 'below' ? undefined : `translateY(${submenuOffset}px)` }}>
            {SLEEP_TIMER_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                onClick={() => run(() => onSetSleepTimer(preset.minutes))}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 hover:text-[#00F2FE]"
              >
                {preset.label}
              </button>
            ))}
            <button onClick={() => run(onOpenSleepTimer)} className="w-full rounded-md border-t border-white/10 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 hover:text-[#00F2FE]">
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
