import type { Playlist, Track, UserProfile } from '@/types';

export function cleanArtistName(artist?: string): string {
  if (!artist) return '';
  return artist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s+Topic$/i, '')
    .trim();
}

export async function getUserProfile(accessToken: string): Promise<UserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user profile');
  const data = await res.json();
  return {
    name: (data.name as string) || '',
    email: (data.email as string) || '',
    picture: (data.picture as string) || '',
  };
}

// ─── Playlist fetching ───────────────────────────────────────────────────────

export async function getPlaylists(accessToken: string): Promise<Playlist[]> {
  // Run both sources in parallel
  const [owned, ytmLibrary] = await Promise.all([
    getOwnedPlaylists(accessToken),
    getYTMusicLibraryPlaylists(accessToken),
  ]);

  // Merge: LL first, then owned, then YT Music library — dedup by id
  const seen = new Set<string>(['LL']);
  const result: Playlist[] = [
    {
      id: 'LL',
      title: 'Liked Songs',
      description: 'Songs you have liked',
      thumbnailUrl: '',
      trackCount: 0,
    },
  ];

  for (const pl of [...owned, ...ytmLibrary]) {
    if (!seen.has(pl.id)) {
      seen.add(pl.id);
      result.push(pl);
    }
  }

  return result;
}

/** Standard YouTube Data API — returns playlists the authenticated user OWNS */
async function getOwnedPlaylists(accessToken: string): Promise<Playlist[]> {
  const playlists: Playlist[] = [];
  let pageToken = '';
  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlists');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('mine', 'true');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;
    const data = await res.json();

    for (const item of data.items ?? []) {
      playlists.push({
        id: item.id as string,
        title: item.snippet.title as string,
        description: (item.snippet.description as string) || '',
        thumbnailUrl:
          (item.snippet.thumbnails?.high?.url as string) ||
          (item.snippet.thumbnails?.default?.url as string) ||
          '',
        trackCount: (item.contentDetails?.itemCount as number) || 0,
      });
    }
    pageToken = (data.nextPageToken as string) || '';
  } while (pageToken);
  return playlists;
}

/**
 * YouTube Music internal browse API — returns playlists the user has SAVED to
 * their library (created by others). Uses the WEB_REMIX client.
 */
async function getYTMusicLibraryPlaylists(accessToken: string): Promise<Playlist[]> {
  const YTM_BROWSE = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';
  const CLIENT_CONTEXT = {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.01.00',
    hl: 'en',
    gl: 'US',
    platform: 'DESKTOP',
  };

  // browseIds that cover the user's full playlist library
  const browseIds = [
    'FEmusic_library_privately_owned_playlists', // created by user
    'FEmusic_liked_playlists',                   // saved from others
  ];

  const playlists: Playlist[] = [];

  for (const browseId of browseIds) {
    try {
      const res = await fetch(YTM_BROWSE, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Origin: 'https://music.youtube.com',
          Referer: 'https://music.youtube.com/',
          'X-Youtube-Client-Name': '67',
          'X-Youtube-Client-Version': '1.20240101.01.00',
        },
        body: JSON.stringify({
          browseId,
          context: { client: CLIENT_CONTEXT },
        }),
      });

      if (!res.ok) {
        console.error(`[ytmusicApi] YTM browse ${browseId} failed:`, res.status);
        continue;
      }

      const data = await res.json();

      // Recursively find all musicTwoRowItemRenderer objects
      const renderers = findAllByKey(data, 'musicTwoRowItemRenderer');
      for (const renderer of renderers) {
        const title: string = renderer?.title?.runs?.[0]?.text ?? '';
        if (!title) continue;

        const browseEndpoint = renderer?.navigationEndpoint?.browseEndpoint;
        const rawId: string = browseEndpoint?.browseId ?? '';
        // Playlist browse IDs start with "VL"; strip that prefix to get the real ID
        const id = rawId.startsWith('VL') ? rawId.slice(2) : rawId;
        if (!id || id.startsWith('FE')) continue; // skip non-playlist items

        const thumbList: Array<{ url: string; width: number }> =
          renderer?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
          renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
          [];
        const thumbnailUrl = thumbList[thumbList.length - 1]?.url ?? '';

        const subtitleRuns: Array<{ text: string }> =
          renderer?.subtitle?.runs ?? [];
        const subtitle = subtitleRuns.map((r) => r.text).join('');

        playlists.push({ id, title, description: subtitle, thumbnailUrl, trackCount: 0 });
      }
    } catch (err) {
      console.error(`[ytmusicApi] YTM browse ${browseId} error:`, err);
    }
  }

  return playlists;
}

