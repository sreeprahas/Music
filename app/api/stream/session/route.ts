import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createPlaybackSession, renewPlaybackSession } from '@/lib/sessionStreamAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const sessionData = await getSession();
    if (!sessionData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { videoId } = body;

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 });
    }

    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const session = createPlaybackSession(videoId, clientIp, sessionData.email);
    if (!session) {
      return NextResponse.json({ error: 'Too many active playback sessions' }, { status: 429 });
    }

    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Failed to create playback session' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const sessionData = await getSession();
    if (!sessionData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, token } = body;

    if (!sessionId || !token) {
      return NextResponse.json({ error: 'Missing sessionId or token' }, { status: 400 });
    }

    const renewed = renewPlaybackSession(sessionId, token, sessionData.email);
    if (!renewed) {
      return NextResponse.json({ error: 'Session expired or invalid' }, { status: 401 });
    }

    return NextResponse.json(renewed);
  } catch {
    return NextResponse.json({ error: 'Failed to renew session' }, { status: 500 });
  }
}
