'use client';

import React from 'react';
import type { Playlist } from '@/types';

export function PlaylistArtwork({ playlist, className = '' }: { playlist: Playlist; className?: string }) {
  const tiles = (playlist.thumbnailUrls || []).filter(Boolean).slice(0, 4);
  const videoIds = (playlist.thumbnailVideoIds || []).slice(0, 4);
  // Never duplicate the first song or substitute a single cover into the
  // collage. Until all four song artworks are available, keep four stable
  // loading cells so the finished grid is always songs 1–4.
  const hasCompleteArtwork = tiles.length >= 4 && videoIds.length >= 4;
  const sources = Array.from({ length: 4 }, (_, index) => hasCompleteArtwork && tiles[index] && videoIds[index]
    ? `/api/thumbnail?videoId=${encodeURIComponent(videoIds[index])}&url=${encodeURIComponent(tiles[index])}`
    : '');
  if (sources.some(Boolean)) {
    return <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden ${className}`}>
      {sources.map((src, index) => src ? <img key={`${src}-${index}`} src={src} alt="" className="h-full w-full aspect-square object-cover" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = tiles[index]; }} /> : <div key={index} className="bg-black" />)}
    </div>;
  }
  return <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden bg-black ${className}`}>
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="bg-[#111214] animate-pulse" />)}
  </div>;
}
