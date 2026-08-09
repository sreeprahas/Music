import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playlistId, playlistItemId, videoId } = await request.json();
    if (!playlistId || (!playlistItemId && !videoId)) {
      return NextResponse.json({ error: 'Missing playlistId and track identifier' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let { accessToken, refreshToken, expiresAt } = session;
    if (Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed) accessToken = refreshed.accessToken;
    }

    let itemId = playlistItemId as string | undefined;
    if (!itemId) {
      const lookup = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      lookup.searchParams.set('part', 'id');
      lookup.searchParams.set('playlistId', playlistId);
      lookup.searchParams.set('videoId', videoId);
      lookup.searchParams.set('maxResults', '1');
      const lookupResponse = await fetch(lookup.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const lookupData = await lookupResponse.json().catch(() => ({}));
      itemId = lookupData.items?.[0]?.id as string | undefined;
    }

    if (!itemId) return NextResponse.json({ error: 'Song was not found in this playlist' }, { status: 404 });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?id=${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: data?.error?.message || 'Failed to remove song from playlist' },
        { status: response.status }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to remove song from playlist' }, { status: 500 });
  }
}
