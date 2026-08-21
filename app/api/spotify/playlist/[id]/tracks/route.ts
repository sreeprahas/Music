import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

async function ids(request: Request): Promise<string[]> {
  const body = await request.json().catch(() => ({})) as { trackIds?: unknown; uris?: unknown };
  const values = Array.isArray(body.trackIds) ? body.trackIds : Array.isArray(body.uris) ? body.uris : [];
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });
  try { const trackIds = await ids(request); if (!trackIds.length) return NextResponse.json({ error: 'At least one track id is required' }, { status: 400 }); await spotify.addTracksToPlaylist(id, trackIds); return NextResponse.json({ success: true }); }
  catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });
  try { const trackIds = await ids(request); if (!trackIds.length) return NextResponse.json({ error: 'At least one track id is required' }, { status: 400 }); await spotify.removeTracksFromPlaylist(id, trackIds); return NextResponse.json({ success: true }); }
  catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); }
}
