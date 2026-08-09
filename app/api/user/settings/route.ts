import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserSettings, saveUserSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

const AUTHORIZED_EMAIL = (process.env.AUTHORIZED_EMAIL || 'minecraftprahas@gmail.com').toLowerCase().trim();

async function getAccountEmail(): Promise<string> {
  const session = await getSession();
  if (session?.email) {
    return session.email.toLowerCase().trim();
  }
  return AUTHORIZED_EMAIL;
}

export async function GET() {
  const email = await getAccountEmail();
  const settings = getUserSettings(email);
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  try {
    const email = await getAccountEmail();
    const body = await request.json();
    const updated = saveUserSettings(email, body);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update settings' }, { status: 500 });
  }
}
