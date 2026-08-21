import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ profile: await spotify.getProfile(), cached: false });
  } catch (error) {
    return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) });
  }
}
