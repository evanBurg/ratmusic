import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';

const URL_RE = /^https?:\/\//i;

function rewriteYouTubeMusic(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'music.youtube.com') {
      u.hostname = 'www.youtube.com';
      return u.toString();
    }
  } catch {}
  return url;
}

async function spotifyToSearchQuery(url) {
  // Spotify oEmbed returns { title: "Song Name - Artist" } with no auth required.
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`spotify oembed status ${res.status}`);
    const data = await res.json();
    if (data && data.title) return data.title;
  } catch (e) {
    logger.warn({ err: e?.message, url }, 'spotify oembed failed');
  }
  return null;
}

function runYtdlpJson(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => (out += c));
    proc.stderr.on('data', (c) => (err += c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp exit ${code}: ${err.trim()}`));
      try {
        // For ytsearch1 yt-dlp returns one JSON line; for plain URL it returns one too.
        const firstLine = out.trim().split('\n').filter(Boolean)[0];
        if (!firstLine) return reject(new Error('yt-dlp returned no data'));
        resolve(JSON.parse(firstLine));
      } catch (e) {
        reject(new Error(`yt-dlp JSON parse failed: ${e.message}`));
      }
    });
  });
}

/**
 * Resolve a user query into a playable track descriptor.
 * Returns: { title, url, webpageUrl, durationSec, thumbnail, requestedBy, displayQuery }
 */
export async function resolveQuery(rawQuery, requestedBy) {
  let query = rawQuery.trim();
  let displayQuery = query;
  let target;

  if (URL_RE.test(query)) {
    if (/spotify\.com/i.test(query)) {
      const title = await spotifyToSearchQuery(query);
      if (title) {
        target = `ytsearch1:${title}`;
        displayQuery = `${title} (from Spotify)`;
      } else {
        target = `ytsearch1:${query}`;
      }
    } else {
      target = rewriteYouTubeMusic(query);
    }
  } else {
    target = `ytsearch1:${query}`;
  }

  const args = [
    '-j',
    '--no-playlist',
    '--no-warnings',
    '--default-search', 'ytsearch1',
    '--socket-timeout', '15',
    target,
  ];

  const info = await runYtdlpJson(args);

  return {
    title: info.title || info.fulltitle || 'Unknown title',
    webpageUrl: info.webpage_url || info.original_url || target,
    durationSec: info.duration ?? null,
    thumbnail: (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : info.thumbnail) || null,
    requestedBy,
    displayQuery,
  };
}

/** Spawn a yt-dlp process that streams the best audio to stdout. */
export function spawnAudioStream(webpageUrl) {
  const args = [
    '-o', '-',
    '-f', 'bestaudio[ext=webm]/bestaudio/best',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '--no-part',
    '--no-progress',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '15',
    webpageUrl,
  ];
  const proc = spawn(config.ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrBuf = '';
  proc.stderr.on('data', (c) => {
    stderrBuf += c.toString();
    if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
  });
  proc.on('error', (e) => logger.error({ err: e.message }, 'yt-dlp stream spawn error'));
  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      logger.warn({ code, tail: stderrBuf.slice(-500) }, 'yt-dlp stream exited non-zero');
    }
  });
  return proc;
}

export function formatDuration(sec) {
  if (sec == null || isNaN(sec)) return '--:--';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}