/** Recursively collect every value whose key matches `target` */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findAllByKey(obj: unknown, target: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  if (!obj || typeof obj !== 'object') return results;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === target) results.push(v);
    results.push(...findAllByKey(v, target));
  }
  return results;
}



export async function getPlaylistTracks(
  accessToken: string,
  playlistId: string
): Promise<Track[]> {
  const tracks: Track[] = [];
  let pageToken = '';
  let position = 0;

  if (playlistId === 'LL') {
    // Liked Songs — use playlistItems with the special LL playlist ID
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'snippet,contentDetails');
      url.searchParams.set('playlistId', 'LL');
      url.searchParams.set('maxResults', '50');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        console.error('[ytmusicApi] LL fetch failed:', res.status, await res.text());
        break;
      }
      const data = await res.json();

      for (const item of data.items ?? []) {
        const snippet = item.snippet;
        const videoId = snippet?.resourceId?.videoId as string | undefined;
        if (!videoId) continue;
        const title = snippet.title as string;
        if (title === 'Private video' || title === 'Deleted video') continue;

        tracks.push({
          videoId,
          playlistItemId: item.id as string | undefined,
          dateAdded: snippet.publishedAt as string | undefined,
          title,
          artist: cleanArtistName(
            (snippet.videoOwnerChannelTitle as string) ||
            (snippet.channelTitle as string) ||
            'Unknown Artist'
          ),
          thumbnailUrl:
            (snippet.thumbnails?.high?.url as string) ||
            (snippet.thumbnails?.default?.url as string) ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0,
          position: position++,
        });
      }
      pageToken = (data.nextPageToken as string) || '';
    } while (pageToken);

  } else {
    // Regular playlist via playlistItems
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'snippet,contentDetails');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('maxResults', '50');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) break;
      const data = await res.json();

      for (const item of data.items ?? []) {
        const snippet = item.snippet;
        const videoId = snippet.resourceId?.videoId as string;
        if (!videoId) continue;
        const title = snippet.title as string;
        if (title === 'Private video' || title === 'Deleted video') continue;

        tracks.push({
          videoId,
          playlistItemId: item.id as string | undefined,
          dateAdded: snippet.publishedAt as string | undefined,
          title,
          artist: cleanArtistName(
            (snippet.videoOwnerChannelTitle as string) ||
            (snippet.channelTitle as string) ||
            'Unknown Artist'
          ),
          thumbnailUrl:
            (snippet.thumbnails?.high?.url as string) ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0,
          position: position++,
        });
      }
      pageToken = (data.nextPageToken as string) || '';
    } while (pageToken);
  }

  // Populate durations in batches of 50 via YouTube videos API
  if (tracks.length > 0) {
    try {
      const videoIds = tracks.map((t) => t.videoId);
      for (let i = 0; i < videoIds.length; i += 50) {
        const chunk = videoIds.slice(i, i + 50);
        const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${chunk.join(',')}`;
        const vRes = await fetch(vUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (vRes.ok) {
          const vData = await vRes.json();
          for (const item of vData.items ?? []) {
            const tr = tracks.find((t) => t.videoId === item.id);
            if (tr && item.contentDetails?.duration) {
              tr.duration = parseDuration(item.contentDetails.duration);
            }
          }
        }
      }
    } catch (e) {
      console.error('[ytmusicApi] Error fetching video durations:', e);
    }
  }

  return tracks;
}

function parseDuration(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (
    parseInt(m[1] || '0') * 3600 +
    parseInt(m[2] || '0') * 60 +
    parseInt(m[3] || '0')
  );
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
