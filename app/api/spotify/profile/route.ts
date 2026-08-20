import { NextResponse } from 'next/server';
import { getPersistent } from '@/lib/cache/persistent';
import { spotifyGraphQl } from '@/lib/spotify/graphql-client';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ profile: await spotifyGraphQl.getProfile(), cached: false });
  } catch {
    return NextResponse.json({ profile: getPersistent('spotify:profile') || null, cached: true });
  }
}
