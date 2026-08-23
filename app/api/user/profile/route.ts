import { NextResponse } from 'next/server';
import { getLocalProfile, saveLocalProfile } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  console.log('[profile] GET started');
  try {
    const profile = getLocalProfile();
    console.log(`[profile] GET completed in ${Date.now() - startedAt}ms`);
    return NextResponse.json(profile);
  } catch (error) {
    console.error(`[profile] GET failed after ${Date.now() - startedAt}ms:`, error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; pictureUrl?: unknown };
    if (typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (body.pictureUrl !== undefined && typeof body.pictureUrl !== 'string') {
      return NextResponse.json({ error: 'Invalid profile photo' }, { status: 400 });
    }

    return NextResponse.json(saveLocalProfile({ name: body.name, pictureUrl: body.pictureUrl as string | undefined }));
  } catch (error) {
    console.error('Failed to save profile:', error);
    const isMissingName = error instanceof Error && error.message === 'Name is required';
    return NextResponse.json(
      { error: isMissingName ? error.message : 'Failed to save profile' },
      { status: isMissingName ? 400 : 500 },
    );
  }
}
