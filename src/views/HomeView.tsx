import React from 'react';
import { Play, Heart, Plus, Music, Sparkles, Clock, Flame, Disc } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';

interface HomeViewProps {
  onOpenAddModal: () => void;
  onSelectPlaylist: (playlistId: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onOpenAddModal, onSelectPlaylist }) => {
  const { library, playTrack, toggleLikeTrack } = usePlayer();

  const allTracks: Track[] = library?.tracks ? (Object.values(library.tracks) as Track[]) : [];
  const likedTracks = allTracks.filter((t) => library?.likedTrackIds.includes(t.id));

  // Get recently played track objects
  const recentlyPlayedTracks: Track[] = (library?.recentlyPlayedIds || [])
    .map((id) => library?.tracks[id])
    .filter((t): t is Track => t !== undefined);

  return (
    <div className="p-6 md:p-8 space-y-10 max-w-7xl mx-auto custom-scrollbar">
      {/* Welcome Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-red-950/60 via-[#1e1012] to-[#121212] border border-red-500/20 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-3 max-w-xl z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 text-red-400 text-xs font-semibold border border-red-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>YouTube Music Personal Instance</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Welcome back, Prahas!
          </h1>
          <p className="text-sm text-neutral-300 leading-relaxed">
            Your personal music hub powered by <code className="text-red-400 bg-black/40 px-1.5 py-0.5 rounded font-mono">yt-dlp</code> and local JSON storage. Unlimited audio streaming without limits.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={() => {
                if (allTracks.length > 0) playTrack(allTracks[0], allTracks);
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-red-600/30 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Listen Now</span>
            </button>
            <button
              onClick={onOpenAddModal}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-semibold text-sm border border-white/10 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Import Song</span>
            </button>
          </div>
        </div>

        {/* Hero Decorative Card */}
        <div className="relative w-48 h-48 rounded-2xl overflow-hidden shadow-2xl border border-white/10 shrink-0 hidden md:block">
          {allTracks[0] ? (
            <img src={allTracks[0].thumbnailUrl} alt="Hero" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#222] flex items-center justify-center">
              <Disc className="w-12 h-12 text-neutral-600 animate-spin" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4">
            <span className="text-xs font-bold text-white truncate">
              {allTracks[0]?.title || 'YouTube Music'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Picks Carousel */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-500" />
            <h2 className="text-xl font-bold text-white tracking-tight">Quick Picks</h2>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {allTracks.slice(0, 10).map((track) => (
            <div
              key={track.id}
              onClick={() => playTrack(track, allTracks)}
              className="bg-[#181818] hover:bg-[#222] border border-white/5 hover:border-white/20 rounded-2xl p-3.5 transition-all group cursor-pointer flex flex-col justify-between"
            >
              <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-[#242424]">
                <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-white truncate group-hover:text-red-400 transition-colors">
                  {track.title}
                </h3>
                <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Playlists & Collections Grid */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight">Your Playlists</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Liked Songs Card */}
          <div
            onClick={() => onSelectPlaylist('liked')}
            className="bg-gradient-to-br from-red-900/40 to-neutral-900 border border-red-500/20 hover:border-red-500/40 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all group"
          >
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition-transform">
              <Heart className="w-8 h-8 text-white fill-white" />
            </div>
            <div className="overflow-hidden">
              <h3 className="font-bold text-white text-base truncate">Liked Songs</h3>
              <p className="text-xs text-neutral-400 mt-1">{likedTracks.length} tracks saved</p>
            </div>
          </div>

          {/* Custom Playlists */}
          {library?.playlists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => onSelectPlaylist(playlist.id)}
              className="bg-[#181818] hover:bg-[#222] border border-white/5 hover:border-white/20 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all group"
            >
              <div className="w-16 h-16 rounded-xl bg-[#2a2a2a] overflow-hidden shrink-0 border border-white/10 group-hover:scale-105 transition-transform flex items-center justify-center">
                {playlist.coverUrl ? (
                  <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover" />
                ) : (
                  <Disc className="w-8 h-8 text-neutral-500" />
                )}
              </div>
              <div className="overflow-hidden">
                <h3 className="font-bold text-white text-base truncate">{playlist.name}</h3>
                <p className="text-xs text-neutral-400 mt-1">{playlist.trackIds.length} tracks</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently Played */}
      {recentlyPlayedTracks.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-neutral-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Recently Played</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recentlyPlayedTracks.map((track) => (
              <div
                key={`recent-${track.id}`}
                onClick={() => playTrack(track)}
                className="bg-[#141414] hover:bg-[#1f1f1f] border border-white/5 rounded-xl p-3 cursor-pointer group transition-all"
              >
                <div className="relative aspect-square rounded-lg overflow-hidden mb-2">
                  <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-5 h-5 fill-white text-white" />
                  </div>
                </div>
                <div className="text-xs font-semibold text-white truncate">{track.title}</div>
                <div className="text-[10px] text-neutral-400 truncate mt-0.5">{track.artist}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
