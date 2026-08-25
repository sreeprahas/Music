'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { DownloadJob, UserProfile, Track } from '@/types';
import { Download, Radio, CheckCircle, AlertCircle, Loader2, X, Search, ChevronLeft, ChevronRight, Wifi, WifiOff, Home, Settings, ChevronDown, Layers3, FolderOpen } from 'lucide-react';
import { cleanArtistName, getThumbnailUrl, getTrackThumbnailUrl } from '@/lib/ytmusicFormat';

interface HeaderProps {
  user: UserProfile;
  activeDownloadCount: number;
  downloadJobs: DownloadJob[];
  onOpenPlaylist: (playlistId: string) => void;
  onHomeClick?: () => void;
  onOpenSettings?: () => void;
  onCancelDownload?: (playlistId: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onCommitSearch?: (query: string) => void;
  searchResults?: Track[];
  onResultClick?: (track: Track) => void;
  searchMode?: 'auto' | 'spotify' | 'ytmusic' | 'local';
  onSearchModeChange?: (mode: 'auto' | 'spotify' | 'ytmusic' | 'local') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isHidden?: boolean;
}

export function Header({
  user,
  activeDownloadCount,
  downloadJobs,
  onOpenPlaylist,
  onHomeClick,
  onOpenSettings,
  onCancelDownload,
  searchQuery = '',
  onSearchChange,
  onCommitSearch,
  searchResults = [],
  onResultClick,
  searchMode = 'auto',
  onSearchModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isHidden = false,
}: HeaderProps) {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isDownloadClosing, setIsDownloadClosing] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isAccountMenuClosing, setIsAccountMenuClosing] = useState(false);
  const [localInput, setLocalInput] = useState(searchQuery);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [isSearchClosing, setIsSearchClosing] = useState(false);
  const [searchModeOpen, setSearchModeOpen] = useState(false);
  const [isSearchModeClosing, setIsSearchModeClosing] = useState(false);
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
  const searchModeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (searchModeCloseTimeoutRef.current) clearTimeout(searchModeCloseTimeoutRef.current);
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

  const closeSearchModeMenu = () => {
    if (!searchModeOpen) return;
    setIsSearchModeClosing(true);
    if (searchModeCloseTimeoutRef.current) clearTimeout(searchModeCloseTimeoutRef.current);
    searchModeCloseTimeoutRef.current = setTimeout(() => {
      setSearchModeOpen(false);
      setIsSearchModeClosing(false);
      searchModeCloseTimeoutRef.current = null;
    }, 160);
  };

  const cancelSearchModeClose = () => {
    if (searchModeCloseTimeoutRef.current) clearTimeout(searchModeCloseTimeoutRef.current);
    searchModeCloseTimeoutRef.current = null;
    setIsSearchModeClosing(false);
  };

  useEffect(() => {
    setLocalInput(searchQuery);
  }, [searchQuery]);

  // Keep the account avatar available for the cached/offline app shell.
  useEffect(() => {
    const picture = user.picture || user.image || '';
    if (!picture) {
      setCachedProfilePicture('');
      try { window.localStorage.removeItem('music_profile_photo'); } catch { /* quota/storage disabled */ }
      return;
    }
    if (picture.startsWith('data:image/')) {
      setCachedProfilePicture(picture);
      try { window.localStorage.setItem('music_profile_photo', picture); } catch { /* quota/storage disabled */ }
      return;
    }
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
        setSearchModeOpen(false);
        setIsSearchModeClosing(false);
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
    <header className="music-header w-full h-[72px] bg-background-secondary border-b border-border-subtle pl-6 pr-40 flex items-center justify-between select-none shrink-0 z-30 relative">
      {/* Left branding */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-2 cursor-pointer group"
          title="Music"
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg shadow-md group-hover:scale-105 group-hover:shadow-accent-card transition-all duration-500 ease-out">
            <span aria-hidden="true" className="music-logo-mark block h-8 w-8" />
          </div>
          <span className="text-text font-black text-lg tracking-tight group-hover:text-accent transition-colors">
            Music
          </span>
        </button>
        <div className="flex items-center gap-0 ml-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Back"
            className="p-1 text-text hover:text-accent disabled:text-text-disabled disabled:hover:bg-transparent disabled:hover:shadow-none transition-all duration-300"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Forward"
            className="p-1 text-text hover:text-accent disabled:text-text-disabled disabled:hover:bg-transparent disabled:hover:shadow-none transition-all duration-300"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Center: Home + Search */}
      <div className="flex-1 max-w-2xl mx-6 hidden md:flex items-center gap-2">
        {/* Home button — left of the search bar */}
        <button
          onClick={onHomeClick}
          title="Home"
          className="shrink-0 p-2.5 rounded-full bg-surface border border-transparent text-text hover:text-accent hover:bg-accent/10 hover:border-accent/30 hover:shadow-accent-card transition-all duration-500 ease-out"
        >
          <Home className="w-4 h-4" />
        </button>

        {/* Search bar + dropdown */}
        <div ref={searchContainerRef} onMouseEnter={cancelSearchClose} className="flex-1 flex items-center gap-2 relative">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
              className="w-full bg-surface border border-transparent rounded-full pl-10 pr-9 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:outline-none hover:border-accent/30 hover:bg-accent/10 hover:shadow-accent-soft focus:border-accent/45 focus:bg-accent/14 focus:shadow-accent-medium caret-accent transition-[background-color,box-shadow] duration-500 ease-out"
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
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-0.5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Live search dropdown */}
            {searchDropdownOpen && visibleResults.length > 0 && (
            <div
              onMouseEnter={cancelSearchClose}
              onMouseLeave={scheduleSearchClose}
              className={`absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-50 ${isSearchClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
            >
                <div className="py-1.5">
                  {visibleResults.map((track, idx) => (
                    <button
                      key={`${track.videoId}-${idx}`}
                      onMouseDown={(e) => { e.preventDefault(); commitResult(track); }}
                      onMouseEnter={() => setActiveResultIdx(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                        idx === activeResultIdx ? 'bg-surface-hover text-text' : 'hover:bg-surface text-text-secondary'
                      }`}
                    >
                      <img
                        src={getTrackThumbnailUrl(track)}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover shrink-0 bg-surface"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{track.title}</p>
                        <p className="text-[11px] text-text-muted truncate">{cleanArtistName(track.artist)}</p>
                      </div>
                      {track.downloaded && (
                        <span className="shrink-0 text-[10px] font-bold text-accent/70 bg-accent/10 px-2 py-0.5 rounded-full">Downloaded</span>
                      )}
                    </button>
                  ))}
                  {localInput.trim() && (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); onCommitSearch?.(localInput); setSearchDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface border-t border-border-subtle mt-1 text-text-secondary hover:text-text transition-colors"
                    >
                      <Search className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs">Search all results for <strong className="text-text">&ldquo;{localInput}&rdquo;</strong></span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Search source dropdown */}
          <div className="relative w-[104px] flex-none">
            <button
              type="button"
              onClick={() => {
                if (searchModeOpen) closeSearchModeMenu();
                else { cancelSearchModeClose(); setSearchModeOpen(true); }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-[11px] font-semibold text-text transition-all duration-300 hover:border-accent/30 hover:bg-accent/10 hover:text-accent"
              aria-expanded={searchModeOpen}
              aria-haspopup="menu"
            >
              {searchMode === 'ytmusic' ? <img src="/youtube-mark.svg" alt="" className="h-4 w-4 object-contain" /> : searchMode === 'spotify' ? <img src="/spotify-logo.png" alt="" className="h-4 w-4 rounded-full object-cover" /> : searchMode === 'local' ? <FolderOpen className="h-3.5 w-3.5 text-accent" /> : <Layers3 className="h-3.5 w-3.5 text-accent" />}
              <span>{searchMode === 'ytmusic' ? 'YTMusic' : searchMode === 'spotify' ? 'Spotify' : searchMode === 'local' ? 'Local' : 'Auto'}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${searchModeOpen ? 'rotate-180' : ''}`} />
            </button>
            {searchModeOpen && (
              <div onMouseEnter={cancelSearchModeClose} onMouseLeave={closeSearchModeMenu} className={`absolute left-0 top-full mt-2 z-50 w-36 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-2xl ${isSearchModeClosing ? 'animate-popover-out' : 'animate-fadeIn'}`} role="menu">
                {([
                  ['auto', 'Auto', Layers3],
                  ['ytmusic', 'YTMusic', '/youtube-mark.svg'],
                  ['spotify', 'Spotify', '/spotify-logo.png'],
                  ['local', 'Local', FolderOpen],
                ] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => { onSearchModeChange?.(id); closeSearchModeMenu(); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${searchMode === id ? 'bg-accent/15 text-accent' : 'text-text hover:bg-surface-hover'}`}
                  >
                    {typeof Icon === 'string' ? <img src={Icon} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" /> : <Icon className={`h-3.5 w-3.5 shrink-0 ${searchMode === id ? 'text-accent' : 'text-text-muted'}`} />}
                    <span className="text-xs font-bold">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right section: Download Center + Account */}
      <div className="flex items-center gap-2.5 relative shrink-0">
        {/* Download Center Button & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => {
              cancelPopoverClose();
              setIsDownloadOpen((prev) => !prev);
            }}
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all duration-500 ease-out border ${isDownloadOpen
                ? 'bg-accent/14 text-text border-accent/45 shadow-accent-card-strong'
                : 'bg-surface text-text border-transparent hover:bg-accent/10 hover:text-accent hover:border-accent/30 hover:shadow-accent-card'
              }`}
            title="Download Center"
          >
            <div className="relative shrink-0 flex items-center justify-center">
              <Download className="w-4 h-4 text-accent" />
              {activeDownloadCount > 0 && (
                <div className="absolute -top-1 -right-1.5 w-3.5 h-3.5 rounded-md bg-accent flex items-center justify-center">
                  <span className="text-[8px] font-bold text-text leading-none">
                    {activeDownloadCount}
                  </span>
                </div>
              )}
            </div>
            <span className="hidden sm:inline">Downloads</span>
            {activeDownloadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-lg bg-accent/20 text-accent text-[10px] font-bold">
                {activeDownloadCount} active
              </span>
            )}
          </button>

          {/* Download Center Dropdown */}
          {isDownloadOpen && (
            <div
              onMouseEnter={cancelPopoverClose}
              onMouseLeave={() => schedulePopoverClose('download')}
              className={`absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden z-50 ${isDownloadClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
            >
              {/* Dropdown Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle bg-overlay/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Download className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <h3 className="text-sm font-bold text-text tracking-tight">Download Center</h3>
                </div>
                <button
                  onClick={() => setIsDownloadOpen(false)}
                  className="p-1.5 rounded-xl text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dropdown Body */}
              <div className="p-4 max-h-[26rem] overflow-y-auto scrollbar-thin space-y-3">
                {downloadJobs.length === 0 && (
                  <div className="py-8 text-center">
                    <Download className="w-8 h-8 text-text-disabled mx-auto mb-2" />
                    <p className="text-xs text-text font-medium">No downloads yet</p>
                    <p className="text-[11px] text-text mt-0.5">
                      Open a playlist and click "Download All"
                    </p>
                  </div>
                )}

                {activeJobs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-text font-bold uppercase tracking-wider mb-2 px-1">
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
                          onCancel={onCancelDownload}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {finishedJobs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-text font-bold uppercase tracking-wider mb-2 px-1 mt-3">
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
                          onCancel={onCancelDownload}
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
              ? 'bg-accent/14 border-accent/45 shadow-accent-card-strong'
              : 'bg-surface border-transparent hover:bg-accent/10 hover:border-accent/30 hover:shadow-accent-card'
            }`}
          >
            {(cachedProfilePicture || user.picture || user.image) ? (
              <img
                src={cachedProfilePicture || user.picture || user.image}
                alt={user.name}
                className="w-7 h-7 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                <span className="text-xs text-accent font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-xs font-semibold text-text truncate max-w-[120px]">
              {user.name}
            </span>
          </button>

          {/* Account Dropdown */}
          {isAccountMenuOpen && (
            <div
              onMouseEnter={cancelPopoverClose}
              onMouseLeave={() => schedulePopoverClose('account')}
              className={`absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-50 p-2 space-y-1 ${isAccountMenuClosing ? 'animate-popover-out' : 'animate-fadeIn'}`}
            >
              <div className="px-3 py-2 border-b border-border-subtle mb-1">
                <p className="text-xs font-bold text-text truncate">{user.name}</p>
                <p className="text-[11px] text-text-muted truncate">{user.email || 'User'}</p>
              </div>

              <button
                type="button"
                onClick={() => { setIsAccountMenuOpen(false); onOpenSettings?.(); }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-text hover:bg-accent/10 hover:text-accent transition-all duration-300 w-full font-semibold"
              >
                <Settings className="w-4 h-4" />
                Settings & connections
              </button>

            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DropdownJobRow({ job, onSelect, onCancel }: { job: DownloadJob; onSelect: () => void; onCancel?: (playlistId: string) => void }) {
  const pct = job.toDownload > 0 ? Math.round((job.done / job.toDownload) * 100) : 0;

  return (
    <div
      className="p-3 rounded-2xl bg-surface hover:bg-surface-hover border border-border-subtle transition-all cursor-default hover:shadow-accent-soft"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-text truncate">{job.playlistTitle}</p>
          {job.status === 'running' && job.currentTitle && (
            <p className="text-[11px] text-text-muted truncate">
              {job.currentTitle}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {(job.status === 'running' || job.status === 'starting') && (
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
          )}
          {job.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-accent" />}
          {job.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-error" />}
        </div>
      </div>

      {job.toDownload > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-surface-hover rounded-xl overflow-hidden">
            <div
              className="h-full bg-accent rounded-xl transition-all duration-300"
              style={{ width: `${job.status === 'done' ? 100 : pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-disabled font-medium">
            <span>{job.done} / {job.toDownload} tracks</span>
            <span>{job.status === 'done' ? '100%' : `${pct}%`}</span>
          </div>
        </div>
      )}
      {(job.status === 'running' || job.status === 'starting') && onCancel && (
        <button type="button" onClick={() => onCancel(job.playlistId)} className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold text-text-secondary transition hover:border-error/40 hover:bg-error/10 hover:text-error">
          Cancel downloads
        </button>
      )}
    </div>
  );
}
