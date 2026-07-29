import { NextResponse } from 'next/server';
import { getDataDir, setDataDir } from '@/lib/nativeData';

export async function GET() {
  return NextResponse.json({ dataDir: getDataDir() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dir = body?.path || body?.dataDir || body?.data || null;
    if (!dir) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    setDataDir(dir);
    return NextResponse.json({ success: true, dataDir: getDataDir() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
