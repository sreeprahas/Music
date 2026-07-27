'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Track } from '@/types';
import { X, Music2, Loader2 } from 'lucide-react';
import { parseLRC, getActiveLyricIndex } from '@/lib/lyrics';
import type { LyricLine } from '@/lib/lyrics';

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

export function LyricsDrawer({ track, currentTime, onClose, onSeek }: Props) {
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedLines, setParsedLines] = useState<LyricLine[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFetchKey = useRef('');

  const fetchLyrics = useCallback(async (title: string, artist: string) => {
    setLoading(true);
    setLyricsData(null);
    setParsedLines([]);
    setActiveIndex(-1);
    try {
      const res = await fetch(
        `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
      );
      const data: LyricsData = await res.json();
      setLyricsData(data);
      if (data.syncedLyrics) setParsedLines(parseLRC(data.syncedLyrics));
    } catch {
      setLyricsData({ syncedLyrics: null, plainLyrics: null, error: 'Failed to load lyrics' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!track) return;
    const key = `${track.title}|${track.artist}`;
    if (key === lastFetchKey.current) return;
    lastFetchKey.current = key;
    fetchLyrics(track.title, track.artist);
  }, [track?.title, track?.artist, fetchLyrics]);

  useEffect(() => {
    if (parsedLines.length === 0) return;
    const idx = getActiveLyricIndex(parsedLines, currentTime);
    setActiveIndex(idx);
  }, [currentTime, parsedLines]);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      // Target position: offset so the 5th line (index offset) aligns near top
      const offset = el.offsetTop - container.offsetTop - 160;
      container.scrollTo({ top: offset, behavior: 'smooth' });
    }
  }, [activeIndex]);

  if (!track) return null;

  const hasSynced = parsedLines.length > 0;
  const hasPlain = !!lyricsData?.plainLyrics;

  return (
    <div className="h-full bg-[#0c0c0c] flex flex-col overflow-hidden relative select-none">
      {/* Ambient thumbnail bg */}
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

      {/* Scroll body */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-5 py-4 min-h-0">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-7 h-7 text-[#00F2FE] animate-spin" />
            <p className="text-sm text-white/30">Finding lyrics…</p>
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
              <p className="text-xs text-white/25 mt-1">No lyrics found for this song</p>
            </div>
          </div>
        )}

        {!loading && lyricsData?.error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-400/60">{lyricsData.error}</p>
          </div>
        )}

        {/* Synced LRC lyrics — Silky smooth line highlight without layout reflow */}
        {!loading && hasSynced && (
          <div className="py-44 space-y-1">
            {parsedLines.map((line, i) => {
              const isActive = i === activeIndex;
              const isPast = i < activeIndex;
              return (
                <div
                  key={i}
                  ref={isActive ? activeRef : undefined}
                  onClick={() => onSeek?.(line.time)}
                  className={`
                    group px-3 py-2 rounded-xl cursor-pointer transition-all duration-300 ease-out origin-left border border-transparent
                    ${isActive ? 'bg-white/5 border-white/5 shadow-inner' : 'hover:bg-white/5'}
                  `}
                >
                  <p
                    className={`
                      text-lg font-bold leading-snug tracking-tight transition-all duration-300 ease-out
                      ${isActive
                        ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.45)] scale-[1.02]'
                        : isPast
                        ? 'text-white/20 group-hover:text-white/50 scale-100'
                        : 'text-white/35 group-hover:text-white/70 scale-100'
                      }
                    `}
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
              <span className="text-[10px] text-white/20 uppercase tracking-widest font-semibold">
                Plain Lyrics
              </span>
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
