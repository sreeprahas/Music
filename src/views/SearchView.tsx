import React, { useEffect, useState } from 'react';
import { Search, Play, Plus, Loader2, Sparkles, Check, Disc } from 'lucide-react';
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
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto custom-scrollbar">
      {/* Top Search Input */}
      <div className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Explore & Search YouTube</h1>
        <p className="text-sm text-neutral-400">
          Find music tracks live via <code className="text-red-400 font-mono">yt-dlp</code> search, play immediately, or save to your local JSON library.
        </p>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 pt-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3.5 top-3 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search music, songs, artists..."
              className="w-full h-11 bg-[#1f1f1f] border border-white/10 rounded-2xl pl-11 pr-4 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="px-6 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl text-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Search</span>
          </button>
        </form>
      </div>

      {/* Results Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight">Search Results</h2>

        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400 space-y-3">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            <span className="text-xs font-mono">Executing yt-dlp search query...</span>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 text-neutral-500 text-sm bg-[#141414] rounded-2xl border border-white/5 p-8">
            Type a query above (e.g. "Dua Lipa", "Lofi Beats", "Coldplay") to search YouTube.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((track) => {
              const isSaved = Boolean(library?.tracks[track.id] || addedIds[track.id]);
              return (
                <div
                  key={track.id}
                  className="bg-[#181818] hover:bg-[#222] border border-white/5 hover:border-white/20 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all group"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="w-16 h-16 rounded-xl bg-[#222] overflow-hidden shrink-0 relative group-hover:scale-105 transition-transform">
                      <img src={track.thumbnailUrl} alt={track.title} className="w-full h-full object-cover" />
                      <button
                        onClick={() => playTrack(track, results)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      >
                        <Play className="w-6 h-6 fill-white text-white" />
                      </button>
                    </div>

                    <div className="overflow-hidden">
                      <h3
                        onClick={() => playTrack(track, results)}
                        className="font-bold text-sm text-white truncate hover:text-red-400 cursor-pointer"
                      >
                        {track.title}
                      </h3>
                      <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
                      <span className="text-[10px] text-neutral-500 font-mono mt-1 block">
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
                      <Play className="w-4 h-4 fill-white" />
                    </button>

                    <button
                      onClick={() => handleSaveToLibrary(track)}
                      disabled={isSaved}
                      className={`p-2.5 rounded-full transition-colors cursor-pointer ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                          : 'bg-red-600/20 hover:bg-red-600/40 text-red-400'
                      }`}
                      title={isSaved ? 'In Library' : 'Save to Library'}
                    >
                      {isSaved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
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
