import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });
  try { await spotify.savePlaylist(id); return NextResponse.json({ success: true }); }
  catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });
  try { await spotify.removePlaylist(id); return NextResponse.json({ success: true }); }
  catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); }
}
