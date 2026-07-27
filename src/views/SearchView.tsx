import React, { useEffect, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';

interface SearchViewProps {
  initialQuery?: string;
  onOpenAddModal: () => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ initialQuery = '', onOpenAddModal }) => {
  const { playTrack, addTrackByUrlOrSearch, library } = usePlayer();
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery);
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
      executeSearch(initialQuery);
    }
  }, [initialQuery]);

  const executeSearch = async (queryToRun: string) => {
    if (!queryToRun.trim()) return;
    try {
      setIsSearching(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(queryToRun.trim())}`);
      const data = await res.json();
      if (res.ok && data.results) {
        setResults(data.results);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchQuery);
  };

  const handleSaveToLibrary = async (track: Track) => {
    try {
      setAddedIds((prev) => ({ ...prev, [track.id]: true }));
      await addTrackByUrlOrSearch(track.videoId);
    } catch (e) {
      console.error('Save track error:', e);
    }
  };

  return (
    <div className="pt-6 pb-32 px-6 md:px-10 max-w-[1600px] mx-auto min-h-screen select-none">
      {/* Top Search Banner */}
      <div className="max-w-3xl space-y-4 mb-10">
        <h1 className="text-3xl md:text-4xl font-black text-[#e5e2e1] tracking-tight">
          Explore & Search YouTube
        </h1>
        <p className="text-sm text-[#ebbbb4]/70">
          Find music live via <code className="text-[#ff5540] font-mono">yt-dlp</code> search, play immediately, or save to your local JSON library.
        </p>

        <form onSubmit={handleSearchSubmit} className="flex gap-3 pt-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-3 text-[#ebbbb4]/50 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search music, songs, artists..."
              className="w-full h-11 bg-[#252525] border border-white/10 rounded-2xl pl-11 pr-4 text-sm text-[#e5e2e1] placeholder:text-[#ebbbb4]/40 focus:outline-none focus:border-[#ff5540]"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="px-6 bg-[#ff5540] hover:bg-[#ff5540]/90 text-white font-bold rounded-2xl text-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-[#ff5540]/20"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isSearching ? 'sync' : 'search'}
            </span>
            <span>Search</span>
          </button>
        </form>
      </div>

      {/* Results Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-[#e5e2e1] tracking-tight">Search Results</h2>

        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#ebbbb4]/60 space-y-3">
            <span className="material-symbols-outlined text-[36px] text-[#ff5540] animate-spin">
              sync
            </span>
            <span className="text-xs font-mono">Executing yt-dlp search query...</span>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 text-[#ebbbb4]/50 text-sm bg-[#201f1f] rounded-2xl border border-white/5 p-8">
            Type a query above (e.g. "Dua Lipa", "Lofi Beats", "Coldplay") to search YouTube.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((track) => {
              const isSaved = Boolean(library?.tracks[track.id] || addedIds[track.id]);
              return (
                <div
                  key={track.id}
                  className="bg-[#201f1f] hover:bg-[#353534]/50 border border-white/5 hover:border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="w-16 h-16 rounded-xl bg-[#252525] overflow-hidden shrink-0 relative group-hover:scale-105 transition-transform">
                      <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover" />
                      <button
                        onClick={() => playTrack(track, results)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-white fill-1 text-[32px]">
                          play_arrow
                        </span>
                      </button>
                    </div>

                    <div className="overflow-hidden">
                      <h3
                        onClick={() => playTrack(track, results)}
                        className="font-bold text-sm text-[#e5e2e1] truncate hover:text-[#ff5540] cursor-pointer"
                      >
                        {track.title}
                      </h3>
                      <p className="text-xs text-[#ebbbb4]/60 truncate mt-0.5">{track.artist}</p>
                      <span className="text-[10px] text-[#ebbbb4]/40 font-mono mt-1 block">
                        {track.durationFormatted || '3:30'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => playTrack(track, results)}
                      className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
                      title="Play Track"
                    >
                      <span className="material-symbols-outlined text-[20px] fill-1">
                        play_arrow
                      </span>
                    </button>

                    <button
                      onClick={() => handleSaveToLibrary(track)}
                      disabled={isSaved}
                      className={`p-2.5 rounded-full transition-colors cursor-pointer ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                          : 'bg-[#ff5540]/20 hover:bg-[#ff5540]/40 text-[#ffb4a8]'
                      }`}
                      title={isSaved ? 'In Library' : 'Save to Library'}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isSaved ? 'check' : 'add'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

