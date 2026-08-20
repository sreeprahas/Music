import { NextResponse } from 'next/server';
import { saveManualOverride } from '@/lib/matching/spotify-youtube';
import { cacheKey } from '@/lib/cache/keys';
import { deletePersistent, getPersistent } from '@/lib/cache/persistent';

function extractVideoId(value: string): string | null {
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
  } catch { return null; }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('spotifyId');
  if (!id) return NextResponse.json({ error: 'Missing spotifyId' }, { status: 400 });
  return NextResponse.json({ override: getPersistent(cacheKey.override(id)) || null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { spotifyId?: string; youtubeUrl?: string };
    const videoId = body.youtubeUrl ? extractVideoId(body.youtubeUrl) : null;
    if (!body.spotifyId || !videoId) return NextResponse.json({ error: 'Valid Spotify ID and YouTube URL are required' }, { status: 400 });
    saveManualOverride(body.spotifyId, videoId);
    return NextResponse.json({ success: true, videoId });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Override save failed' }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('spotifyId');
  if (!id) return NextResponse.json({ error: 'Missing spotifyId' }, { status: 400 });
  deletePersistent(cacheKey.override(id));
  deletePersistent(cacheKey.match(id));
  return NextResponse.json({ success: true });
}
