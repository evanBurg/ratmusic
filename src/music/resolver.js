import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';

const URL_RE = /^https?:\/\//i;

export function isUrl(s) {
  return typeof s === 'string' && URL_RE.test(s);
}

export function rewriteYouTubeMusic(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'music.youtube.com') {
      u.hostname = 'www.youtube.com';
      return u.toString();
    }
  } catch {}
  return url;
}

export function isSpotifyUrl(s) {
  return typeof s === 'string' && /^https?:\/\/[^\s]*spotify\.com/i.test(s);
}

export async function spotifyToSearchQuery(url, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`spotify oembed status ${res.status}`);
    const data = await res.json();
    if (data && data.title) return data.title;
  } catch (e) {
    logger.warn({ err: e?.message, url }, 'spotify oembed failed');
  }
  return null;
}

/**
 * Decide what to feed to yt-dlp based on the user's raw query.
 * Returns { target, displayQuery }.
 * - URLs: passed through (with YouTube Music host rewrite)
 * - Spotify URLs: resolved to a YouTube search query via oEmbed
 * - Anything else: treated as keyword search via ytsearch1:
 */
export async function buildYtdlpTarget(rawQuery, { fetchImpl } = {}) {
  const query = String(rawQuery).trim();
  if (!query) throw new Error('empty query');

  if (isUrl(query)) {
    if (isSpotifyUrl(query)) {
      const title = await spotifyToSearchQuery(query, fetchImpl);
      if (title) return { target: `ytsearch1:${title}`, displayQuery: `${title} (from Spotify)` };
      return { target: `ytsearch1:${query}`, displayQuery: query };
    }
    const rewritten = rewriteYouTubeMusic(query);
    return { target: rewritten, displayQuery: query };
  }

  return { target: `ytsearch1:${query}`, displayQuery: query };
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
        const firstLine = out.trim().split('\n').filter(Boolean)[0];
        if (!firstLine) return reject(new Error('yt-dlp returned no data'));
        resolve(JSON.parse(firstLine));
      } catch (e) {
        reject(new Error(`yt-dlp JSON parse failed: ${e.message}`));
      }
    });
  });
}

export async function resolveQuery(rawQuery, requestedBy) {
  const { target, displayQuery } = await buildYtdlpTarget(rawQuery);

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
