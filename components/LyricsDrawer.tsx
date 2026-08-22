'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Track } from '@/types';
import { X, Music2, Image as ImageIcon } from 'lucide-react';
import { parseLRC, getActiveLyricIndex } from '@/lib/lyrics';
import type { LyricLine } from '@/lib/lyrics';
import { getThumbnailUrl, getTrackThumbnailUrl } from '@/lib/ytmusicFormat';
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
  const [palette, setPalette] = useState(['var(--color-background-tertiary)', 'var(--color-background-secondary)', 'var(--color-background)']);
  const [imageTheme, setImageTheme] = useState(true);

  useEffect(() => {
    if (!track?.thumbnailUrl) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        const buckets = new Map<string, number>();
        for (let i = 0; i < pixels.length; i += 16) {
          const r = Math.floor(pixels[i] / 32) * 32;
          const g = Math.floor(pixels[i + 1] / 32) * 32;
          const b = Math.floor(pixels[i + 2] / 32) * 32;
          const key = `${r},${g},${b}`;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        const colors = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => {
          const [r, g, b] = key.split(',').map(Number);
          return `rgb(${r}, ${g}, ${b})`;
        });
        if (colors.length > 0) setPalette(colors);
      } catch { /* Some browser image policies can block canvas sampling. */ }
    };
    image.src = getTrackThumbnailUrl(track);
    return () => { cancelled = true; };
  }, [track?.thumbnailUrl, track?.videoId, track?.sourceTrackId]);

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
    <div className="h-full flex flex-col overflow-hidden relative select-none" style={{ background: imageTheme ? `linear-gradient(135deg, ${palette[0]} 0%, var(--color-background) 58%, ${palette[1] || palette[0]} 100%)` : 'var(--color-background)' }}>
      {/* Ambient bg */}
      <div className={`ambient-art absolute inset-0 opacity-[0.18] pointer-events-none z-0 ${imageTheme ? '' : 'hidden'}`}>
        {track && (
          <img
            src={getTrackThumbnailUrl(track)}
            alt=""
            className="w-full h-full object-cover blur-xl scale-150"
          />
        )}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-accent" />
          <span className="text-sm font-bold text-text tracking-tight">Lyrics</span>
          {lyricsData?.artistName && (
            <span className="text-xs text-text-disabled truncate max-w-[120px]">— {lyricsData.artistName}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setImageTheme((enabled) => !enabled)}
            className={`p-1.5 rounded-full transition-all ${imageTheme ? 'text-accent bg-surface' : 'text-text-disabled hover:text-text hover:bg-surface'}`}
            title={imageTheme ? 'Use normal lyrics theme' : 'Use song image theme'}
            aria-label="Toggle lyrics background theme"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-full text-text-disabled hover:text-text hover:bg-surface transition-all" aria-label="Close lyrics">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-5 py-4 min-h-0 [scrollbar-color:transparent_transparent]">
        {loading && (
          <div className="h-full w-full"><Skeleton className="h-full w-full rounded-none" /></div>
        )}

        {!loading && lyricsData?.notFound && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-14 h-14 rounded-xl overflow-hidden opacity-50">
              <img
                src={getTrackThumbnailUrl(track)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-muted">{track.title}</p>
              <p className="text-xs text-text-disabled mt-1">No lyrics found</p>
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
                    isActive ? 'bg-surface border-border-subtle shadow-inner' : 'hover:bg-surface'
                  }`}
                >
                  <p
                    className={`text-base sm:text-lg font-bold leading-snug tracking-tight transition-all duration-300 ease-out break-words ${
                      isActive
                        ? 'text-text drop-shadow-text'
                        : isPast
                        ? 'text-text-disabled group-hover:text-text-muted'
                        : 'text-text-muted group-hover:text-text-secondary'
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
              <div className="h-px flex-1 bg-surface" />
              <span className="text-[10px] text-text-disabled uppercase tracking-widest font-semibold">Plain Lyrics</span>
              <div className="h-px flex-1 bg-surface" />
            </div>
            {lyricsData!.plainLyrics!.split('\n').map((line, i) => (
              <p
                key={i}
                className={`text-base font-semibold leading-relaxed transition-colors ${
                  line.trim() === '' ? 'my-2' : 'text-text-secondary hover:text-text cursor-default'
                }`}
              >
                {line.trim() === '' ? '\u00A0' : line}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Now playing footer */}
      <div className="relative z-10 border-t border-border px-5 py-3 shrink-0 flex items-center gap-3 bg-overlay/30">
        <div className="w-8 h-8 rounded-md overflow-hidden shrink-0">
          <img
            src={getTrackThumbnailUrl(track)}
            alt={track.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text-secondary truncate">{track.title}</p>
          <p className="text-[10px] text-text-disabled truncate">{track.artist}</p>
        </div>
        <div className="flex items-end gap-[2px] h-3 shrink-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[2px] bg-accent rounded-full animate-music-bar" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
