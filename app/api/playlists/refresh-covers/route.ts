import { NextResponse } from 'next/server';
import { getLocalPlaylists, getCachedTracks, refreshPlaylistCoverArt } from '@/lib/db';
import type { Playlist } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/playlists/refresh-covers
 *
 * Regenerates every playlist's cover artwork from its current tracks.
 * Called once on every app open so covers always reflect the latest
 * artwork renditions and playlist contents.
 */
export async function POST() {
  try {
    const playlists = getLocalPlaylists();
    const refreshed: Playlist[] = [];

    // Sequential to keep thumbnail download concurrency bounded.
    for (const playlist of playlists) {
      try {
        const updated = await refreshPlaylistCoverArt(playlist.id, getCachedTracks(playlist.id));
        if (updated) refreshed.push(updated);
      } catch {
        // A single failing playlist must not abort the whole refresh.
      }
    }

    return NextResponse.json({ success: true, playlists: refreshed.length, refreshedPlaylists: refreshed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cover refresh failed' }, { status: 500 });
  }
}