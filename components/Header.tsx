'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { DownloadJob, UserProfile, Track } from '@/types';
import { Download, LogOut, CheckCircle, AlertCircle, Loader2, X, Search, Undo2, Redo2, Wifi, WifiOff, Home } from 'lucide-react';
import { cleanArtistName } from '@/lib/ytmusicApi';

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
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [localInput, setLocalInput] = useState(searchQuery);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [activeResultIdx, setActiveResultIdx] = useState(-1);
  const [cachedProfilePicture, setCachedProfilePicture] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem('music_profile_photo') || ''; } catch { return ''; }
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalInput(searchQuery);
  }, [searchQuery]);

  // Keep the account avatar available for the cached/offline app shell.
  useEffect(() => {
    const picture = user.picture || user.image || '';
    if (!picture) return;
    setCachedProfilePicture(picture);
    try { window.localStorage.setItem('music_profile_photo', picture); } catch { /* storage may be disabled */ }
    if ('caches' in window) {
      fetch(picture, { mode: 'cors' })
        .then((response) => {
          if (!response.ok) return;
          return caches.open('music-profile-v1').then((cache) => cache.put(picture, response.clone()));
        })
        .catch(() => { /* the remote avatar remains a valid fallback */ });
    }
  }, [user.picture, user.image]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDownloadOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
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
    <header className="music-header w-full h-[72px] bg-[#0A0A0A] border-b border-white/5 px-6 flex items-center justify-between select-none shrink-0 z-30 relative">
      {/* Left branding */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-3 cursor-pointer group"
          title="Music"
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-all duration-300 ease-out bg-[#0A0A0A] border border-white/10 group-hover:border-[#00F2FE]/30 group-hover:shadow-[0_0_18px_rgba(0,242,254,0.18)]">
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
          className="shrink-0 p-2.5 rounded-full bg-white/5 border border-white/10 text-white hover:text-[#00F2FE] hover:bg-[#1A1A1A] hover:border-[#00F2FE]/30 hover:shadow-[0_0_16px_rgba(0,242,254,0.18)] transition-all duration-300"
        >
          <Home className="w-4 h-4" />
        </button>

        {/* Search bar + dropdown */}
        <div ref={searchContainerRef} className="flex-1 flex items-center gap-2 relative">
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
              className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-9 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:outline-none focus:border-[#00F2FE]/50 focus:bg-white/8 caret-[#00F2FE] transition-all duration-300"
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
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
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

      {/* Right section: Download Center + Offline Toggle + Account */}
      <div className="flex items-center gap-3 relative shrink-0">
        {/* Offline Mode Toggle */}
        <button
          onClick={isHardwareOffline ? undefined : onToggleOfflineMode}
          disabled={isHardwareOffline}
          className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold transition-all duration-300 border ${isOfflineMode
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.2)]'
              : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
            } ${isHardwareOffline ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
          title={
            isHardwareOffline
              ? 'No physical internet connection detected (Locked in Offline Mode)'
              : isOfflineMode
                ? 'Offline Mode Active (Manual setting stored in browser)'
                : 'Online Mode Active (Click to switch to Offline Mode)'
          }
        >
          {isOfflineMode ? (
            <>
              <WifiOff className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Offline</span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Online</span>
            </>
          )}
        </button>

        {/* Download Center Button & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDownloadOpen((prev) => !prev)}
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all duration-500 ease-out border hover:shadow-[0_0_18px_rgba(0,242,254,0.15)] ${isDownloadOpen
                ? 'bg-white/10 text-white border-white/20'
                : 'bg-white/5 text-white hover:bg-[#1A1A1A] hover:text-[#00F2FE] border-white/10'
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
            <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-[#181818] border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-50 transition-all duration-700 ease-out">
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
            onClick={() => setIsAccountMenuOpen((prev) => !prev)}
            className="flex items-center gap-2.5 p-1.5 pl-2 pr-3 rounded-2xl bg-white/5 hover:bg-[#1A1A1A] border border-white/10 transition-all duration-500 ease-out cursor-pointer hover:shadow-[0_0_18px_rgba(0,242,254,0.15)]"
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
            <div className="absolute right-0 top-full mt-2 w-56 bg-[#181818] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 p-2 space-y-1 transition-all duration-700 ease-out">
              <div className="px-3 py-2 border-b border-white/5 mb-1">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <p className="text-[11px] text-white/40 truncate">{user.email}</p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (window.electron?.auth) {
                    await window.electron.auth.logout();
                    window.location.reload();
                  } else {
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
