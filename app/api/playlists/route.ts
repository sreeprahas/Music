import { NextResponse } from 'next/server';
import { getLocalPlaylists } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const t0 = Date.now();
  const result = { playlists: getLocalPlaylists(), local: true };
  console.log(`[${new Date().toLocaleTimeString('en-US', {hour12:false})}] [api/playlists] duration=${Date.now()-t0}ms`);
  return NextResponse.json(result);
}
