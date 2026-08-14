import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Probe a well-known public DNS over HTTPS endpoint to verify real internet access.
// Uses AbortController so the fetch is cancelled cleanly on timeout — no leaked handles.
async function checkInternet(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    // Cloudflare 1.1.1.1 — tiny, fast, no cookies/redirects
    const res = await fetch('https://1.1.1.1', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok || res.status < 500;
  } catch {
    // Fallback: try Google's connectivity probe endpoint
    try {
      const res2 = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      return res2.status === 204 || res2.ok;
    } catch {
      return false;
    }
  } finally {
    clearTimeout(timeoutId);
    // controller is garbage-collected after this; no open handles remain.
  }
}

export async function HEAD() {
  const online = await checkInternet();
  return new NextResponse(null, {
    status: online ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  const online = await checkInternet();
  return NextResponse.json(
    { online },
    {
      status: online ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
