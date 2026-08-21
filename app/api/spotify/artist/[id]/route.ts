import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json({ artist: await spotify.getArtist((await params).id) }); } catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); } }
