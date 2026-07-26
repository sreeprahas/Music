import React from 'react';
import { Play, Shuffle, Heart, Trash2, ArrowLeft, Disc, Music, Plus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';

interface PlaylistDetailViewProps {
  playlistId: string;
  onBack: () => void;
  onOpenAddModal: () => void;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlistId,
  onBack,
  onOpenAddModal,
}) => {
  const { library, playTrack, toggleLikeTrack, editPlaylist, deletePlaylistById } = usePlayer();

  const isLikedPlaylist = playlistId === 'liked';
  const customPlaylist = library?.playlists.find((p) => p.id === playlistId);

  let playlistName = 'Playlist';
  let playlistDesc = '';
  let playlistCover = '';
  let playlistTracks: Track[] = [];

  if (isLikedPlaylist) {
    playlistName = 'Liked Songs';
    playlistDesc = 'Your favorite collection of liked YouTube Music tracks.';
    playlistCover = 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=800&q=80';
    const allTracks: Track[] = library?.tracks ? (Object.values(library.tracks) as Track[]) : [];
    playlistTracks = allTracks.filter((t) => library?.likedTrackIds.includes(t.id));
  } else if (customPlaylist) {
    playlistName = customPlaylist.name;
    playlistDesc = customPlaylist.description || 'Custom personal playlist';
    playlistCover = customPlaylist.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80';
    playlistTracks = customPlaylist.trackIds
      .map((id) => library?.tracks[id])
      .filter((t): t is Track => t !== undefined);
  }

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      playTrack(playlistTracks[0], playlistTracks, 0);
    }
  };

  const handleRemoveFromPlaylist = async (trackId: string) => {
    if (customPlaylist) {
      const updatedIds = customPlaylist.trackIds.filter((id) => id !== trackId);
      await editPlaylist(customPlaylist.id, { trackIds: updatedIds });
    }
  };

  const handleDeletePlaylist = async () => {
    if (customPlaylist && confirm(`Delete playlist "${customPlaylist.name}"?`)) {
      await deletePlaylistById(customPlaylist.id);
      onBack();
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto custom-scrollbar">
      {/* Top Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#222] hover:bg-[#333] text-neutral-300 hover:text-white rounded-full text-xs font-semibold transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Navigation</span>
      </button>

      {/* Playlist Hero Section */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-6 pb-6 border-b border-white/10">
        <div className="w-48 h-48 rounded-2xl overflow-hidden shadow-2xl border border-white/10 shrink-0 bg-[#222]">
          {isLikedPlaylist ? (
            <div className="w-full h-full bg-gradient-to-br from-red-600 via-rose-700 to-neutral-900 flex items-center justify-center">
              <Heart className="w-20 h-20 text-white fill-white shadow-2xl" />
            </div>
          ) : (
            <img src={playlistCover} alt={playlistName} className="w-full h-full object-cover" />
          )}
        </div>

        <div className="flex-1 text-center md:text-left space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-red-400 font-mono">
            {isLikedPlaylist ? 'Auto-Collection' : 'Custom Playlist'}
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">{playlistName}</h1>
          <p className="text-sm text-neutral-400 max-w-xl">{playlistDesc}</p>
          <div className="text-xs text-neutral-500 font-mono">
            {playlistTracks.length} tracks • {isLikedPlaylist ? 'Liked items' : 'Local JSON persistence'}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
            <button
              onClick={handlePlayAll}
              disabled={playlistTracks.length === 0}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full text-sm flex items-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Play All</span>
            </button>

            {!isLikedPlaylist && (
              <button
                onClick={handleDeletePlaylist}
                className="px-4 py-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/30 rounded-full font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Playlist</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Playlist Tracks Table */}
      <div className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-3 border-b border-white/10 text-xs font-semibold uppercase text-neutral-500 font-mono grid grid-cols-12 gap-4">
          <span className="col-span-1">#</span>
          <span className="col-span-7 md:col-span-6">Title & Artist</span>
          <span className="col-span-2 text-right">Duration</span>
          <span className="col-span-2 text-right">Actions</span>
        </div>

        <div className="divide-y divide-white/5">
          {playlistTracks.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-sm">
              Playlist is empty. Add songs using search or paste a YouTube URL.
            </div>
          ) : (
            playlistTracks.map((track, idx) => (
              <div
                key={track.id}
                className="px-6 py-3.5 flex items-center hover:bg-white/5 transition-colors group grid grid-cols-12 gap-4"
              >
                <span className="col-span-1 text-xs text-neutral-500 font-mono flex items-center">
                  {idx + 1}
                </span>

                <div className="col-span-7 md:col-span-6 flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-[#222] overflow-hidden shrink-0 relative">
                    <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover" />
                    <button
                      onClick={() => playTrack(track, playlistTracks, idx)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white text-white" />
                    </button>
                  </div>

                  <div className="overflow-hidden">
                    <div
                      onClick={() => playTrack(track, playlistTracks, idx)}
                      className="font-semibold text-sm text-white truncate hover:text-red-400 cursor-pointer"
                    >
                      {track.title}
                    </div>
                    <div className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</div>
                  </div>
                </div>

                <span className="col-span-2 flex items-center justify-end text-xs font-mono text-neutral-400">
                  {track.durationFormatted || '3:30'}
                </span>

                <div className="col-span-2 flex items-center justify-end gap-2">
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

                  {!isLikedPlaylist && (
                    <button
                      onClick={() => handleRemoveFromPlaylist(track.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-full text-neutral-400 hover:text-red-400 transition-all cursor-pointer"
                      title="Remove from playlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
