import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function checkInternet(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const probe1 = fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    }).then((r) => r.status === 204 || r.ok).catch(() => false);

    const probe2 = fetch('https://1.1.1.1', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    }).then((r) => r.ok).catch(() => false);

    const result = await Promise.race([
      probe1.then((ok) => ok || probe2),
      probe2.then((ok) => ok || probe1),
    ]);
    clearTimeout(timeoutId);
    return result;
  } catch {
    return false;
  }
}

export async function HEAD() {
  const online = await checkInternet();
  return new NextResponse(null, { status: online ? 200 : 503 });
}

export async function GET() {
  const online = await checkInternet();
  return NextResponse.json({ online }, { status: online ? 200 : 503 });
}
