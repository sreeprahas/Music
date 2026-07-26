import React from 'react';
import { Home, Compass, Library, Heart, Plus, Music, Radio, Disc } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

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

  return (
    <aside className="w-64 bg-[#030303] border-r border-white/10 flex flex-col h-full select-none shrink-0">
      {/* Top Brand Logo */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
          <div className="w-3 h-3 bg-white rounded-sm" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-lg tracking-tight text-white">YouTube</span>
          <span className="font-light text-lg tracking-tight text-neutral-300">Music</span>
        </div>
      </div>

      {/* Primary Navigation */}
      <div className="p-3 space-y-1">
        <button
          onClick={() => handleNavClick('home')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
            currentTab === 'home' && !selectedPlaylistId
              ? 'bg-white/10 text-white font-semibold'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Home className="w-5 h-5 text-red-500" />
          <span>Home</span>
        </button>

        <button
          onClick={() => handleNavClick('explore')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
            currentTab === 'explore'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span>Explore & Search</span>
        </button>

        <button
          onClick={() => handleNavClick('library')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
            currentTab === 'library' && !selectedPlaylistId
              ? 'bg-white/10 text-white font-semibold'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Library className="w-5 h-5" />
          <span>Library</span>
        </button>
      </div>

      {/* Quick Action Button */}
      <div className="px-3 py-2">
        <button
          onClick={onOpenAddModal}
          className="w-full py-2.5 px-4 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-400 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Song by YouTube Link</span>
        </button>
      </div>

      <div className="my-2 border-t border-white/5 mx-4" />

      {/* Playlists & Saved Section */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar">
        <div className="px-4 py-2 flex items-center justify-between text-xs font-semibold uppercase text-neutral-500 tracking-wider">
          <span>Playlists & Saved</span>
          <button
            onClick={handleCreatePlaylist}
            title="Create Playlist"
            className="p-1 hover:bg-white/10 rounded-md text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Liked Songs Special Item */}
        <button
          onClick={() => handlePlaylistClick('liked')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-all text-left cursor-pointer ${
            selectedPlaylistId === 'liked'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-neutral-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shrink-0 shadow-sm">
            <Heart className="w-4 h-4 text-white fill-white" />
          </div>
          <div className="overflow-hidden">
            <div className="truncate text-xs font-medium">Liked Songs</div>
            <div className="text-[10px] text-neutral-500 truncate">
              {library?.likedTrackIds.length || 0} tracks
            </div>
          </div>
        </button>

        {/* Custom Playlists List */}
        {library?.playlists.map((playlist) => {
          const isSelected = selectedPlaylistId === playlist.id;
          return (
            <button
              key={playlist.id}
              onClick={() => handlePlaylistClick(playlist.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-all text-left cursor-pointer ${
                isSelected
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-neutral-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#222] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                {playlist.coverUrl ? (
                  <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover" />
                ) : (
                  <Disc className="w-4 h-4 text-neutral-400" />
                )}
              </div>
              <div className="overflow-hidden">
                <div className="truncate text-xs font-medium">{playlist.name}</div>
                <div className="text-[10px] text-neutral-500 truncate">{playlist.trackIds.length} tracks</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-white/5 text-[11px] text-neutral-500 flex items-center justify-between">
        <span>yt-dlp Engine Active</span>
        <span className="font-mono text-[10px] text-emerald-500">JSON DB</span>
      </div>
    </aside>
  );
};
