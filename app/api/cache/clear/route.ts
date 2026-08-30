/**
 * POST /api/cache/clear
 *
 * Wipes every in-memory playback cache so the next play re-resolves the
 * stream URL and the matcher re-reads the spotify_youtube_map. Recovery
 * button for "I changed the YouTube override but the player is still using
 * the old source" — does NOT touch downloaded songs, on-disk stream cache,
 * or manual override mappings.
 */
import { NextResponse } from 'next/server';
import { clearStreamUrlCache } from '@/lib/downloader';
import { clearPersistentPrefix } from '@/lib/cache/persistent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  // 1. In-memory stream URL cache (the one PlayerBar uses for direct playback).
  clearStreamUrlCache();

  // 2. Persistent entity cache: drop youtube video metadata + match results
  //    so the matcher re-reads the (just-updated) manual override mappings.
  clearPersistentPrefix('youtube:video:');
  clearPersistentPrefix('match:');

  return NextResponse.json({
    success: true,
    clearedAt: Date.now(),
  });
}
