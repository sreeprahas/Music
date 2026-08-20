'use client';

import React, { useEffect, useState } from 'react';
import type { Track } from '@/types';
import { Disc3, Loader2, Play, UserRound, X } from 'lucide-react';

interface Props {
  kind: 'album' | 'artist';
  id: string;
  onClose: () => void;
  onPlay: (track: Track, queue: Track[]) => void;
}

type Album = {
  id: string;
  name: string;
  release_date?: string;
  images?: Array<{ url: string }>;
  artists?: Array<{ id: string; name: string }>;
};

type Artist = {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  genres?: string[];
  popularity?: number;
};

export function SpotifyDetailsModal({ kind, id, onClose, onPlay }: Props) {
  const [data, setData] = useState<Album | Artist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch(`/api/spotify/${kind}/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setError(result.error || `Unable to load ${kind}`);
        return;
      }
      setData(kind === 'album' ? result.album : result.artist);
      if (kind === 'album') setTracks(Array.isArray(result.tracks) ? result.tracks : []);
    };
    void load().catch(() => {
      if (!cancelled) setError(`Unable to load ${kind}`);
    });
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  const image = data?.images?.[0]?.url || '/music-icon.png';
  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-shadow/80">
        <header className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              {kind === 'album' ? <Disc3 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Spotify {kind}</p>
              <h2 className="text-lg font-black text-text">{data?.name || 'Loading...'}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted hover:bg-surface-hover hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-thin">
          {!data && !error && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Spotify data...
            </div>
          )}
          {error && <p className="rounded-2xl border border-error/20 bg-error/5 p-4 text-sm text-error">{error}</p>}
          {data && kind === 'album' && (
            <>
              <div className="mb-6 flex items-center gap-4">
                <img src={image} alt="" className="h-24 w-24 rounded-2xl object-cover" />
                <div>
                  <p className="text-sm text-text-secondary">
                    {(data as Album).artists?.map((artist) => artist.name).join(', ')}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {(data as Album).release_date || 'Release date unavailable'} • {tracks.length} tracks
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                {tracks.map((track, index) => (
                  <button
                    key={`${track.spotifyId || track.title}-${index}`}
                    type="button"
                    onClick={() => onPlay(track, tracks)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface"
                  >
                    <span className="w-5 text-xs text-text-disabled">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">{track.title}</span>
                      <span className="block truncate text-xs text-text-muted">{track.artist}</span>
                    </span>
                    <Play className="h-4 w-4 text-text-disabled" />
                  </button>
                ))}
              </div>
            </>
          )}
          {data && kind === 'artist' && (
            <div className="flex flex-col items-center py-6 text-center">
              <img src={image} alt="" className="h-32 w-32 rounded-full object-cover" />
              <h3 className="mt-4 text-2xl font-black text-text">{data.name}</h3>
              <p className="mt-2 text-sm text-text-muted">
                {(data as Artist).genres?.join(' • ') || 'Genres unavailable'}
              </p>
              {typeof (data as Artist).popularity === 'number' && (
                <p className="mt-2 text-xs text-text-disabled">Popularity {(data as Artist).popularity}/100</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
