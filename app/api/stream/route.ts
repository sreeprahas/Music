import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

function getYtdlpPath(): string {
  const customBin = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(customBin)) {
    return customBin;
  }
  return 'yt-dlp';
}

export async function GET(request: Request) {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ streamUrl: '' });
  }

  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId') || searchParams.get('v');

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId parameter' }, { status: 400 });
    }

    const ytdlpPath = getYtdlpPath();
    const command = `"${ytdlpPath}" --extractor-args "youtube:player_client=android,web" -g -f "ba/bestaudio/b" "https://www.youtube.com/watch?v=${videoId}"`;

    const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
    const streamUrl = stdout.trim().split('\n')[0];

    if (!streamUrl || !streamUrl.startsWith('http')) {
      throw new Error(stderr || 'yt-dlp failed to return direct stream URL');
    }

    return NextResponse.json({
      videoId,
      streamUrl,
      source: 'yt-dlp-live-extractor',
    });
  } catch (error: any) {
    console.error('[yt-dlp stream error]:', error);
    return NextResponse.json(
      {
        error: 'Failed to extract stream via yt-dlp',
        message: error.message || 'Error executing yt-dlp process',
      },
      { status: 500 }
    );
  }
}
