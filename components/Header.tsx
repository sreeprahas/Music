'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { DownloadJob, UserProfile, Track } from '@/types';
import { Download, LogOut, CheckCircle, AlertCircle, Loader2, X, Search, Undo2, Redo2, Wifi, WifiOff, Home } from 'lucide-react';
import { cleanArtistName } from '@/lib/ytmusicFormat';

interface HeaderProps {
  user: UserProfile;
  activeDownloadCount: number;
  downloadJobs: DownloadJob[];
  onOpenPlaylist: (playlistId: string) => void;
  onHomeClick?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onCommitSearch?: (query: string) => void;
  searchResults?: Track[];
  onResultClick?: (track: Track) => void;
  searchMode?: 'name' | 'artist';
  onSearchModeChange?: (mode: 'name' | 'artist') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isOfflineMode?: boolean;
  isHardwareOffline?: boolean;
  onToggleOfflineMode?: () => void;
}

export function Header({
  user,
  activeDownloadCount,
  downloadJobs,
  onOpenPlaylist,
  onHomeClick,
  searchQuery = '',
  onSearchChange,
  onCommitSearch,
  searchResults = [],
  onResultClick,
  searchMode = 'name',
  onSearchModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isOfflineMode = false,
  isHardwareOffline = false,
  onToggleOfflineMode,
}: HeaderProps) {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isDownloadClosing, setIsDownloadClosing] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isAccountMenuClosing, setIsAccountMenuClosing] = useState(false);
  const [localInput, setLocalInput] = useState(searchQuery);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [isSearchClosing, setIsSearchClosing] = useState(false);
  const [activeResultIdx, setActiveResultIdx] = useState(-1);
  const [cachedProfilePicture, setCachedProfilePicture] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem('music_profile_photo') || ''; } catch { return ''; }
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPopoverClose = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
    setIsDownloadClosing(false);
    setIsAccountMenuClosing(false);
  };

  const schedulePopoverClose = (type: 'download' | 'account') => {
    if (type === 'download' && !isDownloadOpen) return;
    if (type === 'account' && !isAccountMenuOpen) return;
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    if (type === 'download') setIsDownloadClosing(true);
    else setIsAccountMenuClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      if (type === 'download') {
        setIsDownloadOpen(false);
        setIsDownloadClosing(false);
      } else {
        setIsAccountMenuOpen(false);
        setIsAccountMenuClosing(false);
      }
    }, 160);
  };

  useEffect(() => () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    if (searchCloseTimeoutRef.current) clearTimeout(searchCloseTimeoutRef.current);
  }, []);

  const cancelSearchClose = () => {
    if (searchCloseTimeoutRef.current) clearTimeout(searchCloseTimeoutRef.current);
    searchCloseTimeoutRef.current = null;
    setIsSearchClosing(false);
  };

  const scheduleSearchClose = () => {
    if (!searchDropdownOpen) return;
    if (searchCloseTimeoutRef.current) clearTimeout(searchCloseTimeoutRef.current);
    setIsSearchClosing(true);
    searchCloseTimeoutRef.current = setTimeout(() => {
      searchCloseTimeoutRef.current = null;
      setSearchDropdownOpen(false);
      setIsSearchClosing(false);
    }, 160);
  };

  useEffect(() => {
    setLocalInput(searchQuery);
  }, [searchQuery]);

  // Keep the account avatar available for the cached/offline app shell.
  useEffect(() => {
    const picture = user.picture || user.image || '';
    if (!picture) return;
    if (cachedProfilePicture.startsWith('data:image/')) return;
    let cancelled = false;
    fetch(picture, { mode: 'cors', cache: 'force-cache' })
      .then((response) => response.ok ? response.blob() : null)
      .then((blob) => new Promise<string | null>((resolve) => {
        if (!blob) return resolve(null);
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      }))
      .then((dataUrl) => {
        if (cancelled || !dataUrl) return;
        setCachedProfilePicture(dataUrl);
        try { window.localStorage.setItem('music_profile_photo', dataUrl); } catch { /* quota/storage disabled */ }
      })
      .catch(() => { if (!cancelled) setCachedProfilePicture((current) => current || picture); });
    return () => { cancelled = true; };
  }, [cachedProfilePicture, user.picture, user.image]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDownloadOpen(false);
        setIsDownloadClosing(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
        setIsAccountMenuClosing(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchDropdownOpen(false);
        setActiveResultIdx(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open dropdown whenever local input is non-empty
  useEffect(() => {
    setSearchDropdownOpen(localInput.trim().length > 0);
    setActiveResultIdx(-1);
  }, [localInput]);

  const visibleResults = searchResults.slice(0, 8);

  const commitResult = (track: Track) => {
    onResultClick?.(track);
    setSearchDropdownOpen(false);
    setActiveResultIdx(-1);
  };

  const handleLogoClick = () => {
    if (onHomeClick) onHomeClick();
  };

  const activeJobs = downloadJobs.filter((j) => j.status === 'running' || j.status === 'starting');
  const finishedJobs = downloadJobs.filter((j) => j.status === 'done' || j.status === 'error');

  return (
    <header className="music-header w-full h-[72px] bg-[#0A0A0A] border-b border-white/5 pl-6 pr-40 flex items-center justify-between select-none shrink-0 z-30 relative">
      {/* Left branding */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-3 cursor-pointer group"
          title="Music"
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-all duration-500 ease-out bg-[#0A0A0A] border border-transparent group-hover:border-[#00F2FE]/30 group-hover:bg-[#00F2FE]/10 group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_0_14px_rgba(0,242,254,0.16),0_10px_26px_rgba(110,72,180,0.18)] group-active:border-transparent group-active:bg-[#0A0A0A] group-active:shadow-none">
            <img src="/music-icon.png" alt="" className="w-8 h-8 object-cover" />
          </div>
          <span className="text-white font-black text-lg tracking-tight group-hover:text-[#00F2FE] transition-colors">
            Music
          </span>
        </button>
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Back"
            className="p-2 rounded-xl text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] hover:shadow-[0_0_16px_rgba(0,242,254,0.16)] disabled:text-white/25 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all duration-300"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Forward"
            className="p-2 rounded-xl text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] hover:shadow-[0_0_16px_rgba(0,242,254,0.16)] disabled:text-white/25 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all duration-300"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center: Home + Search */}
      <div className="flex-1 max-w-2xl mx-6 hidden md:flex items-center gap-2">
        {/* Home button — left of the search bar */}
        <button
          onClick={onHomeClick}
          title="Home"
          className="shrink-0 p-2.5 rounded-full bg-white/5 border border-transparent text-white hover:text-[#00F2FE] hover:bg-[#00F2FE]/10 hover:border-[#00F2FE]/30 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_0_14px_rgba(0,242,254,0.16),0_10px_26px_rgba(110,72,180,0.18)] transition-all duration-500 ease-out"
        >
          <Home className="w-4 h-4" />
        </button>

        {/* Search bar + dropdown */}
        <div ref={searchContainerRef} onMouseEnter={cancelSearchClose} className="flex-1 flex items-center gap-2 relative">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-white/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={localInput}
              onChange={(e) => {
                const val = e.target.value;
                setLocalInput(val);
                onSearchChange?.(val);
              }}
              onFocus={() => localInput.trim() && setSearchDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveResultIdx((i) => Math.min(i + 1, visibleResults.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveResultIdx((i) => Math.max(i - 1, -1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (activeResultIdx >= 0 && visibleResults[activeResultIdx]) {
                    commitResult(visibleResults[activeResultIdx]);
                  } else {
                    onCommitSearch?.(localInput);
                    setSearchDropdownOpen(false);
                  }
                } else if (e.key === 'Escape') {
                  setSearchDropdownOpen(false);
                  setActiveResultIdx(-1);
                  inputRef.current?.blur();
                }
              }}
              placeholder="What do you want to listen to?"
              className="w-full bg-white/5 border border-transparent rounded-full pl-10 pr-9 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:outline-none hover:border-[#00F2FE]/30 hover:bg-[#00F2FE]/10 hover:shadow-[0_0_14px_rgba(0,242,254,0.16),0_10px_26px_rgba(110,72,180,0.18)] focus:border-[#00F2FE]/45 focus:bg-[#00F2FE]/14 focus:shadow-[0_0_16px_rgba(0,242,254,0.22),0_10px_26px_rgba(110,72,180,0.22)] caret-[#00F2FE] transition-[background-color,box-shadow] duration-500 ease-out"
            />
            {localInput && (
              <button
                onClick={() => {
                  setLocalInput('');
                  onSearchChange?.('');
                  onCommitSearch?.('');
                  setSearchDropdownOpen(false);
                  inputRef.current?.focus();
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Live search dropdown */}
            {searchDropdownOpen && visibleResults.length > 0 && (
            <div
              onMouseEnter={cancelSearchClose}
              onMouseLeave={scheduleSearchClose}
              className={`absolute top-full left-0 right-0 mt-2 bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 ${isSearchClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
            >
                <div className="py-1.5">
                  {visibleResults.map((track, idx) => (
                    <button
                      key={`${track.videoId}-${idx}`}
                      onMouseDown={(e) => { e.preventDefault(); commitResult(track); }}
                      onMouseEnter={() => setActiveResultIdx(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                        idx === activeResultIdx ? 'bg-white/8 text-white' : 'hover:bg-white/5 text-white/80'
                      }`}
                    >
                      <img
                        src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover shrink-0 bg-white/5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{track.title}</p>
                        <p className="text-[11px] text-white/40 truncate">{cleanArtistName(track.artist)}</p>
                      </div>
                      {track.downloaded && (
                        <span className="shrink-0 text-[10px] font-bold text-[#00F2FE]/70 bg-[#00F2FE]/10 px-2 py-0.5 rounded-full">Downloaded</span>
                      )}
                    </button>
                  ))}
                  {localInput.trim() && (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); onCommitSearch?.(localInput); setSearchDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 border-t border-white/5 mt-1 text-white/60 hover:text-white transition-colors"
                    >
                      <Search className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs">Search all results for <strong className="text-white">&ldquo;{localInput}&rdquo;</strong></span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Name / Artist toggle */}
          <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1 text-[11px] font-semibold shrink-0">
            <button
              onClick={() => onSearchModeChange?.('name')}
              className={`px-3 py-1.5 rounded-xl transition-all duration-300 hover:shadow-[0_0_16px_rgba(0,242,254,0.22)] ${searchMode === 'name' ? 'bg-[#00F2FE] text-black shadow-lg' : 'text-white hover:text-[#00F2FE]'}`}
            >
              Name
            </button>
            <button
              onClick={() => onSearchModeChange?.('artist')}
              className={`px-3 py-1.5 rounded-xl transition-all duration-300 hover:shadow-[0_0_16px_rgba(0,242,254,0.22)] ${searchMode === 'artist' ? 'bg-[#00F2FE] text-black shadow-lg' : 'text-white hover:text-[#00F2FE]'}`}
            >
              Artist
            </button>
          </div>
        </div>
      </div>

      {/* Right section: Download Center + Account */}
      <div className="flex items-center gap-3 relative shrink-0">
        {/* Download Center Button & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => {
              cancelPopoverClose();
              setIsDownloadOpen((prev) => !prev);
            }}
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all duration-500 ease-out border ${isDownloadOpen
                ? 'bg-[#00F2FE]/14 text-white border-[#00F2FE]/45 shadow-[0_0_0_1px_rgba(255,255,255,0.24),0_0_16px_rgba(0,242,254,0.22),0_10px_26px_rgba(110,72,180,0.22)]'
                : 'bg-white/5 text-white border-transparent hover:bg-[#00F2FE]/10 hover:text-[#00F2FE] hover:border-[#00F2FE]/30 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_0_14px_rgba(0,242,254,0.16),0_10px_26px_rgba(110,72,180,0.18)]'
              }`}
            title="Download Center"
          >
            <div className="relative shrink-0 flex items-center justify-center">
              <Download className="w-4 h-4 text-[#00F2FE]" />
              {activeDownloadCount > 0 && (
                <div className="absolute -top-1 -right-1.5 w-3.5 h-3.5 rounded-md bg-[#00F2FE] flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white leading-none">
                    {activeDownloadCount}
                  </span>
                </div>
              )}
            </div>
            <span className="hidden sm:inline">Downloads</span>
            {activeDownloadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-lg bg-[#00F2FE]/20 text-[#00F2FE] text-[10px] font-bold">
                {activeDownloadCount} active
              </span>
            )}
          </button>

          {/* Download Center Dropdown */}
          {isDownloadOpen && (
            <div
              onMouseEnter={cancelPopoverClose}
              onMouseLeave={() => schedulePopoverClose('download')}
              className={`absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-[#181818] border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-50 ${isDownloadClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
            >
              {/* Dropdown Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-[#00F2FE]/10 flex items-center justify-center">
                    <Download className="w-3.5 h-3.5 text-[#00F2FE]" />
                  </div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Download Center</h3>
                </div>
                <button
                  onClick={() => setIsDownloadOpen(false)}
                  className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dropdown Body */}
              <div className="p-4 max-h-[26rem] overflow-y-auto scrollbar-thin space-y-3">
                {downloadJobs.length === 0 && (
                  <div className="py-8 text-center">
                    <Download className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    <p className="text-xs text-white font-medium">No downloads yet</p>
                    <p className="text-[11px] text-white mt-0.5">
                      Open a playlist and click "Download All"
                    </p>
                  </div>
                )}

                {activeJobs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white font-bold uppercase tracking-wider mb-2 px-1">
                      Active ({activeJobs.length})
                    </p>
                    <div className="space-y-2">
                      {activeJobs.map((job) => (
                        <DropdownJobRow
                          key={job.playlistId}
                          job={job}
                          onSelect={() => {
                            setIsDownloadOpen(false);
                            onOpenPlaylist(job.playlistId);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {finishedJobs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white font-bold uppercase tracking-wider mb-2 px-1 mt-3">
                      Completed ({finishedJobs.length})
                    </p>
                    <div className="space-y-2">
                      {finishedJobs.map((job) => (
                        <DropdownJobRow
                          key={job.playlistId}
                          job={job}
                          onSelect={() => {
                            setIsDownloadOpen(false);
                            onOpenPlaylist(job.playlistId);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Account Menu Button */}
        <div className="relative" ref={accountMenuRef}>
          <button
            onClick={() => {
              cancelPopoverClose();
              setIsAccountMenuOpen((prev) => !prev);
            }}
            className={`flex items-center gap-2.5 p-1.5 pl-2 pr-3 rounded-2xl border transition-all duration-500 ease-out cursor-pointer ${isAccountMenuOpen
              ? 'bg-[#00F2FE]/14 border-[#00F2FE]/45 shadow-[0_0_0_1px_rgba(255,255,255,0.24),0_0_16px_rgba(0,242,254,0.22),0_10px_26px_rgba(110,72,180,0.22)]'
              : 'bg-white/5 border-transparent hover:bg-[#00F2FE]/10 hover:border-[#00F2FE]/30 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_0_14px_rgba(0,242,254,0.16),0_10px_26px_rgba(110,72,180,0.18)]'
            }`}
          >
            {(cachedProfilePicture || user.picture || user.image) ? (
              <img
                src={cachedProfilePicture || user.picture || user.image}
                alt={user.name}
                className="w-7 h-7 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-xl bg-[#00F2FE]/20 flex items-center justify-center shrink-0">
                <span className="text-xs text-[#00F2FE] font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-xs font-semibold text-white/90 truncate max-w-[120px]">
              {user.name}
            </span>
          </button>

          {/* Account Dropdown */}
          {isAccountMenuOpen && (
            <div
              onMouseEnter={cancelPopoverClose}
              onMouseLeave={() => schedulePopoverClose('account')}
              className={`absolute right-0 top-full mt-2 w-56 bg-[#181818] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 p-2 space-y-1 ${isAccountMenuClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
            >
              <div className="px-3 py-2 border-b border-white/5 mb-1">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <p className="text-[11px] text-white/40 truncate">{user.email}</p>
              </div>

              <button
                type="button"
                onClick={onToggleOfflineMode}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-all duration-300 w-full font-semibold ${isOfflineMode ? 'bg-amber-500/15 text-amber-300' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                title={isHardwareOffline ? 'Connection unavailable — click to retry' : 'Toggle online/offline mode'}
              >
                <span className="flex items-center gap-2">
                  {isOfflineMode ? <WifiOff className="w-4 h-4 text-amber-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
                  {isOfflineMode ? 'Offline mode' : 'Online mode'}
                </span>
                <span className="text-[10px] text-white/35">{isHardwareOffline ? 'Unavailable' : 'Toggle'}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (window.electron?.auth) {
                    await window.electron.auth.logout();
                    try { window.localStorage.removeItem('music_profile_photo'); } catch { /* ignore */ }
                    try { await caches.delete('music-profile-v1'); } catch { /* ignore */ }
                    window.location.reload();
                  } else {
                    try { window.localStorage.removeItem('music_profile_photo'); } catch { /* ignore */ }
                    window.location.href = '/api/auth/logout';
                  }
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#00F2FE]/10 hover:text-[#00F2FE] transition-all duration-300 w-full font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DropdownJobRow({ job, onSelect }: { job: DownloadJob; onSelect: () => void }) {
  const pct = job.toDownload > 0 ? Math.round((job.done / job.toDownload) * 100) : 0;

  return (
    <div
      className="p-3 rounded-2xl bg-white/5 hover:bg-[#1A1A1A] border border-white/5 transition-all cursor-default hover:shadow-[0_0_20px_rgba(0,242,254,0.14)]"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{job.playlistTitle}</p>
          {job.status === 'running' && job.currentTitle && (
            <p className="text-[11px] text-white/40 truncate">
              {job.currentTitle}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {(job.status === 'running' || job.status === 'starting') && (
            <Loader2 className="w-3.5 h-3.5 text-[#00F2FE] animate-spin" />
          )}
          {job.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-[#00F2FE]" />}
          {job.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
        </div>
      </div>

      {job.toDownload > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-white/10 rounded-xl overflow-hidden">
            <div
              className="h-full bg-[#00F2FE] rounded-xl transition-all duration-300"
              style={{ width: `${job.status === 'done' ? 100 : pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/30 font-medium">
            <span>{job.done} / {job.toDownload} tracks</span>
            <span>{job.status === 'done' ? '100%' : `${pct}%`}</span>
          </div>
        </div>
      )}
    </div>
  );
}
