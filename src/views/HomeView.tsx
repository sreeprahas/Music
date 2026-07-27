import React, { useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';

interface HomeViewProps {
  onOpenAddModal: () => void;
  onSelectPlaylist: (playlistId: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onOpenAddModal, onSelectPlaylist }) => {
  const { library, playTrack } = usePlayer();
  const listenAgainRef = useRef<HTMLDivElement>(null);
  const newReleasesRef = useRef<HTMLDivElement>(null);

  const allTracks: Track[] = library?.tracks ? (Object.values(library.tracks) as Track[]) : [];

  // Fallback initial sample tracks if library is initial
  const samplePicks = [
    {
      title: 'Hyperfocus',
      artist: 'Stephan Bodzin',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDQHbWVHDt4UZ0eP8zjNXHr6T37uuMHC_lthdze4RXEaAL-HuHZdFgtAvlL4Bau4BoIVNiYAE-Z51DIvQSb1jcdEN3_vcxWew1EIVZ_TXSN8s4TVRdFMBtXaLN4wW8rzPtq_X_t_0FtrFF2HrQBI0bUhWAlMZVrFkRfGdA4uuBpE3M29yZB-vt4rKky8BBC0VS9yRLp5glxeAs6DIWr3p8MVUdjsa0eB8Qp8taXZ-n2ZuUSv912XVtxKAN-OhS7uN9AfFwu5pSA7xMy',
    },
    {
      title: 'Consciousness',
      artist: 'Anyma & Chris Avantgarde',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBYBFRiuYTFLjvwVCeBpE4GXJn5fQQrkf-LK6SVR6MYjkO4ojtGKuzBS1Vn8ROwT28pRhbQ2xo4aXzJtllJZi6v2mCnwhHhaNw4KRSH_pzvFDwIXTIzD_NEE01xF6BQVDb-6nY6rbyCZ58DP6OqDu-fYv3RR9Zbe8fTvtZSvGYVaVXhY6iyZINtTGGRvynMvrMIECTg_hIpjb3eX2kWsRrEwEXRAgZF-6zaEz8Jf3HiGc9rM3si0nFVzueY06AH2zZ8EKSSDbf7nvNq',
    },
    {
      title: 'Nova',
      artist: 'Tale Of Us',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAspAzE8AL_c-1WncnA43VKHhhwFsfb5q6VBTG9iRwTtd6bt9G2zNYcoWKrTqsV6h_xtq7d4N0wKiF3HIbcsBDzpOvjkOW5B86zgjMix4b_rJEVaBgzxOsJ7MHRdAX9Z2VeToWr3poZEAE5KhnMZx4atL-YK_IsMPoZQGy1lAyMC324k8mhPAySsgfTzlRRHaBvzC7nu_D0T0GiaXkd-7SDJox1NKroX4EJTVRQmw3n2u1Si2e4O8RzpAo9IIu0y5fgXth_n3ER0krh',
    },
    {
      title: 'Return to Oz',
      artist: 'Monolink (ARTBAT Remix)',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBEP67P2kHLBbdLQJ9JwJruXqRCuKi2RDtDh1MXqKfRY4L2NgsXxlqNtpkONQYoCWyqrNFFRY5phBIVFYmtRAHGfhh5Kio03-KGqu2wFPBjNsf1Pq-s0FrzC8Wgv42xUy_1n3-EWkECMJvv4ZLrjj1BQf1sIDTM7tqCY_2Bm6zS-R9fOgmk-KNVyZgfLckq59iC4FyLS8FWjNuw_EmQ7DcHK9WTS589DDQcThlXjzWIGHIQNxx2ghhJ1xzCCMP-7xVGLQ_j2OafC-I_',
    },
    {
      title: 'Velvet Sky',
      artist: 'Luna Shade',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuB4P3Mh5Uz1244LUbWaDAn-2ln_K9jzIvzGOtHzpYfxmOVLtPQwzVk4EqM5wYPip8Fv-Evv4Jpuu4P_U6Nt9PdQczsmfEIhb0rJtQfulVKPOtNdIW0GvCwOS7E7DYNyaCdedad42xm0_d82T11z3P344D6qUuSZukLIiBkpChBedMAkxySeVcaMCMHaT3HcTGiPxYLldDamTDY-0MbkdVbOF7vDwq7qvPnNIXTSra0xJdvromyjhotk9JHEoY54hWGXJUERmNSoPo1N',
    },
    {
      title: 'Carbon Fiber',
      artist: 'Tech Noir',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCEcR5D01MzoOjjbx_pxYhToiJcktR49cS4jhmKoihhUUgpTWEG20X430WMy7qZMg3GeDNX0dX_5211QVlDLBBz0KOWIpBOyv8v0UlavhabW9tlDmNNX9a-hCJ1wULOIGDUVXpwyVJDCuQOp0_1bjoUOTa5oG5PNPJJQdJtzH3awaMA0ml5kKynBbODUPzuwkBTtPTuGzrThASSMF9zLA1lZPQXbhXFVRNqXi1EExTal0SkudAiRr1VxfcAkd-m46lHOPc0KhMMc_YG',
    },
    {
      title: 'Atmospheric Bliss',
      artist: 'Cloud Gazing',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCH9glbTOkFzkYy1hfp4mSbtNexOtXF3ZPnh6AUNWrcGqX6tVozjime8QCOOeqY6Ma_Ae84OTDbgOVntkMjA2ePNkDMMqei6wQZsRgC3rieBKaaX1XOMbZPuHk887DTFUJsqvUuUjULks65PkK4G1sRihyISmp2jUuyf8ym0gzzj-U-gXwYHbgFI9AJs5HKOAa1UGMuVGnL34qw39VPTdnkNyYL6DkOO3YTtvesKHoOxtep5VELQ2C8hpnuk5IK38rkBKggfKtt-Nwf',
    },
    {
      title: 'Deep Bass Theory',
      artist: 'Sub Zero',
      cover:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCKEciJwANL5AyOrd-iD-CG_Y3JjVRDUgx9TBHJGLH9KgHFjpn3t6nwxbzdQtB6qT788r538fXRPih3bZOPXrjPtc65-2jpzJ2-uGNoyEEerZBm1RAB8-yfcRdRvldm2jf-DzDNf_e-ltHKMT_WsHVg3FbtWdg-o_bFA9TI1dY9x1a1CU4o8QAWMot6Xi-1L_1jcrsAXAsxfgGscL9SD1EK42zDfoslLHIO6i18NyJ3QBmAW0ThgnXLbCleHi8RU8BBfuuzQM0K1tGa',
    },
  ];

  const handleStartRadio = () => {
    if (allTracks.length > 0) {
      const randomTrack = allTracks[Math.floor(Math.random() * allTracks.length)];
      const shuffledQueue = [...allTracks].sort(() => Math.random() - 0.5);
      playTrack(randomTrack, shuffledQueue);
    } else {
      alert('Add songs to your library to generate an automatic radio mix!');
    }
  };

  const handleScroll = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="pt-6 pb-32 px-6 md:px-10 max-w-[1600px] mx-auto min-h-screen">
      {/* Featured Playlist Banner (Melodic Techno Hero) */}
      <div
        onClick={() => onSelectPlaylist('melodic-techno')}
        className="mb-10 rounded-2xl glass-header p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 cursor-pointer hover:border-white/20 transition-all border border-white/10 group"
      >
        <div className="w-48 h-48 md:w-56 md:h-56 shadow-2xl rounded-xl overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-300 relative">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB4FWlX6kXkhHMJhfZ1uYOs3Ne1BWytXMS6rCljmJuwtSmFc7Z4UpPovY3nvP42jVclP-ixybrvH2hRDmqj_8Kfiwa47r97x9I1QS7AIzmauy9viOhxKYdQPpQ29Az85mRBn0Uf8_8RLeupjGSgY-t4SGFe6dSxcIXMmpHyl__gWq3WxKiDYJEgL7DcaZsleeTV1kJgqGSIGN7TbyJ30725OnXr5ImdnwBnCEYTE972cuMN0NSIcj_TzFwF-8QR3IxbyWJzbVPFLnvY"
            alt="Melodic Techno Playlist Cover"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="w-14 h-14 rounded-full bg-[#ff5540] flex items-center justify-center shadow-xl">
              <span className="material-symbols-outlined text-[36px] text-white fill-1">play_arrow</span>
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <span className="text-[11px] font-bold text-[#ff5540] uppercase tracking-widest bg-[#ff5540]/10 px-2.5 py-1 rounded-full border border-[#ff5540]/20">
            Featured Playlist
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-[#e5e2e1] tracking-tight">
            Melodic Techno
          </h1>
          <p className="text-[#ebbbb4]/80 text-sm md:text-base max-w-2xl leading-relaxed">
            Deep rhythms and hypnotic synths for late-night focus and atmospheric journeys.
          </p>

          <div className="pt-2 flex items-center gap-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectPlaylist('melodic-techno');
              }}
              className="bg-[#ff5540] hover:bg-[#ff5540]/90 text-white font-bold px-6 py-2.5 rounded-full flex items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-[#ff5540]/20 cursor-pointer"
            >
              <span className="material-symbols-outlined fill-1">play_arrow</span>
              <span>Open Playlist</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddModal();
              }}
              className="border border-white/20 hover:bg-white/10 text-white font-semibold px-5 py-2.5 rounded-full flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              <span>Add Songs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Picks Section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#e5e2e1] tracking-tight">Quick picks</h2>
          <button
            onClick={handleStartRadio}
            className="text-xs font-bold text-[#ebbbb4]/70 hover:text-[#ff5540] transition-colors uppercase tracking-wider cursor-pointer"
          >
            Start Radio
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(allTracks.length > 0 ? allTracks.slice(0, 8) : []).concat(
            allTracks.length < 8
              ? samplePicks.slice(0, 8 - allTracks.length).map((sp, idx) => ({
                  id: `sp-${idx}`,
                  videoId: `sp-${idx}`,
                  title: sp.title,
                  artist: sp.artist,
                  thumbnailUrl: sp.cover,
                  duration: 320,
                  addedAt: new Date().toISOString(),
                }))
              : []
          ).map((item, index) => (
            <div
              key={item.id || index}
              onClick={() => {
                if (allTracks[index]) {
                  playTrack(allTracks[index], allTracks);
                } else if (allTracks.length > 0) {
                  playTrack(allTracks[0], allTracks);
                } else {
                  onOpenAddModal();
                }
              }}
              className="flex items-center gap-4 p-2.5 rounded-xl hover:bg-[#252525] transition-all group cursor-pointer border border-transparent hover:border-white/5"
            >
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                className="w-14 h-14 rounded-lg object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#e5e2e1] text-sm truncate group-hover:text-[#ff5540] transition-colors">
                  {item.title}
                </p>
                <p className="text-[#ebbbb4]/60 text-xs truncate mt-0.5">{item.artist}</p>
              </div>
              <span className="material-symbols-outlined opacity-0 group-hover:opacity-100 text-[#ff5540] transition-opacity fill-1 text-[28px] mr-1">
                play_arrow
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Listen Again Carousel */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#e5e2e1] tracking-tight">Listen again</h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleScroll(listenAgainRef, 'left')}
              className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-[#252525] text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              onClick={() => handleScroll(listenAgainRef, 'right')}
              className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-[#252525] text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>

        <div
          ref={listenAgainRef}
          className="flex gap-6 overflow-x-auto hide-scrollbar pb-4 scroll-smooth"
        >
          {samplePicks.slice(0, 5).map((card, idx) => (
            <div
              key={`la-${idx}`}
              onClick={() => {
                if (allTracks[idx]) {
                  playTrack(allTracks[idx], allTracks);
                } else {
                  handleStartRadio();
                }
              }}
              className="min-w-[190px] w-[190px] group cursor-pointer"
            >
              <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-[#1c1b1b]">
                <img
                  src={card.cover}
                  alt={card.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-[#ff5540] flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform">
                    <span className="material-symbols-outlined text-white fill-1 text-[28px]">
                      play_arrow
                    </span>
                  </div>
                </div>
              </div>
              <p className="font-bold text-[#e5e2e1] text-sm line-clamp-1 group-hover:text-[#ff5540] transition-colors">
                {card.title}
              </p>
              <p className="text-[#ebbbb4]/60 text-xs mt-0.5 truncate">{card.artist}</p>
            </div>
          ))}
        </div>
      </section>

      {/* New Releases Carousel */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#e5e2e1] tracking-tight">New releases</h2>
          <button
            onClick={() => onSelectPlaylist('melodic-techno')}
            className="text-xs font-bold text-[#ebbbb4]/70 hover:text-[#ff5540] transition-colors uppercase tracking-wider cursor-pointer"
          >
            See All
          </button>
        </div>

        <div
          ref={newReleasesRef}
          className="flex gap-6 overflow-x-auto hide-scrollbar pb-4 scroll-smooth"
        >
          {samplePicks.slice(3, 8).map((card, idx) => (
            <div
              key={`nr-${idx}`}
              onClick={() => {
                if (allTracks[idx]) {
                  playTrack(allTracks[idx], allTracks);
                } else {
                  handleStartRadio();
                }
              }}
              className="min-w-[190px] w-[190px] group cursor-pointer"
            >
              <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-[#1c1b1b]">
                <img
                  src={card.cover}
                  alt={card.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute top-2.5 right-2.5 bg-[#ff5540] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shadow">
                  New
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-[#ff5540] flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform">
                    <span className="material-symbols-outlined text-white fill-1 text-[28px]">
                      play_arrow
                    </span>
                  </div>
                </div>
              </div>
              <p className="font-bold text-[#e5e2e1] text-sm line-clamp-1 group-hover:text-[#ff5540] transition-colors">
                {card.title}
              </p>
              <p className="text-[#ebbbb4]/60 text-xs mt-0.5 truncate">{card.artist}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

