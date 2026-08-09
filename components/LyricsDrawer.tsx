'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Track } from '@/types';
import { X, Music2 } from 'lucide-react';
import { parseLRC, getActiveLyricIndex } from '@/lib/lyrics';
import type { LyricLine } from '@/lib/lyrics';
import { Skeleton } from './Skeleton';

interface LyricsData {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  trackName?: string;
  artistName?: string;
  notFound?: boolean;
  error?: string;
}

interface Props {
  track: Track | null;
  currentTime: number;
  onClose: () => void;
  onSeek?: (seconds: number) => void;
}

/** Strip YouTube/topic noise + @ handles + pipe separators for cleaner API queries */
function cleanForLyrics(str: string): string {
  return str
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s+Topic$/i, '')
    .replace(/\s*\|.*$/, '')          // strip everything after pipe
    .replace(/@\S+/g, '')             // strip @handles
    .replace(/\s*&\s*\S+/g, '')       // strip & collaborators
    .replace(/\s+/g, ' ')
    .trim();
}

export function LyricsDrawer({ track, currentTime, onClose, onSeek }: Props) {
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedLines, setParsedLines] = useState<LyricLine[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFetchKey = useRef('');

  useEffect(() => {
    if (!track) return;
    const rawTitle = track.title;
    const rawArtist = track.artist;
    const key = `${rawTitle}|${rawArtist}`;
    if (key === lastFetchKey.current) return;
    lastFetchKey.current = key;

    let cancelled = false;
    setLoading(true);
    setLyricsData(null);
    setParsedLines([]);
    setActiveIndex(-1);

    const title = cleanForLyrics(rawTitle);
    const artist = cleanForLyrics(rawArtist);

    const doFetch = async () => {
      try {
        const res = await fetch(
          `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
        );
        if (cancelled) return;
        if (!res.ok) {
          setLyricsData({ syncedLyrics: null, plainLyrics: null, notFound: true });
          return;
        }
        const data: LyricsData = await res.json();
        if (cancelled) return;
        setLyricsData(data);
        if (data.syncedLyrics) setParsedLines(parseLRC(data.syncedLyrics));
      } catch {
        if (cancelled) return;
        // Retry once with just the title (no artist) before giving up
        try {
          const res2 = await fetch(`/api/lyrics?title=${encodeURIComponent(title)}&artist=`);
          if (cancelled) return;
          if (res2.ok) {
            const data2: LyricsData = await res2.json();
            if (cancelled) return;
            setLyricsData(data2);
            if (data2.syncedLyrics) setParsedLines(parseLRC(data2.syncedLyrics));
            return;
          }
        } catch { /* ignore */ }
        if (!cancelled) setLyricsData({ syncedLyrics: null, plainLyrics: null, notFound: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    return () => { cancelled = true; };
  }, [track?.title, track?.artist]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (parsedLines.length === 0) return;
    setActiveIndex(getActiveLyricIndex(parsedLines, currentTime));
  }, [currentTime, parsedLines]);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      container.scrollTo({ top: el.offsetTop - container.offsetTop - 160, behavior: 'smooth' });
    }
  }, [activeIndex]);

  if (!track) return null;

  const hasSynced = parsedLines.length > 0;
  const hasPlain = !!lyricsData?.plainLyrics;

  return (
    <div className="h-full bg-[#120e18] flex flex-col overflow-hidden relative select-none">
      {/* Ambient bg */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none z-0">
        {track.thumbnailUrl && (
          <img
            src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
            alt=""
            className="w-full h-full object-cover blur-3xl scale-150"
          />
        )}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-[#00F2FE]" />
          <span className="text-sm font-bold text-white tracking-tight">Lyrics</span>
          {lyricsData?.artistName && (
            <span className="text-xs text-white/30 truncate max-w-[120px]">— {lyricsData.artistName}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full text-white/30 hover:text-white hover:bg-white/5 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-5 py-4 min-h-0">
        {loading && (
          <div className="py-0 space-y-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => (
              <div key={index} className="px-3 py-2 rounded-xl">
                <Skeleton
                  className={`h-6 rounded-lg ${
                    index % 4 === 0
                      ? 'w-3/5'
                      : index % 4 === 1
                      ? 'w-5/6'
                      : index % 4 === 2
                      ? 'w-2/3'
                      : 'w-4/5'
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && lyricsData?.notFound && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-14 h-14 rounded-xl overflow-hidden opacity-50">
              <img
                src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/50">{track.title}</p>
              <p className="text-xs text-white/25 mt-1">No lyrics found</p>
            </div>
          </div>
        )}

        {/* Synced LRC */}
        {!loading && hasSynced && (
          <div className="py-0 space-y-1">
            {parsedLines.map((line, i) => {
              const isActive = i === activeIndex;
              const isPast = i < activeIndex;
              return (
                <div
                  key={i}
                  ref={isActive ? activeRef : undefined}
                  onClick={() => onSeek?.(line.time)}
                  className={`group px-3 py-2 rounded-xl cursor-pointer transition-all duration-300 ease-out origin-left border border-transparent break-words ${
                    isActive ? 'bg-white/5 border-white/5 shadow-inner' : 'hover:bg-white/5'
                  }`}
                >
                  <p
                    className={`text-base sm:text-lg font-bold leading-snug tracking-tight transition-all duration-300 ease-out break-words ${
                      isActive
                        ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.45)]'
                        : isPast
                        ? 'text-white/20 group-hover:text-white/50'
                        : 'text-white/35 group-hover:text-white/70'
                    }`}
                  >
                    {line.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Plain lyrics */}
        {!loading && !hasSynced && hasPlain && (
          <div className="pb-8 pt-2 space-y-3">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-[10px] text-white/20 uppercase tracking-widest font-semibold">Plain Lyrics</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>
            {lyricsData!.plainLyrics!.split('\n').map((line, i) => (
              <p
                key={i}
                className={`text-base font-semibold leading-relaxed transition-colors ${
                  line.trim() === '' ? 'my-2' : 'text-white/60 hover:text-white cursor-default'
                }`}
              >
                {line.trim() === '' ? '\u00A0' : line}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Now playing footer */}
      <div className="relative z-10 border-t border-white/5 px-5 py-3 shrink-0 flex items-center gap-3 bg-black/30">
        <div className="w-8 h-8 rounded-md overflow-hidden shrink-0">
          <img
            src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
            alt={track.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white/70 truncate">{track.title}</p>
          <p className="text-[10px] text-white/30 truncate">{track.artist}</p>
        </div>
        <div className="flex items-end gap-[2px] h-3 shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[2px] bg-[#00F2FE] rounded-full animate-music-bar" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
