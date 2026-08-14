/// <reference types="node" />
import { createPlaybackSession } from '../lib/sessionStreamAuth';
import * as manifestRoute from '../app/api/stream/hls/manifest/route';
import * as segmentRoute from '../app/api/stream/hls/segment/route';

async function main() {
  const session = createPlaybackSession('0BvsWrGBlC4', '127.0.0.1', 'test');
  if (!session) {
    throw new Error('failed to create session');
  }

  const manifestReq = new Request(`http://localhost/api/stream/hls/manifest?s=${session.sessionId}&t=${session.token}`);
  const manifestRes = await manifestRoute.GET(manifestReq as any);
  console.log('manifest status', manifestRes.status);
  const manifestText = await manifestRes.text();
  console.log('manifest text first lines:');
  console.log(manifestText.split('\n').slice(0, 8).join('\n'));

  const firstSegmentUrl = manifestText.split('\n').find((line) => line.startsWith('/api/stream/hls/segment'));
  if (!firstSegmentUrl) {
    throw new Error('no segment url found');
  }
  console.log('firstSegmentUrl', firstSegmentUrl);

  const segReq = new Request(`http://localhost${firstSegmentUrl}`);
  const segRes = await segmentRoute.GET(segReq as any);
  console.log('segment status', segRes.status, segRes.headers.get('content-type'), segRes.headers.get('content-length'));
  const segBuf = new Uint8Array(await segRes.arrayBuffer());
  console.log('seg len', segBuf.length);
  console.log('first 5 packets:', Array.from(segBuf.subarray(0, 5*188)).reduce((acc, _, idx) => {
    if (idx % 188 === 0) acc.push(Array.from(segBuf.subarray(idx, idx + 4)).map((v) => v.toString(16).padStart(2, '0')).join(' '));
    return acc;
  }, [] as string[]));
  console.log('sync ok', segBuf.every((v, idx) => idx % 188 === 0 ? v === 0x47 : true));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});