const { Innertube, UniversalCache } = require("youtubei.js");

(async () => {
  const yt = await Innertube.create({
    generate_session_locally: true,
    cache: new UniversalCache(true),
  });

  const info = await yt.getInfo("Rif-RTvmmss");

  const format = info.chooseFormat({
    type: "audio",
    quality: "best",
    format: "any"
  });

  console.log("SELECTED FORMAT:");
  console.dir(format, { depth: 10 });

  console.log("\nDECIPHER TEST:");

  try {
    const url = await format.decipher(
      info.actions.session.player
    );

    console.log("URL:", url);
  } catch (error) {
    console.error(error);
  }
})().catch(console.error);
