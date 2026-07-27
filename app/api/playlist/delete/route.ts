import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { deleteCachedPlaylist } from '@/lib/db';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  // Remove from local cache
  deleteCachedPlaylist(playlistId);

  // If user is authenticated, attempt YouTube API delete
  const session = await getSession();
  if (session) {
    let { accessToken, refreshToken, expiresAt } = session;
    if (Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed) accessToken = refreshed.accessToken;
    }

    try {
      const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?id=${encodeURIComponent(playlistId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!ytRes.ok) {
        console.warn(`[api/playlist/delete] YouTube API delete failed for ${playlistId}: status ${ytRes.status}`);
      }
    } catch (e) {
      console.warn(`[api/playlist/delete] Network error deleting playlist ${playlistId}:`, e);
    }
  }

  return NextResponse.json({ success: true, playlistId });
}
