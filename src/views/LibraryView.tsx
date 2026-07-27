import React from 'react';
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
    <div className="pt-6 pb-32 px-6 md:px-10 max-w-[1600px] mx-auto min-h-screen select-none">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-[#e5e2e1] tracking-tight">
            Your Music Library
          </h1>
          <p className="text-sm text-[#ebbbb4]/60 mt-1">
            {allTracks.length} tracks stored in <code className="text-[#ff5540] font-mono">data/playlists.json</code>
          </p>
        </div>

        <button
          onClick={onOpenAddModal}
          className="px-6 py-2.5 bg-[#ff5540] hover:bg-[#ff5540]/90 text-white rounded-full font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-[#ff5540]/20 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>Add Song Link</span>
        </button>
      </div>

      {/* Playlists Quick Access Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div
          onClick={() => onSelectPlaylist('liked')}
          className="bg-[#201f1f] hover:bg-[#353534]/50 border border-white/5 hover:border-white/10 rounded-2xl p-5 flex items-center gap-4 cursor-pointer group transition-all"
        >
          <div className="w-14 h-14 rounded-xl bg-[#ff5540]/20 border border-[#ff5540]/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[28px] text-[#ff5540] fill-1">favorite</span>
          </div>
          <div>
            <h3 className="font-bold text-[#e5e2e1] text-base">Liked Songs</h3>
            <p className="text-xs text-[#ebbbb4]/60 mt-0.5">{library?.likedTrackIds.length || 0} tracks</p>
          </div>
        </div>

        {library?.playlists.map((playlist) => (
          <div
            key={playlist.id}
            onClick={() => onSelectPlaylist(playlist.id)}
            className="bg-[#201f1f] hover:bg-[#353534]/50 border border-white/5 hover:border-white/10 rounded-2xl p-5 flex items-center gap-4 cursor-pointer group transition-all"
          >
            <div className="w-14 h-14 rounded-xl bg-[#252525] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
              {playlist.coverUrl ? (
                <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-[24px] text-[#ebbbb4]/40">album</span>
              )}
            </div>
            <div>
              <h3 className="font-bold text-[#e5e2e1] text-base">{playlist.name}</h3>
              <p className="text-xs text-[#ebbbb4]/60 mt-0.5">{playlist.trackIds.length} tracks</p>
            </div>
          </div>
        ))}
      </div>

      {/* All Saved Tracks Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-[#e5e2e1] tracking-tight">All Saved Songs</h2>

        <div className="px-2">
          <div className="grid grid-cols-[48px_minmax(250px,1fr)_minmax(140px,1fr)_minmax(120px,1fr)_80px] gap-4 px-4 py-2 border-b border-white/10 text-[#ebbbb4]/60 font-semibold text-[11px] uppercase tracking-wider mb-3">
            <div className="text-center">#</div>
            <div>Title</div>
            <div>Artist</div>
            <div>Added Date</div>
            <div className="text-right pr-4">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
            </div>
          </div>

          <div className="space-y-1">
            {allTracks.length === 0 ? (
              <div className="text-center py-16 text-[#ebbbb4]/40 text-xs bg-[#201f1f] rounded-2xl border border-white/5 p-8">
                No songs saved yet. Click "Add Song Link" to import your first track.
              </div>
            ) : (
              allTracks.map((track, idx) => (
                <div
                  key={track.id}
                  onClick={() => playTrack(track, allTracks, idx)}
                  className="track-row grid grid-cols-[48px_minmax(250px,1fr)_minmax(140px,1fr)_minmax(120px,1fr)_80px] gap-4 px-4 py-2.5 rounded-xl hover:bg-[#353534]/50 transition-colors group cursor-pointer items-center border border-transparent"
                >
                  <div className="text-center flex justify-center items-center">
                    <span className="track-number text-xs font-bold text-[#ebbbb4]/60">{idx + 1}</span>
                    <span className="material-symbols-outlined track-play-icon text-[#ff5540] fill-1 text-[22px]">
                      play_arrow
                    </span>
                  </div>

                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      className="w-10 h-10 rounded-md object-cover bg-[#252525]"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#e5e2e1] truncate group-hover:text-[#ff5540] transition-colors">
                        {track.title}
                      </p>
                      <p className="text-xs text-[#ebbbb4]/60 truncate mt-0.5">{track.artist}</p>
                    </div>
                  </div>

                  <div className="text-xs text-[#ebbbb4]/70 truncate">{track.artist}</div>

                  <div className="text-xs text-[#ebbbb4]/50 truncate font-mono">
                    {new Date(track.addedAt).toLocaleDateString()}
                  </div>

                  <div className="text-right text-xs text-[#ebbbb4]/60 pr-4 font-mono flex items-center justify-end gap-2">
                    <span>{track.durationFormatted || '3:30'}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLikeTrack(track.id);
                      }}
                      title="Like Song"
                      className="opacity-0 group-hover:opacity-100 text-[#ebbbb4]/60 hover:text-[#ff5540] transition-all p-1"
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          library?.likedTrackIds.includes(track.id) ? 'text-[#ff5540] fill-1' : ''
                        }`}
                      >
                        favorite
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrackFromLibrary(track.id);
                      }}
                      title="Delete Track"
                      className="opacity-0 group-hover:opacity-100 text-[#ebbbb4]/60 hover:text-[#ffb4ab] transition-all p-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
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

