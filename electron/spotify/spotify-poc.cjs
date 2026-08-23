'use strict';

const { app } = require('electron');
const fs = require('fs');
const { SpotifyPlaylistScraper } = require('./SpotifyPlaylistScraper.cjs');

const DEFAULT_PLAYLIST = process.argv[2] || '5RSFQL0HI2EnyQGAwBZlC3';

function diagnostic(message) {
  console.log(message);
  try { fs.appendFileSync('scratch/spotify-poc.log', `${new Date().toISOString()} ${message}\n`); } catch {}
}

diagnostic('[spotify-poc] Provider starting');

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  diagnostic('[spotify-poc] Electron ready');
  const scraper = new SpotifyPlaylistScraper();
  try {
    diagnostic(`[spotify-poc] Playlist: ${DEFAULT_PLAYLIST}`);
    let lastReported = 0;
    const result = await scraper.scrape(DEFAULT_PLAYLIST, {
      method: process.env.SPOTIFY_SCRAPER_MODE || 'default',
      onProgress(event) {
        if (event.type === 'started' && event.total) {
          diagnostic(`Spotify reported tracks: ${event.total}`);
        } else if (event.type === 'progress') {
          if (event.fetched !== lastReported && (event.fetched % 25 === 0 || event.fetched === event.total)) {
            diagnostic(`Collected tracks: ${event.fetched}`);
            lastReported = event.fetched;
          }
        }
      },
    });
    diagnostic(`Playlist: ${result.playlist.name}`);
    diagnostic(`Spotify reported tracks: ${result.diagnostics.expectedTotal || result.tracks.length}`);
    diagnostic(`Collected tracks: ${result.tracks.length}`);
    diagnostic(`Persisted: ${result.tracks.length}`);
    diagnostic('--- First 5 tracks ---');
    for (const track of result.tracks.slice(0, 5)) {
      diagnostic(`  - ${track.title} — ${track.artist} (${track.id}) [${track.album}]`);
    }
    diagnostic(`--- Diagnostics ---`);
    diagnostic(JSON.stringify(result.diagnostics, null, 2));
  } catch (error) {
    diagnostic(`[spotify-poc] ERROR: ${error.message} (${error.code || 'unknown'})`);
    process.exitCode = 1;
  } finally {
    scraper.destroy();
    app.quit();
  }
});
