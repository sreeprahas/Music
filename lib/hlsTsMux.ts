import fs from 'fs/promises';

const BITRATES: Record<number, number[]> = {
  0: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  2: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
};

const SAMPLE_RATES: Record<number, number[]> = {
  0: [11025, 12000, 8000, 0],
  1: [0, 0, 0, 0],
  2: [22050, 24000, 16000, 0],
  3: [44100, 48000, 32000, 0],
};

const INDEX_CACHE_LIMIT = 8;
const indexCache = new Map<string, Mp3SegmentIndex>();

function touchCache(filePath: string, value: Mp3SegmentIndex) {
  indexCache.delete(filePath);
  indexCache.set(filePath, value);
  if (indexCache.size > INDEX_CACHE_LIMIT) {
    const oldestKey = indexCache.keys().next().value;
    if (oldestKey) {
      indexCache.delete(oldestKey);
    }
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodePts(pts: number): Uint8Array {
  const value = BigInt(Math.round(pts)) & 0x1ffffffffn;
  const p1 = Number((value >> 30n) & 0x07n);
  const p2 = Number((value >> 15n) & 0x7fffn);
  const p3 = Number(value & 0x7fffn);
  return new Uint8Array([
    0x20 | (p1 << 1) | 1,
    (p2 >> 8) & 0xff,
    ((p2 & 0xff) << 1) | 1,
    (p3 >> 8) & 0xff,
    ((p3 & 0xff) << 1) | 1,
  ]);
}

function makeTsPackets(pid: number, payload: Uint8Array, payloadUnitStart: boolean, continuityCounter: number) {
  const packets: Uint8Array[] = [];
  let offset = 0;
  while (offset < payload.length || packets.length === 0) {
    const packet = new Uint8Array(188);
    packet[0] = 0x47;
    packet[1] = ((payloadUnitStart && offset === 0 ? 0x40 : 0x00) | ((pid >> 8) & 0x1f)) & 0xff;
    packet[2] = pid & 0xff;
    packet[3] = 0x10 | (continuityCounter & 0x0f);

    const payloadCapacity = 184;
    const remaining = payload.length - offset;
    const chunk = remaining > 0 ? payload.subarray(offset, offset + Math.min(payloadCapacity, remaining)) : new Uint8Array(0);
    packet.set(chunk, 4);
    if (chunk.length < payloadCapacity) {
      packet.fill(0xff, 4 + chunk.length);
    }

    packets.push(packet);
    offset += chunk.length;
    continuityCounter = (continuityCounter + 1) & 0x0f;
  }
  return { packets, continuityCounter };
}

function createPatPayload(pmtPid: number): Uint8Array {
  const payload = new Uint8Array(17);
  payload[0] = 0x00;
  payload[1] = 0x00;
  payload[2] = 0xb0;
  payload[3] = 0x0d;
  payload[4] = 0x00;
  payload[5] = 0x01;
  payload[6] = 0xc1;
  payload[7] = 0x00;
  payload[8] = 0x00;
  payload[9] = 0x00;
  payload[10] = 0x01;
  payload[11] = 0xe0 | ((pmtPid >> 8) & 0x1f);
  payload[12] = pmtPid & 0xff;
  const crc = crc32(payload.subarray(1, 13));
  payload[13] = (crc >>> 24) & 0xff;
  payload[14] = (crc >>> 16) & 0xff;
  payload[15] = (crc >>> 8) & 0xff;
  payload[16] = crc & 0xff;
  return payload;
}

function createPmtPayload(audioPid: number, streamType: number): Uint8Array {
  const payload = new Uint8Array(22);
  payload[0] = 0x00;
  payload[1] = 0x02;
  payload[2] = 0xb0;
  payload[3] = 0x12;
  payload[4] = 0x00;
  payload[5] = 0x01;
  payload[6] = 0xc1;
  payload[7] = 0x00;
  payload[8] = 0x00;
  payload[9] = 0xe0;
  payload[10] = 0x1f;
  payload[11] = 0xff;
  payload[12] = streamType & 0xff;
  payload[13] = 0xe0 | ((audioPid >> 8) & 0x1f);
  payload[14] = audioPid & 0xff;
  payload[15] = 0xf0;
  payload[16] = 0x00;
  const crc = crc32(payload.subarray(1, 17));
  payload[17] = (crc >>> 24) & 0xff;
  payload[18] = (crc >>> 16) & 0xff;
  payload[19] = (crc >>> 8) & 0xff;
  payload[20] = crc & 0xff;
  payload[21] = 0xff;
  return payload;
}

function createPesPacket(audioPayload: Uint8Array, pts90k: number): Uint8Array {
  const ptsBytes = encodePts(pts90k);
  const header = new Uint8Array(14 + audioPayload.length);
  header[0] = 0x00;
  header[1] = 0x00;
  header[2] = 0x01;
  header[3] = 0xc0;
  header[4] = 0x00;
  header[5] = 0x00;
  header[6] = 0x80;
  header[7] = 0x80;
  header[8] = 0x05;
  header.set(ptsBytes, 9);
  header.set(audioPayload, 14);
  return header;
}

export interface Mp3SegmentIndex {
  boundaries: number[];
  durations: number[];
  totalDuration: number;
  streamType: number;
}

export async function buildMp3SegmentIndex(filePath: string, targetDurationSeconds = 4): Promise<Mp3SegmentIndex> {
  const cached = indexCache.get(filePath);
  if (cached) {
    touchCache(filePath, cached);
    return cached;
  }

  const fileHandle = await fs.open(filePath, 'r');
  try {
    const stats = await fileHandle.stat();
    let offset = 0;
    const boundaries: number[] = [0];
    const durations: number[] = [];
    let segmentDuration = 0;
    let totalDuration = 0;
    let streamType = 0;
    let pending = new Uint8Array(0);
    const chunkSize = 64 * 1024;

    if (stats.size >= 10) {
      const header = await readFileChunk(fileHandle, 0, 10);
      if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
        const size = ((header[6] & 0x7f) << 21) | ((header[7] & 0x7f) << 14) | ((header[8] & 0x7f) << 7) | (header[9] & 0x7f);
        offset = 10 + size;
      }
    }

    boundaries[0] = offset;
    let position = offset;

    while (position < stats.size) {
      const length = Math.min(chunkSize, stats.size - position);
      const chunk = await readFileChunk(fileHandle, position, length);
      position += length;

      const buffer = new Uint8Array(pending.length + chunk.length);
      buffer.set(pending, 0);
      buffer.set(chunk, pending.length);
      let cursor = 0;

      while (cursor + 4 <= buffer.length) {
        const header = parseMp3FrameHeader(buffer, cursor);
        if (!header) {
          cursor += 1;
          continue;
        }

        if (cursor + header.frameSize > buffer.length) {
          break;
        }

        if (!streamType) {
          streamType = header.streamType;
        }

        segmentDuration += header.frameDuration;
        totalDuration += header.frameDuration;
        cursor += header.frameSize;

        if (segmentDuration >= targetDurationSeconds) {
          durations.push(segmentDuration);
          boundaries.push(position - (buffer.length - cursor));
          segmentDuration = 0;
        }
      }

      pending = buffer.subarray(Math.max(0, buffer.length - 4));
    }

    if (boundaries[boundaries.length - 1] !== stats.size) {
      boundaries.push(stats.size);
      durations.push(segmentDuration);
    }

    if (durations.length === 0) {
      throw new Error('Unable to parse MP3 frames for HLS segmentation');
    }

    const index: Mp3SegmentIndex = { boundaries, durations, totalDuration, streamType };
    touchCache(filePath, index);
    return index;
  } finally {
    await fileHandle.close();
  }
}

async function readFileChunk(fd: fs.FileHandle, position: number, length: number): Promise<Uint8Array> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await fd.read(buffer, 0, length, position);
  return new Uint8Array(buffer.subarray(0, bytesRead));
}

