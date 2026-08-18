import { NextResponse } from 'next/server';
import { removeCachedTrack } from '@/lib/db';
export async function POST(request: Request) {
  const { playlistId, videoId } = await request.json();
  if (!playlistId || !videoId) return NextResponse.json({ error: 'Missing playlistId or videoId' }, { status: 400 });
  removeCachedTrack(playlistId, videoId);
  return NextResponse.json({ success: true, local: true });
}
