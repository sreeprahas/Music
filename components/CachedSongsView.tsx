'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { Track } from '@/types';
import { Play, Trash2, HardDriveDownload, Loader2, Music } from 'lucide-react';
import { cleanArtistName, formatDuration, getTrackThumbnailUrl } from '@/lib/ytmusicFormat';
import { Skeleton } from './Skeleton';
import { useDelayedLoading } from './useDelayedLoading';

type CachedSong = Track & { playlistTitle?: string };

interface Props {
  onPlay: (track: Track, queue: Track[]) => void;
  onDeleteTrack?: (track: Track) => void;
}

/**
 * Full-page view listing every locally cached (downloaded) song.
 * Opened via the "Cached Songs" entry at the end of the sidebar.
 */
export function CachedSongsView({ onPlay, onDeleteTrack }: Props) {
  const [songs, setSongs] = useState<CachedSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const showSkeleton = useDelayedLoading(loading);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cached-songs', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load cached songs');
      setSongs(Array.isArray(data.songs) ? data.songs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cached songs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(async (track: Track) => {
    if (!onDeleteTrack) return;
    setDeletingIds((prev) => new Set(prev).add(track.videoId));
    try {
      onDeleteTrack(track);
      setSongs((prev) => prev.filter((song) => song.videoId !== track.videoId));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(track.videoId);
        return next;
      });
    }
  }, [onDeleteTrack]);

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="px-8 py-8">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-accent/15 shadow-accent-soft">
            <HardDriveDownload className="h-7 w-7 text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text">Cached Songs</h1>
            <p className="mt-1 text-sm text-text-muted">
              {loading && !showSkeleton
                ? 'Loading your offline library…'
                : showSkeleton
                  ? 'Loading your offline library…'
                  : `${songs.length} ${songs.length === 1 ? 'song' : 'songs'} available offline`}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {showSkeleton ? (
          <div className="space-y-1">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex min-h-16 items-center gap-4 rounded-xl px-3 py-2">
                <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-3 w-12 shrink-0" />
                <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        ) : loading ? null : songs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
            <Music className="mx-auto h-10 w-10 text-text-disabled" />
            <p className="mt-4 text-sm font-semibold text-text">No cached songs yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Songs you stream are cached automatically for offline playback.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {songs.map((song, index) => (
              <div
                key={song.videoId}
                className="group flex min-h-16 items-center gap-4 rounded-xl px-3 py-2 transition-colors hover:bg-surface-hover"
              >
                <span className="w-6 shrink-0 text-right text-xs text-text-disabled group-hover:hidden">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onPlay(song, songs)}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent group-hover:flex hover:bg-accent/15"
                  aria-label={`Play ${song.title}`}
                >
                  <Play className="h-4 w-4 fill-current" />
                </button>

                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface">
                  <img
                    src={getTrackThumbnailUrl(song)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{song.title}</p>
                  <p className="truncate text-xs text-text-muted">
                    {cleanArtistName(song.artist)}
                    {song.playlistTitle ? ` • ${song.playlistTitle}` : ''}
                  </p>
                </div>

                <span className="shrink-0 text-xs text-text-disabled">
                  {song.duration ? formatDuration(song.duration) : ''}
                </span>

                {onDeleteTrack && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(song)}
                    disabled={deletingIds.has(song.videoId)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted opacity-0 transition-all hover:bg-error/10 hover:text-error group-hover:opacity-100 disabled:opacity-40"
                    aria-label={`Remove cached copy of ${song.title}`}
                    title="Remove cached song"
                  >
                    {deletingIds.has(song.videoId) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}