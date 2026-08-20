import sharp from 'sharp';

export interface ArtworkComparison { perceptual: number; color: number; strong: boolean; }

export async function compareArtwork(sourceUrl: string, candidateUrl: string): Promise<ArtworkComparison> {
  const [source, candidate] = await Promise.all([imageVector(sourceUrl), imageVector(candidateUrl)]);
  if (!source || !candidate) return { perceptual: 0, color: 0, strong: false };
  let same = 0;
  let distance = 0;
  let dot = 0;
  let aLength = 0;
  let bLength = 0;
  for (let i = 0; i < source.length; i++) {
    if (Math.abs(source[i] - candidate[i]) < 18) same++;
    distance += Math.abs(source[i] - candidate[i]);
    dot += source[i] * candidate[i];
    aLength += source[i] * source[i];
    bLength += candidate[i] * candidate[i];
  }
  const perceptual = same / source.length;
  const color = dot / Math.sqrt(Math.max(1, aLength * bLength));
  return { perceptual, color, strong: perceptual >= 0.90 && color >= 0.94 };
}

async function imageVector(url: string): Promise<number[] | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await sharp(buffer).resize(32, 32, { fit: 'fill' }).removeAlpha().greyscale().raw().toBuffer();
    return [...data];
  } catch { return null; }
}
