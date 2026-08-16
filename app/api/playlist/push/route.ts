import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getCachedTracks } from '@/lib/db';
import { addPlaylistItem, createPlaylist } from '@/lib/ytmusicApi';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in to push playlists to YouTube Music.' }, { status: 401 });
  }

  let { accessToken, refreshToken, expiresAt } = session;
  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
  }

  const body = await request.json().catch(() => ({}));
  const playlistTitle = body.title || 'Pushed Playlist';
  const playlistDescription = body.description || 'Pushed from YouTube Music Personal';

  try {
    const ytmSession = { accessToken, refreshToken, expiresAt };
    const newPlaylistId = await createPlaylist(ytmSession, playlistTitle, playlistDescription);

    // 2. Fetch tracks for the source playlist
    const localTracks = Array.from(
      new Map((getCachedTracks(playlistId, session.email) || []).filter((track) => track.videoId).map((track) => [track.videoId, track])).values()
    );
    
    // 3. Add items to the new playlist
    let addedCount = 0;
    for (const track of localTracks) {
      if (!track.videoId) continue;
      try {
        await addPlaylistItem(ytmSession, newPlaylistId, track.videoId);
        addedCount++;
      } catch (e) {
        console.error(`[api/playlist/push] Error adding track ${track.videoId}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      newPlaylistId,
      addedCount,
      totalTracks: localTracks.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
