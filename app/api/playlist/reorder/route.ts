import { NextResponse } from 'next/server';
import { reorderCachedTracks } from '@/lib/db';
export async function POST(request: Request) {
  const { playlistId, videoIds } = await request.json();
  if (!playlistId || !Array.isArray(videoIds)) return NextResponse.json({ error: 'Missing playlistId or videoIds' }, { status: 400 });
  reorderCachedTracks(playlistId, videoIds);
  return NextResponse.json({ success: true, local: true });
}
