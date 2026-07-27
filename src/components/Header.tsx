import React, { useState } from 'react';
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
  const [isListening, setIsListening] = useState<boolean>(false);

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

  const handleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        onSearchSubmit(transcript);
      };
      recognition.start();
    } else {
      const voiceInput = prompt('Voice Search (Simulated): Enter your search query');
      if (voiceInput) {
        setQuery(voiceInput);
        onSearchSubmit(voiceInput);
      }
    }
  };

  return (
    <header className="sticky top-0 right-0 w-full z-40 bg-[#131313]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 h-16 shrink-0">
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        {/* Navigation History Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.history.back()}
            title="Go Back"
            className="w-8 h-8 rounded-full bg-[#201f1f] border border-white/5 flex items-center justify-center text-[#ebbbb4] hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <button
            onClick={() => window.history.forward()}
            title="Go Forward"
            className="w-8 h-8 rounded-full bg-[#201f1f] border border-white/5 flex items-center justify-center text-[#ebbbb4] hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>

        {/* Search & URL Input Bar */}
        <div className="relative flex-1 group">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ebbbb4]/50 group-focus-within:text-[#ff5540] transition-colors text-[20px]">
            {isProcessingLink ? 'sync' : isYouTubeUrl(query) ? 'link' : 'search'}
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search music, artists, albums, or paste YouTube link..."
            className="w-full bg-[#252525] border border-white/5 rounded-full py-2 pl-11 pr-20 text-sm focus:ring-2 focus:ring-[#ff5540] transition-all outline-none text-[#e5e2e1] placeholder:text-[#ebbbb4]/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-3">
        {/* Voice Search Button */}
        <button
          onClick={handleVoiceSearch}
          title="Voice Search"
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
            isListening ? 'bg-[#ff5540] text-white animate-pulse' : 'text-[#ebbbb4] hover:bg-[#353534]/50'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">mic</span>
        </button>

        {/* Add Track Quick Modal Button */}
        <button
          onClick={onOpenAddModal}
          title="Add Song Link"
          className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-[#252525] hover:bg-[#353534] border border-white/10 rounded-full text-xs font-semibold text-[#ffb4a8] transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-[#ff5540]">add</span>
          <span>Add Song</span>
        </button>

        {/* User Account Menu Button */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            title="User Account"
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#ebbbb4] hover:bg-[#353534]/50 transition-colors cursor-pointer border border-white/5 overflow-hidden"
          >
            {user?.image ? (
              <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[24px]">account_circle</span>
            )}
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-3 w-64 bg-[#201f1f] border border-white/10 rounded-2xl shadow-2xl p-4 text-xs z-50 animate-in fade-in zoom-in-95">
              <div className="pb-3 border-b border-white/10 flex items-center gap-3">
                <img
                  src={
                    user?.image ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
                  }
                  alt={user?.name}
                  className="w-10 h-10 rounded-full object-cover border border-white/10"
                />
                <div className="min-w-0">
                  <div className="font-bold text-[#e5e2e1] text-sm truncate">{user?.name || 'Alex Rivera'}</div>
                  <div className="text-white/40 font-mono text-[11px] truncate mt-0.5">{authorizedEmail}</div>
                </div>
              </div>

              <div className="pt-3 space-y-1">
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[11px] font-semibold">
                  <span>Status: Authorized</span>
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                </div>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-[#ffb4ab] hover:bg-[#93000a]/20 rounded-xl transition-colors cursor-pointer mt-2"
                >
                  <span className="font-semibold">Sign Out</span>
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

