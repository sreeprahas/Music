'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import type { Playlist, Track } from '@/types';
import { formatDuration, cleanArtistName } from '@/lib/ytmusicApi';
import { Pin, Eye, EyeOff, Play, Download, Music, Search, X, ListPlus } from 'lucide-react';

interface Props {
  playlist: Playlist;
  isPinned: boolean;
  isHidden?: boolean;
  onPlay: (track: Track, queue: Track[]) => void;
  onAddToQueue?: (track: Track) => void;
  onDownload: (playlistId: string) => void;
  onTogglePin: (playlistId: string) => void;
  onToggleHidden: (playlistId: string) => void;
  onTracksLoaded?: (playlist: Playlist, tracks: Track[]) => void;
  currentVideoId?: string;
}

export function PlaylistView({
  playlist,
  isPinned,
  isHidden = false,
  onPlay,
  onAddToQueue,
  onDownload,
  onTogglePin,
  onToggleHidden,
  onTracksLoaded,
  currentVideoId,
}: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const trackListRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onTracksLoaded);
  callbackRef.current = onTracksLoaded;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const load = async () => {
      const qs = navigator.onLine
        ? `playlistId=${encodeURIComponent(playlist.id)}&forceRefresh=1`
        : `playlistId=${encodeURIComponent(playlist.id)}`;
      try {
        const res = await fetch(`/api/playlist?${qs}`);
        const data = await res.json().catch(() => ({ tracks: [] }));
        if (cancelled) return;
        if (!res.ok) {
          // forceRefresh failed (no internet) → try cache
          if (navigator.onLine) {
            const r2 = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}`);
            const d2 = await r2.json().catch(() => ({ tracks: [] }));
            if (!cancelled) {
              setTracks((d2.tracks || []) as Track[]);
              callbackRef.current?.(playlist, (d2.tracks || []) as Track[]);
            }
          } else {
            setError(data.error || 'Failed to load tracks');
          }
          return;
        }
        const loaded = (data.tracks || []) as Track[];
        setTracks(loaded);
        callbackRef.current?.(playlist, loaded);
      } catch (err) {
        if (cancelled) return;
        // Network error → try cache
        try {
          const r2 = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}`);
          const d2 = await r2.json().catch(() => ({ tracks: [] }));
          if (!cancelled) {
            setTracks((d2.tracks || []) as Track[]);
            callbackRef.current?.(playlist, (d2.tracks || []) as Track[]);
          }
        } catch {
          if (!cancelled) setError('Failed to load tracks');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [playlist.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = trackListRef.current;
    if (!el) return;
    const onScroll = () => setIsCollapsed(el.scrollTop > 80);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const filteredTracks = useMemo(() => {
    if (!trackSearchQuery.trim()) return tracks;
    const q = trackSearchQuery.toLowerCase().trim();
    return tracks.filter(
      (t) => t.title.toLowerCase().includes(q) || cleanArtistName(t.artist).toLowerCase().includes(q)
    );
  }, [tracks, trackSearchQuery]);

  const downloadedCount = tracks.filter((t) => t.downloaded).length;
  const downloadedTracks = filteredTracks.filter((t) => t.downloaded);

  return (
    <div className="h-full w-full min-w-0 flex flex-col min-h-0">
      <div
        className={`px-6 select-none shrink-0 transition-all duration-500 ease-out flex items-center gap-4 overflow-hidden ${
          isCollapsed ? 'py-3 bg-[#0A0A0A]' : 'pt-6 pb-4'
        }`}
      >
        <div
          className={`rounded-2xl overflow-hidden bg-white/5 shrink-0 shadow-2xl relative border border-white/10 transition-all duration-500 ease-out ${
            isCollapsed ? 'w-10 h-10' : 'w-28 h-28'
          }`}
        >
          {playlist.thumbnailUrl ? (
            <img
              src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`}
              alt={playlist.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00F2FE]/20 to-[#1a1a2e]">
              <Music className={`${isCollapsed ? 'w-4 h-4' : 'w-8 h-8'} text-white/20`} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {!isCollapsed && (
              <span className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-1">
                Playlist
              </span>
            )}
            <h1 className={`font-black text-white truncate transition-all duration-500 ${isCollapsed ? 'text-base' : 'text-2xl'}`}>
              {playlist.title}
            </h1>
            {playlist.description && !isCollapsed && (
              <p className="text-xs text-white/40 mt-1 line-clamp-1">{playlist.description}</p>
            )}
            <div className={`flex items-center gap-3 ${isCollapsed ? 'mt-0' : 'mt-2'}`}>
              <span className="text-xs text-white/50">{loading ? '…' : `${tracks.length} tracks`}</span>
              {!loading && !isCollapsed && (
                <span className="text-xs text-white/40">
                  {downloadedCount === 0
                    ? 'Not downloaded'
                    : `${downloadedCount} / ${tracks.length} downloaded`}
                </span>
              )}
            </div>

            {!isCollapsed && (
              <div className="flex items-center gap-2 mt-3 flex-wrap overflow-hidden pb-1">
                {downloadedCount > 0 && (
                  <button
                    onClick={() => onPlay(downloadedTracks[0], downloadedTracks)}
                    className="flex shrink items-center justify-center gap-1.5 px-4 sm:px-6 py-2 bg-[#00F2FE] hover:bg-[#00C7D3] rounded-2xl text-black text-xs sm:text-sm font-semibold transition-all duration-300 ease-out shadow-lg hover:shadow-[0_0_22px_rgba(0,242,254,0.28)]"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    Play
                  </button>
                )}
                {downloadedCount < tracks.length && !loading && (
                  <button
                    onClick={() => onDownload(playlist.id)}
                    className="flex shrink items-center justify-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-2xl border border-white/15 text-white hover:text-[#00F2FE] hover:border-[#00F2FE]/40 text-xs sm:text-sm font-medium transition-all duration-300 ease-out bg-white/5 hover:bg-[#1A1A1A]"
                  >
                    <Download className="w-3.5 h-3.5 text-[#00F2FE]" />
                    {downloadedCount === 0 ? 'Download All' : `Download Remaining (${tracks.length - downloadedCount})`}
                  </button>
                )}
                <button
                  onClick={() => onTogglePin(playlist.id)}
                  className={`flex shrink items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-2xl border text-xs sm:text-sm font-medium transition-all duration-300 ease-out ${
                    isPinned
                      ? 'border-[#00F2FE]/40 text-[#00F2FE] bg-[#00F2FE]/10 hover:bg-[#00F2FE]/20'
                      : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                  {isPinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => onToggleHidden(playlist.id)}
                  className={`flex shrink items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-2xl border text-xs sm:text-sm font-medium transition-all duration-300 ease-out ${
                    isHidden
                      ? 'border-[#00F2FE]/40 text-[#00F2FE] bg-[#00F2FE]/10 hover:bg-[#00F2FE]/20'
                      : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {isHidden ? (
                    <><Eye className="w-3.5 h-3.5 text-[#00F2FE]" />Unhide</>
                  ) : (
                    <><EyeOff className="w-3.5 h-3.5" />Hide</>
                  )}
                </button>
                <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-white absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={trackSearchQuery}
                    onChange={(e) => setTrackSearchQuery(e.target.value)}
                    placeholder="Search tracks..."
                    className="w-full h-8 bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 text-xs text-white placeholder-white outline-none focus:outline-none focus:border-[#00F2FE]/50 caret-[#00F2FE] transition-all duration-300 ease-out"
                  />
                  {trackSearchQuery && (
                    <button
                      onClick={() => setTrackSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white hover:text-[#00F2FE] transition-colors duration-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {isCollapsed && (
            <div className="relative w-56 shrink-0">
              <Search className="w-3.5 h-3.5 text-white absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={trackSearchQuery}
                onChange={(e) => setTrackSearchQuery(e.target.value)}
                placeholder="Search tracks..."
                className="w-full h-8 bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 text-xs text-white placeholder-white outline-none focus:outline-none focus:border-[#00F2FE]/50 caret-[#00F2FE] transition-all duration-500 ease-out"
              />
              {trackSearchQuery && (
                <button
                  onClick={() => setTrackSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white hover:text-[#00F2FE] transition-colors duration-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={trackListRef} className="px-6 pb-36 flex-1 min-h-0 overflow-y-auto scrollbar-thin relative">
        {!loading && !error && tracks.length > 0 && trackSearchQuery && (
          <div className="mb-4 text-xs text-white/40 font-medium">
            {filteredTracks.length} of {tracks.length} tracks
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-2xl border-2 border-white/20 border-t-[#00F2FE] animate-spin" />
          </div>
        )}

        {error && <div className="text-center py-16 text-white/40 text-sm">{error}</div>}

        {!loading && !error && (
          <table className="w-full table-fixed">
            <thead>
              <tr className="text-white/30 text-xs font-medium border-b border-white/5">
                <th className="text-left py-3 px-3 w-10">#</th>
                <th className="text-left py-3 px-3 w-[46%]">Title</th>
                <th className="text-left py-3 px-3 hidden md:table-cell">Artist</th>
                <th className="text-right py-3 px-3 w-16">Time</th>
                <th className="text-center py-3 px-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTracks.map((track, idx) => {
                const isActive = track.videoId === currentVideoId;
                const canPlay = !!track.downloaded;
                const artist = cleanArtistName(track.artist);
                return (
                  <tr
                    key={track.videoId}
                    onClick={() => {
                      if (!canPlay) return;
                      const trackIndex = downloadedTracks.findIndex((t) => t.videoId === track.videoId);
                      const queueFromHere = trackIndex !== -1 ? downloadedTracks.slice(trackIndex) : [track];
                      onPlay(track, queueFromHere);
                    }}
                    className={`group transition-colors rounded-2xl ${
                      canPlay ? 'cursor-pointer hover:bg-white/5' : 'cursor-default opacity-50'
                    } ${isActive ? 'bg-white/5' : ''}`}
                  >
                    <td className="py-2.5 px-3 text-center w-10 relative">
                      {isActive ? (
                        <NowPlayingBars />
                      ) : (
                        <>
                          <span className="text-white/30 text-sm group-hover:opacity-0">{idx + 1}</span>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-3.5 h-3.5 fill-white text-white" />
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/5">
                          <img
                            src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isActive ? 'text-[#00F2FE]' : 'text-white'}`}>
                            {track.title}
                          </p>
                          <p className="text-xs text-white/40 truncate md:hidden">{artist}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      <span className="text-sm text-white/50 truncate">{artist}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-sm text-white/30">
                        {track.duration ? formatDuration(track.duration) : '–'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center w-12">
                      {onAddToQueue && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToQueue(track);
                          }}
                          className="p-1.5 rounded-lg text-white/40 hover:text-[#00F2FE] hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                          title="Add to Queue"
                        >
                          <ListPlus className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NowPlayingBars() {
  return (
    <div className="flex items-end justify-center gap-[2px] h-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[3px] bg-[#00F2FE] rounded-xl animate-music-bar"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
