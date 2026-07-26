import React from 'react';
import { Play, Heart, Trash2, Plus, Music, Clock, Disc } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';

interface LibraryViewProps {
  onOpenAddModal: () => void;
  onSelectPlaylist: (playlistId: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onOpenAddModal, onSelectPlaylist }) => {
  const { library, playTrack, toggleLikeTrack, removeTrackFromLibrary } = usePlayer();

  const allTracks: Track[] = library?.tracks ? (Object.values(library.tracks) as Track[]) : [];

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Your Music Library</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {allTracks.length} tracks stored in <code className="text-red-400 font-mono">data/playlists.json</code>
          </p>
        </div>

        <button
          onClick={onOpenAddModal}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full font-semibold text-xs flex items-center gap-2 transition-all shadow-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add YouTube Link</span>
        </button>
      </div>

      {/* Playlists Quick Access */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onSelectPlaylist('liked')}
          className="bg-gradient-to-r from-red-900/30 to-neutral-900 border border-red-500/30 hover:border-red-500/50 rounded-2xl p-4 flex items-center gap-4 cursor-pointer group transition-all"
        >
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shrink-0 shadow-lg">
            <Heart className="w-7 h-7 text-white fill-white" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Liked Songs</h3>
            <p className="text-xs text-neutral-400 mt-0.5">{library?.likedTrackIds.length || 0} tracks</p>
          </div>
        </div>

        {library?.playlists.map((playlist) => (
          <div
            key={playlist.id}
            onClick={() => onSelectPlaylist(playlist.id)}
            className="bg-[#181818] hover:bg-[#222] border border-white/5 hover:border-white/20 rounded-2xl p-4 flex items-center gap-4 cursor-pointer group transition-all"
          >
            <div className="w-14 h-14 rounded-xl bg-[#2a2a2a] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
              {playlist.coverUrl ? (
                <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover" />
              ) : (
                <Disc className="w-6 h-6 text-neutral-500" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-white text-base">{playlist.name}</h3>
              <p className="text-xs text-neutral-400 mt-0.5">{playlist.trackIds.length} tracks</p>
            </div>
          </div>
        ))}
      </div>

      {/* All Tracks Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight">All Saved Songs</h2>

        <div className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-3 border-b border-white/10 text-xs font-semibold uppercase text-neutral-500 font-mono grid grid-cols-12 gap-4">
            <span className="col-span-1">#</span>
            <span className="col-span-6 md:col-span-5">Title & Artist</span>
            <span className="col-span-3 hidden md:block">Added Date</span>
            <span className="col-span-2 text-right">Duration</span>
            <span className="col-span-3 md:col-span-1 text-right">Actions</span>
          </div>

          <div className="divide-y divide-white/5">
            {allTracks.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 text-sm">
                No songs saved yet. Click "Add YouTube Link" to import your first track.
              </div>
            ) : (
              allTracks.map((track, idx) => (
                <div
                  key={track.id}
                  className="px-6 py-3.5 flex items-center hover:bg-white/5 transition-colors group grid grid-cols-12 gap-4"
                >
                  <span className="col-span-1 text-xs text-neutral-500 font-mono flex items-center">
                    {idx + 1}
                  </span>

                  <div className="col-span-6 md:col-span-5 flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-lg bg-[#222] overflow-hidden shrink-0 relative">
                      <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover" />
                      <button
                        onClick={() => playTrack(track, allTracks, idx)}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-white text-white" />
                      </button>
                    </div>

                    <div className="overflow-hidden">
                      <div
                        onClick={() => playTrack(track, allTracks, idx)}
                        className="font-semibold text-sm text-white truncate hover:text-red-400 cursor-pointer"
                      >
                        {track.title}
                      </div>
                      <div className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</div>
                    </div>
                  </div>

                  <span className="col-span-3 hidden md:flex items-center text-xs text-neutral-400">
                    {new Date(track.addedAt).toLocaleDateString()}
                  </span>

                  <span className="col-span-2 flex items-center justify-end text-xs font-mono text-neutral-400">
                    {track.durationFormatted || '3:30'}
                  </span>

                  <div className="col-span-3 md:col-span-1 flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleLikeTrack(track.id)}
                      className="p-1.5 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          library?.likedTrackIds.includes(track.id) ? 'text-red-500 fill-red-500' : ''
                        }`}
                      />
                    </button>

                    <button
                      onClick={() => removeTrackFromLibrary(track.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-full text-neutral-400 hover:text-red-400 transition-all cursor-pointer"
                      title="Delete from JSON storage"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
