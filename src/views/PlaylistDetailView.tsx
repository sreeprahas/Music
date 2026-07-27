import React, { useState } from 'react';
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
  const {
    library,
    currentTrack,
    isPlaying,
    playTrack,
    toggleLikeTrack,
    editPlaylist,
    deletePlaylistById,
    toggleShuffle,
    addToQueue,
  } = usePlayer();

  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);

  const isMelodicTechnoSample = playlistId === 'melodic-techno';
  const isLikedPlaylist = playlistId === 'liked';
  const customPlaylist = library?.playlists.find((p) => p.id === playlistId);

  // Default Melodic Techno Sample Tracks if library is empty
  const sampleMelodicTracks: Track[] = [
    {
      id: 'mt-1',
      videoId: 'mt-1',
      title: 'Hyperfocus',
      artist: 'Stephan Bodzin',
      thumbnailUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC6IhIASOURl1PVrtcTTfmyDC1BpAlv4VjwGsSMsS15iPFCEDolYrbTlRk0ZgXK_igFCHc1ptGUIaXTC4oA_A3PgxxqEjN3nOD1NzXDSn4cKnZGsYpcy2Amu6AspjK9eRWisYKkF-OEbI446LueYYWqCU1pUNXlFhIRbVpr83Ofs3yu0wfY4bZmVKmdh3bf1dc68IHD7zc7KuX5zp0c-ZbFw7s-74-FhMti7RknIRkCd_l2otBuNAroUuKcgEUI6XVAc8eSraUga0SC',
      duration: 454,
      durationFormatted: '7:34',
      addedAt: 'Oct 24, 2023',
    },
    {
      id: 'mt-2',
      videoId: 'mt-2',
      title: 'Consciousness',
      artist: 'Anyma & Chris Avantgarde',
      thumbnailUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAhWGl0AnChJQ1YYMQMgWTiTO-4ZvJRfRoKLSa3mKcj1HT09kX_58yWjoOgez8WL3NhdEdVwHMwMsXc4vTRPzPCGf-AHUiH_qr5_e10HDaz-jvGgNxO5uGBSxR2RVshLGWnb56uHc4tHNf6QTLPXlQNi0xvC861ywGURGHK2M3jiExxHbheYCWLr6dB8iqSkFhbhr3dcsUUoFoOWxGSPBg7Os_J0pd2IJF0xWZJbZb_IUMgd8UI1-h3qzcM9VB9aaWM7RSw6GyPq7ka',
      duration: 348,
      durationFormatted: '5:48',
      addedAt: 'Nov 12, 2023',
    },
    {
      id: 'mt-3',
      videoId: 'mt-3',
      title: 'Nova',
      artist: 'Tale Of Us',
      thumbnailUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAtveXcwGjPhuQdJTJDDFF42SBeU3Vh5QDvNoteNvoNXJ7oU6QOnlZgF3r-98QFNSOtgI77p-WMN9-NyAFHEW3S0zq64GCscD3NMLVXB13CIBnEZv3HYOZK4bQ1TArTxeJYIHV6Z9s3V9Su5Ppu6b7RDAfu59NS_aKr7u9dw7QS56u4PAo0pe0uMC8gn4sqCOx4-fEJ3MmtcEw6wDk5-lVh2JOfFgz0VNXWdStQYyENUasAFGJ6BqF3EwuslvkkU2cx-s3e3T1ZYD0l',
      duration: 372,
      durationFormatted: '6:12',
      addedAt: '2 days ago',
    },
    {
      id: 'mt-4',
      videoId: 'mt-4',
      title: 'Return to Oz (ARTBAT Remix)',
      artist: 'Monolink',
      thumbnailUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCNmjtoczwg9mkIiVU4r9etFcJO0dSptHZP8mJ6TzfOVopYyYz4kogucwASm4TCnOvVXi3YIekQVcEIulY1KzVaA7k_2_OIso_qwsyydsEMBv8EPHLdT8TOeXuUFOUm3IQhiaBmtNvVtV5vXyrVAJkpgdPUyyc2muoZzrNZI_0u4ghXyhSInRSV4ppPGqAaqYu3b5tNXwpVeQrS_V8UWdqst7iVM6j-fuqVM2lSfUEdrI3Qa7DQge1txkJKXUyC9kYoPwi6dR7FpLQ4',
      duration: 480,
      durationFormatted: '8:00',
      addedAt: 'Sep 15, 2023',
    },
  ];

  let playlistTitle = 'Melodic Techno';
  let playlistDesc =
    'Deep rhythms and hypnotic synths for late-night focus and atmospheric journeys.';
  let playlistCover =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuB4FWlX6kXkhHMJhfZ1uYOs3Ne1BWytXMS6rCljmJuwtSmFc7Z4UpPovY3nvP42jVclP-ixybrvH2hRDmqj_8Kfiwa47r97x9I1QS7AIzmauy9viOhxKYdQPpQ29Az85mRBn0Uf8_8RLeupjGSgY-t4SGFe6dSxcIXMmpHyl__gWq3WxKiDYJEgL7DcaZsleeTV1kJgqGSIGN7TbyJ30725OnXr5ImdnwBnCEYTE972cuMN0NSIcj_TzFwF-8QR3IxbyWJzbVPFLnvY';
  let playlistTracks: Track[] = sampleMelodicTracks;

  if (isLikedPlaylist) {
    playlistTitle = 'Liked Songs';
    playlistDesc = 'Your favorite personal collection of liked tracks.';
    playlistCover =
      'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=800&q=80';
    const allTracks: Track[] = library?.tracks ? (Object.values(library.tracks) as Track[]) : [];
    playlistTracks = allTracks.filter((t) => library?.likedTrackIds.includes(t.id));
    if (playlistTracks.length === 0) playlistTracks = sampleMelodicTracks;
  } else if (customPlaylist) {
    playlistTitle = customPlaylist.name;
    playlistDesc = customPlaylist.description || 'Custom user playlist';
    playlistCover =
      customPlaylist.coverUrl ||
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80';
    playlistTracks = customPlaylist.trackIds
      .map((id) => library?.tracks[id])
      .filter((t): t is Track => t !== undefined);
    if (playlistTracks.length === 0) playlistTracks = sampleMelodicTracks;
  }

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      playTrack(playlistTracks[0], playlistTracks, 0);
    }
  };

  const handleShufflePlay = () => {
    if (playlistTracks.length > 0) {
      const shuffled = [...playlistTracks].sort(() => Math.random() - 0.5);
      toggleShuffle();
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  const handleDelete = async () => {
    if (customPlaylist && confirm(`Delete playlist "${customPlaylist.name}"?`)) {
      await deletePlaylistById(customPlaylist.id);
      onBack();
    }
  };

  return (
    <div className="pb-32 select-none min-h-screen">
      {/* Glass Header Banner */}
      <div className="glass-header pt-20 pb-10 px-8 md:px-10 flex flex-col md:flex-row items-end gap-8 border-b border-white/5">
        <div className="w-56 h-56 md:w-64 md:h-64 shadow-2xl rounded-lg overflow-hidden shrink-0 border border-white/10 relative group">
          <img src={playlistCover} alt={playlistTitle} className="w-full h-full object-cover" />
          <div
            onClick={handlePlayAll}
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-[#ff5540] flex items-center justify-center shadow-xl">
              <span className="material-symbols-outlined text-[36px] text-white fill-1">play_arrow</span>
            </div>
          </div>
        </div>

        <div className="flex-1 pb-2 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ebbbb4]/60">Playlist</p>
          <h1 className="text-4xl md:text-6xl font-black text-[#e5e2e1] tracking-tight">
            {playlistTitle}
          </h1>
          <p className="text-[#ebbbb4]/80 text-sm md:text-base max-w-2xl">{playlistDesc}</p>

          <div className="flex items-center gap-3 text-xs font-semibold text-[#ebbbb4]/60 pt-1">
            <span className="font-bold text-[#ff5540]">Pulse Music</span>
            <span>•</span>
            <span>{playlistTracks.length} songs, 14 hours 32 min</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-4">
            <button
              onClick={handlePlayAll}
              className="bg-[#ff5540] hover:bg-[#ff5540]/90 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-[#ff5540]/20 cursor-pointer"
            >
              <span className="material-symbols-outlined fill-1">play_arrow</span>
              <span>Play</span>
            </button>

            <button
              onClick={handleShufflePlay}
              className="border border-white/20 px-8 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[#e5e2e1] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">shuffle</span>
              <span>Shuffle</span>
            </button>

            <button
              onClick={() => alert('Playlist added to your library favorites!')}
              title="Favorite Playlist"
              className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">favorite</span>
            </button>

            <button
              onClick={onOpenAddModal}
              title="Add Songs to Playlist"
              className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">add</span>
            </button>

            {customPlaylist && (
              <button
                onClick={handleDelete}
                title="Delete Playlist"
                className="w-12 h-12 rounded-full border border-red-500/40 bg-red-900/10 flex items-center justify-center hover:bg-red-900/30 text-red-400 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[22px]">delete</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Track List Table */}
      <div className="px-6 md:px-10 pt-8">
        <div className="grid grid-cols-[48px_minmax(250px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(120px,1fr)_80px] gap-4 px-4 py-2 border-b border-white/10 text-[#ebbbb4]/60 font-semibold text-[11px] uppercase tracking-wider mb-3">
          <div className="text-center">#</div>
          <div>Title</div>
          <div>Artist</div>
          <div>Album</div>
          <div>Date Added</div>
          <div className="text-right pr-4">
            <span className="material-symbols-outlined text-[16px]">schedule</span>
          </div>
        </div>

        {/* Track Rows */}
        <div className="space-y-1">
          {playlistTracks.map((track, idx) => {
            const isCurrentPlaying = currentTrack?.id === track.id;
            return (
              <div
                key={track.id || idx}
                onClick={() => playTrack(track, playlistTracks, idx)}
                className={`track-row grid grid-cols-[48px_minmax(250px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(120px,1fr)_80px] gap-4 px-4 py-2.5 rounded-xl hover:bg-[#353534]/50 transition-colors group cursor-pointer items-center border border-transparent ${
                  isCurrentPlaying ? 'bg-[#353534]/40 border-[#ff5540]/30' : ''
                }`}
              >
                {/* Index / Play Icon */}
                <div className="text-center flex justify-center items-center">
                  <span
                    className={`track-number font-bold text-xs ${
                      isCurrentPlaying ? 'text-[#ff5540]' : 'text-[#ebbbb4]/60'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="material-symbols-outlined track-play-icon text-[#ff5540] fill-1 text-[22px]">
                    play_arrow
                  </span>
                </div>

                {/* Track Title & Artwork */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 bg-[#201f1f] rounded-md overflow-hidden relative shrink-0 border border-white/5">
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`font-bold text-sm truncate ${
                        isCurrentPlaying ? 'text-[#ff5540]' : 'text-[#e5e2e1]'
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="text-xs text-[#ebbbb4]/60 truncate">Mastering Edition</p>
                  </div>
                </div>

                {/* Artist */}
                <div className="text-xs text-[#ebbbb4]/80 truncate font-medium">{track.artist}</div>

                {/* Album */}
                <div className="text-xs text-[#ebbbb4]/60 truncate">Boavista</div>

                {/* Date Added */}
                <div className="text-xs text-[#ebbbb4]/60 truncate">
                  {track.addedAt || 'Oct 24, 2023'}
                </div>

                {/* Duration & Menu Actions */}
                <div className="text-right text-xs text-[#ebbbb4]/70 pr-4 font-mono flex items-center justify-end gap-2">
                  <span>{track.durationFormatted || '4:15'}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLikeTrack(track.id);
                    }}
                    title="Like Song"
                    className="opacity-0 group-hover:opacity-100 hover:text-[#ff5540] transition-all p-1"
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        library?.likedTrackIds.includes(track.id) ? 'text-[#ff5540] fill-1' : ''
                      }`}
                    >
                      favorite
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

