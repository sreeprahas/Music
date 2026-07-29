import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';

export const dynamic = 'force-dynamic';

function getCachePath() {
  return path.join(getDataDir(), 'user_cache.json');
}

function ensureCacheFile() {
  const CACHE_PATH = getCachePath();
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CACHE_PATH)) {
    const initialData = {
      user: {
        email: 'minecraftprahas@gmail.com',
        name: 'Prahas',
        image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        plan: 'Pro Listener',
      },
      playlists: [],
      tracks: {},
      likedTrackIds: [],
      recentlyPlayedIds: [],
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function readCache() {
  ensureCacheFile();
  try {
    const CACHE_PATH = getCachePath();
    const content = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return { playlists: [], tracks: {}, likedTrackIds: [], recentlyPlayedIds: [] };
  }
}

function writeCache(data: any) {
  ensureCacheFile();
  const CACHE_PATH = getCachePath();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  const cache = readCache();
  return NextResponse.json(cache);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, name, description, coverUrl, trackId, track, url } = body;
    const cache = readCache();

    if (action === 'create_playlist') {
      const newPlaylist = {
        id: `p-${Date.now()}`,
        name: name || 'New Playlist',
        description: description || 'Custom personal playlist',
        coverUrl: coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
        trackIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      cache.playlists.push(newPlaylist);
      writeCache(cache);
      return NextResponse.json({ success: true, playlist: newPlaylist, library: cache });
    }

    if (action === 'toggle_like') {
      if (!cache.likedTrackIds) cache.likedTrackIds = [];
      const isLiked = cache.likedTrackIds.includes(trackId);
      if (isLiked) {
        cache.likedTrackIds = cache.likedTrackIds.filter((id: string) => id !== trackId);
        if (cache.tracks[trackId]) cache.tracks[trackId].liked = false;
      } else {
        cache.likedTrackIds.push(trackId);
        if (cache.tracks[trackId]) cache.tracks[trackId].liked = true;
      }
      writeCache(cache);
      return NextResponse.json({ success: true, liked: !isLiked, library: cache });
    }

    if (action === 'add_track' && track) {
      cache.tracks[track.id] = track;
      writeCache(cache);
      return NextResponse.json({ success: true, track, library: cache });
    }

    if (action === 'record_history' && trackId) {
      cache.recentlyPlayedIds = [trackId, ...(cache.recentlyPlayedIds || []).filter((id: string) => id !== trackId)].slice(0, 30);
      writeCache(cache);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('playlistId');
    const trackId = searchParams.get('trackId');

    const cache = readCache();

    if (playlistId) {
      cache.playlists = cache.playlists.filter((p: any) => p.id !== playlistId);
      writeCache(cache);
      return NextResponse.json({ success: true, library: cache });
    }

    if (trackId) {
      if (cache.tracks[trackId]) {
        delete cache.tracks[trackId];
      }
      cache.playlists.forEach((p: any) => {
        p.trackIds = p.trackIds.filter((id: string) => id !== trackId);
      });
      cache.likedTrackIds = (cache.likedTrackIds || []).filter((id: string) => id !== trackId);
      cache.recentlyPlayedIds = (cache.recentlyPlayedIds || []).filter((id: string) => id !== trackId);
      writeCache(cache);
      return NextResponse.json({ success: true, library: cache });
    }

    return NextResponse.json({ error: 'Missing playlistId or trackId parameter' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
