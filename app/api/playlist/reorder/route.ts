import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playlistId, videoIds } = await request.json();
    if (!playlistId || !Array.isArray(videoIds)) {
      return NextResponse.json({ error: 'Missing playlistId or videoIds array' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let { accessToken, refreshToken, expiresAt } = session;
    if (Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed) accessToken = refreshed.accessToken;
    }

    // 1. Fetch current items in YouTube playlist to get playlistItemIds
    const listRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=id,snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!listRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch YouTube playlist items' }, { status: listRes.status });
    }

    const listData = await listRes.json();
    const items = listData.items || [];
    const itemMap = new Map<string, string>(); // videoId -> playlistItemId
    items.forEach((it: any) => {
      if (it.snippet?.resourceId?.videoId && it.id) {
        itemMap.set(it.snippet.resourceId.videoId, it.id);
      }
    });

    // 2. Only update items whose index position actually changed, in parallel via Promise.all
    const updatePromises = videoIds.map(async (vId: string, newPosition: number) => {
      const pItemId = itemMap.get(vId);
      if (!pItemId) return false;

      // Check current position in fetched items list
      const currentItemIndex = items.findIndex((it: any) => it.snippet?.resourceId?.videoId === vId);
      if (currentItemIndex === newPosition) return true; // Position unchanged, skip API call!

      try {
        const updateRes = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: pItemId,
            snippet: {
              playlistId,
              resourceId: { kind: 'youtube#video', videoId: vId },
              position: newPosition,
            },
          }),
        });
        return updateRes.ok;
      } catch {
        return false;
      }
    });

    const results = await Promise.all(updatePromises);
    const updatedCount = results.filter(Boolean).length;

    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reorder playlist' },
      { status: 500 }
    );
  }
}
