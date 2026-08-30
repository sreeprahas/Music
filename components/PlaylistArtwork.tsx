'use client';

import React from 'react';
import type { Playlist, Track } from '@/types';

/**
 * Derives the first 4 thumbnail sources from track data.
 * Returns an array of { url, videoId } for the first 4 tracks sorted by position.
 */
function getThumbnailsFromTracks(tracks: Track[]): Array<{ url: string; videoId: string }> {
  return tracks
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 4)
    .map((track) => ({
      url: track.thumbnailUrl || '',
      videoId: track.videoId,
    }));
}

export function PlaylistArtwork({
  playlist,
  tracks,
  className = '',
}: {
  playlist: Playlist;
  tracks?: Track[];
  className?: string;
}) {
  // The pre-computed `playlist.thumbnailUrls` is now the composite cover URL
  // (a single entry when four track tiles are available) or an array of
  // individual track thumbnail URLs (fallback when fewer than four tiles exist).
  const precomputed = playlist.thumbnailUrls || [];

  // Heuristic: the composite endpoint is always a single URL ending in /cover.
  // Individual track thumbnails are the per-track API URL with ?v=...&playlistId=...
  const compositeUrl =
    precomputed.length === 1 && precomputed[0].includes('/cover')
      ? precomputed[0]
      : null;

  // Use passed-in tracks if available, otherwise fall back to pre-computed playlist metadata
  const tiles = tracks
    ? getThumbnailsFromTracks(tracks)
    : (precomputed || []).map((url, i) => ({ url, videoId: (playlist.thumbnailVideoIds || [])[i] || '' }));

  const hasExplicitCover = playlist.thumbnailUrl && tiles.length === 0 && !compositeUrl;

  // Single composite cover image (1280x1280 lossless WebP, generated on the
  // server from the first four cached track thumbnails).
  if (compositeUrl) {
    return (
      <div className={`h-full w-full aspect-square overflow-hidden bg-background ${className}`}>
        <img
          src={compositeUrl}
          alt=""
          className="h-full w-full aspect-square object-cover"
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  // Single dedicated cover image — no track thumbnails available
  if (hasExplicitCover) {
    return (
      <div className={`h-full w-full aspect-square overflow-hidden bg-background ${className}`}>
        <img
          src={playlist.thumbnailUrl}
          alt=""
          className="h-full w-full aspect-square object-cover"
        />
      </div>
    );
  }

  // 2×2 grid of track thumbnails (or placeholders) — fallback when fewer
  // than 4 track tiles are available so the composite cannot be built yet.
  return (
    <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden bg-background ${className}`}>
      {Array.from({ length: 4 }, (_, index) => {
        const thumb = tiles[index];
        const src = thumb?.url || (thumb?.videoId ? `/api/thumbnail?v=${encodeURIComponent(thumb.videoId)}` : '');
        return src ? (
          <img
            key={index}
            src={src}
            alt=""
            className="h-full w-full aspect-square object-cover"
          />
        ) : (
          <div key={index} className="bg-surface" />
        );
      })}
    </div>
  );
}
