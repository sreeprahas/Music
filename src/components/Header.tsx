import React, { useState } from 'react';
import { Search, Link, User, LogOut, ShieldCheck, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

interface HeaderProps {
  onSearchSubmit: (query: string) => void;
  onOpenAddModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSearchSubmit, onOpenAddModal }) => {
  const { user, authorizedEmail, logout } = useAuth();
  const { addTrackByUrlOrSearch } = usePlayer();
  const [query, setQuery] = useState<string>('');
  const [isProcessingLink, setIsProcessingLink] = useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);

  const isYouTubeUrl = (text: string) => {
    return text.includes('youtube.com') || text.includes('youtu.be');
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;

      if (isYouTubeUrl(trimmed)) {
        try {
          setIsProcessingLink(true);
          await addTrackByUrlOrSearch(trimmed);
          setQuery('');
          alert('Track extracted via yt-dlp and saved to library!');
        } catch (err: any) {
          alert(`Failed to add track: ${err.message || 'Check link'}`);
        } finally {
          setIsProcessingLink(false);
        }
      } else {
        onSearchSubmit(trimmed);
      }
    }
  };

  return (
    <header className="h-16 border-b border-white/10 bg-[#0f0f0f]/90 backdrop-blur-md px-6 flex items-center justify-between gap-6 shrink-0 z-20 sticky top-0">
      {/* Search & URL Input Bar */}
      <div className="flex-1 max-w-2xl relative flex items-center">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
            {isProcessingLink ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
            ) : isYouTubeUrl(query) ? (
              <Link className="w-4 h-4 text-red-400" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search songs, artists, or paste any YouTube URL..."
            className="w-full h-10 bg-[#212121] hover:bg-[#2a2a2a] focus:bg-[#282828] border border-white/10 rounded-full pl-10 pr-24 text-sm text-white placeholder-neutral-400 focus:outline-none focus:border-red-500/80 transition-all"
          />
          {isYouTubeUrl(query) && (
            <button
              onClick={async () => {
                setIsProcessingLink(true);
                try {
                  await addTrackByUrlOrSearch(query.trim());
                  setQuery('');
                  alert('Track extracted via yt-dlp and saved to library!');
                } catch (e: any) {
                  alert(e.message || 'Error processing YouTube URL');
                } finally {
                  setIsProcessingLink(false);
                }
              }}
              disabled={isProcessingLink}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Import</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Right Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenAddModal}
          className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-[#212121] hover:bg-[#2a2a2a] border border-white/10 rounded-full text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
        >
          <Link className="w-3.5 h-3.5 text-red-400" />
          <span>Paste URL</span>
        </button>

        {/* User Profile Pill */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1.5 pl-3 bg-[#212121] hover:bg-[#2a2a2a] border border-white/10 rounded-full cursor-pointer transition-colors"
          >
            <div className="flex flex-col text-right hidden md:block">
              <span className="text-xs font-semibold text-white leading-tight">{user?.name || 'Owner'}</span>
              <span className="text-[10px] text-emerald-400 font-mono leading-tight">Authorized</span>
            </div>
            <img
              src={user?.image || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
              alt={user?.name || 'User'}
              className="w-7 h-7 rounded-full object-cover border border-white/20"
            />
          </button>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-[#1f1f1f] border border-white/10 rounded-2xl shadow-2xl p-4 text-xs z-50">
              <div className="pb-3 border-b border-white/10">
                <div className="font-semibold text-white text-sm">{user?.name || 'Owner'}</div>
                <div className="text-neutral-400 font-mono text-[11px] truncate mt-0.5">{authorizedEmail}</div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full text-[10px] font-semibold">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Single-User Granted</span>
                </div>
              </div>

              <div className="pt-3">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-red-400 hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                  <span className="font-medium">Sign Out Session</span>
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
