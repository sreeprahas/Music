import { NextResponse } from 'next/server';
import { getLocalPlaylists } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ playlists: getLocalPlaylists(), local: true });
}
