import { NextResponse } from 'next/server';
import { MusicService } from '@/lib/music/spotiflac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await MusicService.health();
  return NextResponse.json({ app: 'running', spotiflac: result.available ? 'available' : 'unavailable', ...result }, { status: result.available ? 200 : 503 });
}
