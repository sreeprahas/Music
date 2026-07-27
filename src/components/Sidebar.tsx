import React from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string | null) => void;
  onOpenAddModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  selectedPlaylistId,
  setSelectedPlaylistId,
  onOpenAddModal,
}) => {
  const { library, createNewPlaylist } = usePlayer();
  const { user } = useAuth();

  const handleNavClick = (tab: string) => {
    setCurrentTab(tab);
    setSelectedPlaylistId(null);
  };

  const handlePlaylistClick = (playlistId: string) => {
    setCurrentTab('playlist');
    setSelectedPlaylistId(playlistId);
  };

  const handleCreatePlaylist = async () => {
    const name = prompt('Enter new playlist name:');
    if (name && name.trim()) {
      const newP = await createNewPlaylist(name.trim(), 'Personal custom playlist');
      if (newP) {
        handlePlaylistClick(newP.id);
      }
    }
  };

  const userName = user?.name || 'Alex Rivera';
  const userImage =
    user?.image ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

  return (
    <aside className="w-[240px] bg-[#1c1b1b] flex flex-col py-6 h-full select-none shrink-0 border-r border-white/5 z-50">
      {/* Brand Header */}
      <div className="px-6 mb-8 flex items-center justify-between">
        <div
          onClick={() => handleNavClick('home')}
          className="cursor-pointer group flex items-center gap-2"
        >
          <h1 className="font-extrabold text-[28px] text-[#ff5540] tracking-tighter group-hover:opacity-90 transition-opacity">
            Music
          </h1>
          <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 border border-white/10 px-1.5 py-0.5 rounded">
            PULSE
          </span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1">
        <button
          onClick={() => handleNavClick('home')}
          className={`w-full flex items-center gap-4 px-6 py-3 transition-colors text-left font-medium text-sm cursor-pointer ${
            currentTab === 'home' && !selectedPlaylistId
              ? 'text-[#e5e2e1] border-l-4 border-[#ff5540] font-bold bg-[#353534]/40'
              : 'text-[#ebbbb4]/70 hover:text-[#e5e2e1] hover:bg-[#353534]/20'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[24px] ${
              currentTab === 'home' && !selectedPlaylistId ? 'fill-1 text-[#ff5540]' : ''
            }`}
          >
            home
          </span>
          <span>Home</span>
        </button>

        <button
          onClick={() => handleNavClick('explore')}
          className={`w-full flex items-center gap-4 px-6 py-3 transition-colors text-left font-medium text-sm cursor-pointer ${
            currentTab === 'explore' || currentTab === 'search'
              ? 'text-[#e5e2e1] border-l-4 border-[#ff5540] font-bold bg-[#353534]/40'
              : 'text-[#ebbbb4]/70 hover:text-[#e5e2e1] hover:bg-[#353534]/20'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[24px] ${
              currentTab === 'explore' || currentTab === 'search' ? 'fill-1 text-[#ff5540]' : ''
            }`}
          >
            explore
          </span>
          <span>Explore</span>
        </button>

        <button
          onClick={() => handleNavClick('library')}
          className={`w-full flex items-center gap-4 px-6 py-3 transition-colors text-left font-medium text-sm cursor-pointer ${
            currentTab === 'library' && !selectedPlaylistId
              ? 'text-[#e5e2e1] border-l-4 border-[#ff5540] font-bold bg-[#353534]/40'
              : 'text-[#ebbbb4]/70 hover:text-[#e5e2e1] hover:bg-[#353534]/20'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[24px] ${
              currentTab === 'library' && !selectedPlaylistId ? 'fill-1 text-[#ff5540]' : ''
            }`}
          >
            library_music
          </span>
          <span>Library</span>
        </button>

        {/* Action Button: New Playlist / Add Song */}
        <div className="pt-4 px-6 space-y-2 border-t border-white/5 mt-4">
          <button
            onClick={handleCreatePlaylist}
            className="w-full flex items-center gap-3 py-2 px-3 text-[#ebbbb4]/80 hover:text-[#e5e2e1] hover:bg-[#353534]/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left"
          >
            <span className="material-symbols-outlined text-[20px] text-[#ff5540]">add_box</span>
            <span>New Playlist</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="w-full flex items-center gap-3 py-2 px-3 bg-[#ff5540]/10 hover:bg-[#ff5540]/20 border border-[#ff5540]/30 text-[#ffb4a8] rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Add Song Link</span>
          </button>
        </div>

        {/* Playlists Section */}
        <div className="pt-4 px-6 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
            My Playlists
          </div>

          <button
            onClick={() => handlePlaylistClick('liked')}
            className={`w-full flex items-center justify-between py-2 px-2.5 rounded-lg text-xs text-left cursor-pointer transition-colors ${
              selectedPlaylistId === 'liked'
                ? 'bg-[#ff5540]/15 text-[#ffb4a8] font-bold'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="material-symbols-outlined text-[18px] text-[#ff5540] fill-1">favorite</span>
              <span className="truncate">Liked Songs</span>
            </div>
            <span className="text-[10px] text-white/30">{library?.likedTrackIds.length || 0}</span>
          </button>

          {library?.playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => handlePlaylistClick(pl.id)}
              className={`w-full flex items-center justify-between py-2 px-2.5 rounded-lg text-xs text-left cursor-pointer transition-colors ${
                selectedPlaylistId === pl.id
                  ? 'bg-[#ff5540]/15 text-[#ffb4a8] font-bold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="truncate">{pl.name}</span>
              <span className="text-[10px] text-white/30">{pl.trackIds.length}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* User Profile Container */}
      <div className="px-4 mt-auto">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a]/60 border border-white/5">
          <img
            src={userImage}
            alt={userName}
            className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#e5e2e1] truncate">{userName}</p>
            <p className="text-[10px] font-semibold text-[#ff5540] uppercase tracking-wider">
              Pro Listener
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};

