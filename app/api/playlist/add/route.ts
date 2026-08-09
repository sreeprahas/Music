import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playlistId, videoId } = await request.json();
    if (!playlistId || !videoId) {
      return NextResponse.json({ error: 'Missing playlistId or videoId' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let { accessToken, refreshToken, expiresAt } = session;
    if (Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed) accessToken = refreshed.accessToken;
    }

    const response = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId },
        },
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: data?.error?.message || 'Failed to add song to playlist' },
        { status: response.status }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to add song to playlist' }, { status: 500 });
  }
}
