'use client';

import React from 'react';
import type { Playlist } from '@/types';

export function PlaylistArtwork({ playlist, className = '' }: { playlist: Playlist; className?: string }) {
  const thumbnailUrls = (playlist.thumbnailUrls || []).slice(0, 4);
  const videoIds = (playlist.thumbnailVideoIds || []).slice(0, 4);

  // If playlist has a dedicated cover image and no tracks yet
  if (playlist.thumbnailUrl && thumbnailUrls.length === 0 && videoIds.length === 0) {
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

  return (
    <div className={`grid h-full w-full aspect-square grid-cols-2 grid-rows-2 overflow-hidden bg-background ${className}`}>
      {Array.from({ length: 4 }, (_, index) => {
        const url = thumbnailUrls[index];
        const videoId = videoIds[index];
        const src = url || (videoId ? `/api/thumbnail?v=${encodeURIComponent(videoId)}` : '');
        return src ? (
          <img
            key={index}
            src={src}
            alt=""
            className="h-full w-full aspect-square object-cover"
          />
        ) : <div key={index} className="bg-surface" />;
      })}
    </div>
  );
}
