import { NextResponse } from 'next/server';
import { downloadAllMetadataImages } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log('Starting metadata image download...');
    const result = await downloadAllMetadataImages();
    console.log('Metadata image download complete:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to download metadata images:', error);
    return NextResponse.json({ error: 'Failed to download metadata images', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}