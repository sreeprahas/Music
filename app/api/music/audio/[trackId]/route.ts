import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { MusicService } from '@/lib/music/spotiflac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { flac: 'audio/flac', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };

export async function GET(request: Request, context: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await context.params;
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) return NextResponse.json({ error: 'TRACK_NOT_FOUND' }, { status: 404 });
  const filename = await MusicService.resolveLocalAudio({ spotifyId: trackId, title: new URL(request.url).searchParams.get('title') || '' });
  if (!filename) return NextResponse.json({ error: 'TRACK_NOT_FOUND', message: 'Track is not present in the configured SpotiFLAC download directory.' }, { status: 404 });
  const stat = await fs.promises.stat(filename);
  const extension = filename.split('.').pop()?.toLowerCase() || 'flac';
  const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': TYPES[extension] || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'Content-Length': String(stat.size) });
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    const start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(Readable.toWeb(fs.createReadStream(filename, { start, end })) as ReadableStream, { status: 206, headers });
  }
  return new Response(Readable.toWeb(fs.createReadStream(filename)) as ReadableStream, { headers });
}

export async function HEAD(request: Request, context: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await context.params;
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) return new Response(null, { status: 404 });
  const filename = await MusicService.resolveLocalAudio({ spotifyId: trackId, title: new URL(request.url).searchParams.get('title') || '' });
  if (!filename) return new Response(null, { status: 404 });
  const stat = await fs.promises.stat(filename);
  const extension = filename.split('.').pop()?.toLowerCase() || 'flac';
  return new Response(null, { headers: { 'Accept-Ranges': 'bytes', 'Content-Type': TYPES[extension] || 'application/octet-stream', 'Content-Length': String(stat.size), 'Cache-Control': 'private, no-store' } });
}
