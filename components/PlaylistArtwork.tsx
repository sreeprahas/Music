'use client';

import React from 'react';
import type { Playlist } from '@/types';

export function PlaylistArtwork({ playlist, className = '' }: { playlist: Playlist; className?: string }) {
  const videoIds = (playlist.thumbnailVideoIds || []).slice(0, 4);
  return (
    <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden bg-background ${className}`}>
      {Array.from({ length: 4 }, (_, index) => {
        const videoId = videoIds[index];
        return videoId ? (
          <img
            key={`${videoId}-${index}`}
            src={`/api/thumbnail?v=${encodeURIComponent(videoId)}`}
            alt=""
            className="h-full w-full aspect-square object-cover"
          />
        ) : <div key={index} className="bg-surface" />;
      })}
    </div>
  );
}
