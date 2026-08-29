const { Innertube, UniversalCache } = require("youtubei.js");

(async () => {
  const yt = await Innertube.create({
    generate_session_locally: true,
    cache: new UniversalCache(true),
  });

  const info = await yt.getInfo("Rif-RTvmmss");

  console.log("PLAYABILITY:");
  console.dir(info.playability_status, { depth: 5 });

  console.log("\nSTREAMING DATA:");
  console.log(!!info.streaming_data);

  const formats = info.streaming_data?.adaptive_formats ?? [];

  console.log("\nFORMAT COUNT:", formats.length);

  for (const f of formats) {
    if (f.has_audio || String(f.mime_type || "").startsWith("audio/")) {
      console.log("\n--- AUDIO FORMAT ---");
      console.dir({
        itag: f.itag,
        mime_type: f.mime_type,
        bitrate: f.bitrate,
        audio_quality: f.audio_quality,
        audio_sample_rate: f.audio_sample_rate,
        has_audio: f.has_audio,
        url: f.url,
        cipher: f.cipher,
        signature_cipher: f.signature_cipher
      }, { depth: 10 });
    }
  }
})().catch(console.error);
