import { downloadTrack, deleteTrack } from '@/lib/downloader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const { videoId, title, artist, action } = await request.json();

    if (!videoId || typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return new Response('Missing videoId', { status: 400 });
    }

    if (action === 'delete') {
      const ok = deleteTrack(videoId);
      return new Response(JSON.stringify({ success: ok }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default action: download individual track
    await downloadTrack(videoId, title, artist, request.signal);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    let message = err instanceof Error ? err.message : 'Track processing failed';
    if (message.includes('ENOTFOUND') || message.includes('fetch failed') || message.includes('Unable to download API page')) {
      message = 'Download failed: No internet connection available.';
    }
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
