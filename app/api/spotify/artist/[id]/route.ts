import { NextResponse } from 'next/server';
import { spotifyGraphQl } from '@/lib/spotify/graphql-client';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json({ artist: await spotifyGraphQl.getArtist((await params).id) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Artist lookup failed' }, { status: 500 }); } }
