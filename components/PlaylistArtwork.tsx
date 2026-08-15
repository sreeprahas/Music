'use client';

import React from 'react';
import type { Playlist } from '@/types';

export function PlaylistArtwork({ playlist, className = '' }: { playlist: Playlist; className?: string }) {
  const tiles = (playlist.thumbnailUrls || []).filter(Boolean).slice(0, 4);
  const videoIds = (playlist.thumbnailVideoIds || []).slice(0, 4);
  if (tiles.length >= 4 && videoIds.length >= 4) {
    return <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden ${className}`}>
      {tiles.map((url, index) => <img key={`${url}-${index}`} src={`/api/thumbnail?videoId=${encodeURIComponent(videoIds[index])}&url=${encodeURIComponent(url)}&crop=2`} alt="" className="h-full w-full aspect-square object-cover" />)}
    </div>;
  }
  return <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden bg-black ${className}`}>
    {tiles.map((url, index) => <img key={`${url}-${index}`} src={`/api/thumbnail?videoId=${encodeURIComponent(videoIds[index] || '')}&url=${encodeURIComponent(url)}&crop=2`} alt="" className="h-full w-full aspect-square object-cover" />)}
  </div>;
}
