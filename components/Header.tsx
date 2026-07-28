'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { DownloadJob, UserProfile } from '@/types';
import { Download, LogOut, CheckCircle, AlertCircle, Loader2, X, Search, Undo2, Redo2 } from 'lucide-react';

interface HeaderProps {
  user: UserProfile;
  activeDownloadCount: number;
  downloadJobs: DownloadJob[];
  onOpenPlaylist: (playlistId: string) => void;
  onHomeClick?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchMode?: 'name' | 'artist';
  onSearchModeChange?: (mode: 'name' | 'artist') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export function Header({
  user,
  activeDownloadCount,
  downloadJobs,
  onOpenPlaylist,
  onHomeClick,
  searchQuery = '',
  onSearchChange,
  searchMode = 'name',
  onSearchModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: HeaderProps) {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDownloadOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoClick = () => {
    if (onHomeClick) onHomeClick();
  };

  const activeJobs = downloadJobs.filter((j) => j.status === 'running' || j.status === 'starting');
  const finishedJobs = downloadJobs.filter((j) => j.status === 'done' || j.status === 'error');

  return (
    <header className="w-full h-16 bg-[#0A0A0A] border-b border-white/5 px-6 flex items-center justify-between select-none shrink-0 z-30 relative">
      {/* Left branding */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-3 cursor-pointer group"
          title="Home"
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

      {/* Center Search Bar */}
      <div className="flex-1 max-w-2xl mx-6 hidden md:flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-white absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search playlists, songs, artists..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-9 py-2 text-xs text-white placeholder-white outline-none focus:outline-none focus:border-[#00F2FE]/50 caret-[#00F2FE] transition-all duration-500 ease-out hover:shadow-[0_0_0_1px_rgba(0,242,254,0.18),0_0_18px_rgba(0,242,254,0.16)]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange?.('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-[#00F2FE] p-0.5 transition-colors duration-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1 text-[11px] font-semibold">
          <button
            onClick={() => onSearchModeChange?.('name')}
            className={`px-3 py-1.5 rounded-xl transition-all duration-300 hover:shadow-[0_0_16px_rgba(0,242,254,0.22)] ${
              searchMode === 'name' ? 'bg-[#00F2FE] text-black shadow-lg' : 'text-white hover:text-[#00F2FE]'
            }`}
          >
            Name
          </button>
          <button
            onClick={() => onSearchModeChange?.('artist')}
            className={`px-3 py-1.5 rounded-xl transition-all duration-300 hover:shadow-[0_0_16px_rgba(0,242,254,0.22)] ${
              searchMode === 'artist' ? 'bg-[#00F2FE] text-black shadow-lg' : 'text-white hover:text-[#00F2FE]'
            }`}
          >
            Artist
          </button>
        </div>
      </div>

      {/* Right section: Download Center + Account */}
      <div className="flex items-center gap-3 relative shrink-0">
        {/* Download Center Button & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDownloadOpen((prev) => !prev)}
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all duration-500 ease-out border hover:shadow-[0_0_18px_rgba(0,242,254,0.15)] ${
              isDownloadOpen
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
            {(user.picture || user.image) ? (
              <img
                src={user.picture || user.image}
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

              <a
                href="/api/auth/logout"
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#00F2FE]/10 hover:text-[#00F2FE] transition-all duration-300 w-full font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </a>
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
          {job.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-white" />}
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