function parseMp3FrameHeader(buffer: Uint8Array, offset: number) {
  if (offset + 4 > buffer.length) return null;
  const b1 = buffer[offset];
  const b2 = buffer[offset + 1];
  const b3 = buffer[offset + 2];
  if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;

  const versionId = (b2 >> 3) & 0x03;
  const layerIndex = (b2 >> 1) & 0x03;
  const bitrateIndex = (b3 >> 4) & 0x0f;
  const samplingRateIndex = (b3 >> 2) & 0x03;
  const paddingBit = (b3 >> 1) & 0x01;

  const version = versionId === 3 ? 1 : versionId === 2 ? 2 : versionId === 0 ? 2.5 : null;
  if (version === null || layerIndex === 0 || bitrateIndex === 0 || bitrateIndex === 0x0f || samplingRateIndex === 0x03) {
    return null;
  }

  const layer = 4 - layerIndex;
  const bitrate = BITRATES[versionId]?.[bitrateIndex];
  const sampleRate = SAMPLE_RATES[versionId]?.[samplingRateIndex];
  if (!bitrate || !sampleRate) return null;

  let frameSize = 0;
  let samplesPerFrame = 0;
  if (layer === 1) {
    samplesPerFrame = 384;
    frameSize = Math.floor(((12 * bitrate * 1000) / sampleRate + paddingBit) * 4);
  } else {
    samplesPerFrame = layer === 2 ? 1152 : 1152;
    frameSize = Math.floor(((version === 1 ? 144000 : 72000) * bitrate * 1000) / sampleRate + paddingBit);
  }

  if (frameSize <= 0 || offset + frameSize > buffer.length) {
    return null;
  }

  const streamType = version === 1 ? 0x03 : 0x04;
  return {
    frameSize,
    sampleRate,
    frameDuration: samplesPerFrame / sampleRate,
    streamType,
  };
}

export function buildTsSegmentFromMp3Chunk(
  audioBytes: Uint8Array,
  pts90k: number,
  continuityCounters: { pat: number; pmt: number; audio: number },
  streamType: number
): { tsSegment: Uint8Array; nextContinuityCounters: { pat: number; pmt: number; audio: number } } {
  const patPayload = createPatPayload(0x100);
  const pmtPayload = createPmtPayload(0x101, streamType);
  const pesPacket = createPesPacket(audioBytes, pts90k);

  const patPackets = makeTsPackets(0x0000, patPayload, true, continuityCounters.pat);
  const pmtPackets = makeTsPackets(0x0100, pmtPayload, true, continuityCounters.pmt);
  const audioPackets = makeTsPackets(0x0101, pesPacket, true, continuityCounters.audio);

  const allPackets = [...patPackets.packets, ...pmtPackets.packets, ...audioPackets.packets];
  const tsSegment = new Uint8Array(allPackets.length * 188);
  let offset = 0;
  for (const packet of allPackets) {
    tsSegment.set(packet, offset);
    offset += 188;
  }

  return {
    tsSegment,
    nextContinuityCounters: {
      pat: patPackets.continuityCounter,
      pmt: pmtPackets.continuityCounter,
      audio: audioPackets.continuityCounter,
    },
  };
}
