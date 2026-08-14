import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@/types';
import { CirclePlus, ListPlus, SkipForward, Timer, Download, Trash2 } from 'lucide-react';
import { AddToPlaylistDropdown } from './AddToPlaylistDropdown';

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
  onDownloadTrack?: (track: Track) => void;
  onDeleteTrack?: (track: Track) => void;
  isDownloading?: boolean;
  isHardwareOffline?: boolean;
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
  onDownloadTrack,
  onDeleteTrack,
  isDownloading = false,
  isHardwareOffline = false,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<'sleep' | 'add' | null>(null);
  const [menuTop, setMenuTop] = useState(y);
  const [submenuOffset, setSubmenuOffset] = useState(0);
  const [addSubmenuOffset, setAddSubmenuOffset] = useState(0);
  const addSubmenuRef = useRef<HTMLDivElement>(null);
  const menuWidth = 280;
  const submenuWidth = 224;
  const addSubmenuWidth = 280;
  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - menuWidth - 8));
  const rightSpace = window.innerWidth - (left + menuWidth);

  const modalRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    setAddSubmenuOffset(0);
    if (openSubmenu !== 'add' || !addSubmenuRef.current) return;
    const rect = addSubmenuRef.current.getBoundingClientRect();
    let offset = 0;
    if (rect.bottom > window.innerHeight - 8) offset -= rect.bottom - (window.innerHeight - 8);
    if (rect.top + offset < 8) offset += 8 - (rect.top + offset);
    setAddSubmenuOffset(offset);
  }, [openSubmenu, menuTop, playlists.length]);

  const run = (callback: () => void) => {
    onClose();
    callback();
  };

  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const openMenu = (submenu: 'sleep' | 'add') => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setOpenSubmenu(submenu);
  };

  const scheduleCloseMenu = (submenu: 'sleep' | 'add') => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => {
      setOpenSubmenu((current) => (current === submenu ? null : current));
    }, 100);
  };

  const toggleMenu = (submenu: 'sleep' | 'add') => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
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
      : 'below';
  const addSubmenuPlacement = rightSpace >= addSubmenuWidth + 8 ? 'right' : 'left';

  const submenuPosition = submenuPlacement === 'left'
    ? 'right-full mr-1 top-0'
    : submenuPlacement === 'right'
      ? 'left-full ml-1 top-0'
      : 'left-0 top-full mt-1';
  const menuAction = 'menu-action h-10 w-full text-[15px]';

  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showOfflineDownloadModal, setShowOfflineDownloadModal] = useState(false);

  const isManualOffline = typeof window !== 'undefined' && localStorage.getItem('yt_offline_mode') === 'true';
  const isOffline = isManualOffline || isHardwareOffline;

  const pingCheck = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/ping', { method: 'HEAD', cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleDownloadClick = async () => {
    if (!onDownloadTrack) return;
    const online = await pingCheck();
    if (isOffline || !online) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('offline'));
      }
      setShowOfflineDownloadModal(true);
      return;
    }
    run(() => onDownloadTrack(track));
  };

  const handleDeleteClick = async () => {
    if (!onDeleteTrack) return;
    const online = await pingCheck();
    if (isOffline || !online) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('offline'));
      }
      setShowOfflineModal(true);
      return;
    }
    run(() => onDeleteTrack(track));
  };

  const confirmOfflineDelete = () => {
    setShowOfflineModal(false);
    onDeleteTrack?.(track);
    onClose();
  };

  if (showOfflineModal) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
        <div ref={modalRef} className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#181818] p-6 shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Delete Download Offline?</h3>
            <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
              You are currently offline. If you delete <span className="text-white font-medium">"{track.title}"</span>, you won&apos;t be able to play or redownload it until your internet connection is restored.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowOfflineModal(false);
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmOfflineDelete}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-all"
            >
              Delete Anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showOfflineDownloadModal) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
        <div ref={modalRef} className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#181818] p-6 shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#00F2FE]/10 border border-[#00F2FE]/20 flex items-center justify-center">
            <Download className="w-6 h-6 text-[#00F2FE]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Internet Connection Required</h3>
            <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
              You are currently in offline mode or disconnected from the internet. Please enable your internet connection and turn off offline mode to download <span className="text-white font-medium">"{track.title}"</span>.
            </p>
          </div>
          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setShowOfflineDownloadModal(false);
                onClose();
              }}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#00F2FE] hover:bg-[#00C7D3] text-black shadow-lg shadow-[#00F2FE]/20 transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${track.title}`}
      className="fixed z-[100] w-[280px] rounded-xl border border-white/[0.08] bg-[#1e1e1e] p-1.5 shadow-2xl shadow-black/70 backdrop-blur-sm"
      style={{ left, top: menuTop }}
    >
      {/* Download / Delete Download */}
      {!isDownloading && (
        track.downloaded ? (
          onDeleteTrack && (
            <button onClick={handleDeleteClick} className={`${menuAction} hover:text-red-400`}>
              <Trash2 className="h-5 w-5 text-red-400" /> Delete download
            </button>
          )
        ) : (
          onDownloadTrack && (
            <button onClick={handleDownloadClick} className={menuAction}>
              <Download className="h-5 w-5 text-[#00F2FE]" /> Download song
            </button>
          )
        )
      )}

      <div className="relative" onMouseEnter={() => openMenu('add')}>
        <button
          onClick={() => toggleMenu('add')}
          className={`${menuAction} ${isOffline ? 'text-white/60' : ''}`}
          title={isOffline ? 'Playlist changes are unavailable offline' : undefined}
        >
          <CirclePlus className="h-5 w-5" /> Add to playlist <span className="ml-auto text-white/60">›</span>
        </button>
        {openSubmenu === 'add' && (
          <div
            ref={addSubmenuRef}
            className={`absolute top-0 z-50 ${addSubmenuPlacement === 'right' ? 'left-full ml-1' : 'right-full mr-1'}`}
            style={{ transform: `translateY(${addSubmenuOffset}px)` }}
          >
            <AddToPlaylistDropdown
              track={track}
              playlists={playlists}
              checkedIds={playlistId ? [playlistId] : []}
              onAdd={onAddToPlaylist}
              onRemove={(t, pid) => onRemoveFromPlaylist?.(t, pid)}
              isOffline={isOffline}
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
        className="relative group border-t border-white/10 pt-1"
        onMouseEnter={() => openMenu('sleep')}
        onMouseLeave={() => scheduleCloseMenu('sleep')}
      >
        <button onClick={() => toggleMenu('sleep')} className={menuAction}>
          <Timer className="h-5 w-5" /> Sleep timer <span className="ml-auto text-white/60">›</span>
        </button>
        {openSubmenu === 'sleep' && (
          <div
            ref={submenuRef}
            className={`absolute ${submenuPosition} w-[224px] rounded-xl border border-white/[0.08] bg-[#1e1e1e] p-1.5 shadow-2xl z-50`}
            style={{ transform: submenuPlacement === 'below' ? undefined : `translateY(${submenuOffset}px)` }}
          >
            {SLEEP_TIMER_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                onClick={() => run(() => onSetSleepTimer(preset.minutes))}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.1] hover:text-white transition-colors duration-150"
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => run(onOpenSleepTimer)}
              className="w-full rounded-lg border-t border-white/[0.08] px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.1] hover:text-white transition-colors duration-150"
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
