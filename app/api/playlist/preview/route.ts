import { NextResponse } from 'next/server';
import { previewPlaylistUrl } from '@/lib/playlistImporter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string };
    if (typeof body.url !== 'string' || body.url.length > 2000) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    // Fetch playlist metadata only — no YouTube matching, no thumbnail downloads.
    // This is fast and gives us the track list for preview.
    const preview = await previewPlaylistUrl(body.url);
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview failed' },
      { status: 500 },
    );
  }
}
