'use client';

import React from 'react';
import type { Playlist } from '@/types';

export function PlaylistArtwork({ playlist, className = '' }: { playlist: Playlist; className?: string }) {
  const tiles = (playlist.thumbnailUrls || []).filter(Boolean).slice(0, 4);
  const videoIds = (playlist.thumbnailVideoIds || []).slice(0, 4);
  // Use 2x2 collage only when all four artworks are available.
  const hasCompleteArtwork = tiles.length >= 4 && videoIds.length >= 4;

  if (hasCompleteArtwork) {
    const sources = Array.from({ length: 4 }, (_, index) =>
      videoIds[index] ? `/api/thumbnail?v=${encodeURIComponent(videoIds[index])}` : ''
    );
    return (
      <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden ${className}`}>
        {sources.map((src, index) =>
          src
            ? <img key={`${src}-${index}`} src={src} alt="" className="h-full w-full aspect-square object-cover" />
            : <div key={index} className="bg-black" />
        )}
      </div>
    );
  }

  // Single-image fallback: use local playlist-thumbnail API (download-then-serve)
  const singleVideoId = videoIds[0];
  const singleUrl = singleVideoId
    ? `/api/thumbnail?v=${encodeURIComponent(singleVideoId)}`
    : playlist.id
    ? `/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}`
    : '';

  if (singleUrl) {
    return (
      <div className={`h-full w-full aspect-square overflow-hidden ${className}`}>
        <img src={singleUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  // No artwork available yet — show skeleton
  return (
    <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden bg-black ${className}`}>
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="bg-[#111214] animate-pulse" />)}
    </div>
  );
}
