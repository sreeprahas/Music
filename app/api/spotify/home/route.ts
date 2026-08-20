import { NextResponse } from 'next/server';
import { spotifyGraphQl } from '@/lib/spotify/graphql-client';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ data: await spotifyGraphQl.getHome(), cached: false, source: 'graphql' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Home lookup failed' }, { status: 500 });
  }
}
