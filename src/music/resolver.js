import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';

const URL_RE = /^https?:\/\//i;
const YT_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const PLAYLIST_MAX_ENTRIES = parseInt(process.env.PLAYLIST_MAX_ENTRIES || '100', 10);

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

/**
 * Returns true if the URL is a YouTube playlist URL the user wants
 * us to expand into multiple tracks.
 *
 * - `youtube.com/playlist?list=...` → true (pure playlist page)
 * - `youtube.com/watch?v=X&list=PL...` → true (video within a playlist)
 *   YouTube itself treats this as "play the playlist starting from X"
 *   when the user clicks it, so we mirror that behaviour.
 * - `youtu.be/VIDEOID?list=...` → true
 * - Any other URL (single video, soundcloud, spotify, etc.) → false
 *
 * Mix-radio / auto-generated lists ("RD…", "UU…") are excluded because they
 * are infinite and would flood the queue.
 */
export function isYouTubePlaylistUrl(s) {
  if (!isUrl(s)) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (!YT_HOSTS.has(u.hostname.toLowerCase())) return false;
  const list = u.searchParams.get('list');
  if (!list) return false;
  if (/^(RD|UU|LM|FL)/.test(list)) return false;
  return true;
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
 * Returns { target, displayQuery, isPlaylist }.
 * - URLs: passed through (with YouTube Music host rewrite)
 * - Spotify URLs: resolved to a YouTube search query via oEmbed
 * - YouTube playlist URLs: passed through, marked isPlaylist=true
 * - Anything else: treated as keyword search via ytsearch1:
 */
export async function buildYtdlpTarget(rawQuery, { fetchImpl } = {}) {
  const query = String(rawQuery).trim();
  if (!query) throw new Error('empty query');

  if (isUrl(query)) {
    if (isSpotifyUrl(query)) {
      const title = await spotifyToSearchQuery(query, fetchImpl);
      if (title) return { target: `ytsearch1:${title}`, displayQuery: `${title} (from Spotify)`, isPlaylist: false };
      return { target: `ytsearch1:${query}`, displayQuery: query, isPlaylist: false };
    }
    const rewritten = rewriteYouTubeMusic(query);
    return { target: rewritten, displayQuery: query, isPlaylist: isYouTubePlaylistUrl(rewritten) };
  }

  return { target: `ytsearch1:${query}`, displayQuery: query, isPlaylist: false };
}

/**
 * Run yt-dlp and capture the full stdout. Caller decides how to parse
 * (one JSON per line for `-j`, single JSON dump for `-J`).
 */
function runYtdlpRaw(args, log = logger, label = 'resolve') {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    log.debug({ bin: config.ytdlpPath, args }, `yt-dlp: spawn (${label})`);
    const proc = spawn(config.ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => (out += c));
    proc.stderr.on('data', (c) => (err += c));
    proc.on('error', (e) => {
      log.error({ err: e.message }, `yt-dlp: spawn error (${label})`);
      reject(e);
    });
    proc.on('close', (code) => {
      const elapsedMs = Date.now() - startedAt;
      const errTail = err.trim().slice(-1500);
      if (code !== 0) {
        log.warn({ code, elapsedMs, errTail }, `yt-dlp: non-zero exit (${label})`);
        return reject(new Error(`yt-dlp exit ${code}: ${err.trim()}`));
      }
      resolve({ out, elapsedMs });
    });
  });
}

async function runYtdlpJson(args, log = logger) {
  const { out, elapsedMs } = await runYtdlpRaw(args, log, 'resolve');
  const firstLine = out.trim().split('\n').filter(Boolean)[0];
  if (!firstLine) {
    log.warn({ elapsedMs }, 'yt-dlp: empty output (resolve)');
    throw new Error('yt-dlp returned no data');
  }
  try {
    const parsed = JSON.parse(firstLine);
    log.debug({ elapsedMs, title: parsed.title, durationSec: parsed.duration }, 'yt-dlp: resolve OK');
    return parsed;
  } catch (e) {
    log.error({ err: e.message, elapsedMs }, 'yt-dlp: JSON parse failed (resolve)');
    throw new Error(`yt-dlp JSON parse failed: ${e.message}`);
  }
}

async function runYtdlpPlaylistJson(args, log = logger) {
  const { out, elapsedMs } = await runYtdlpRaw(args, log, 'playlist');
  const trimmed = out.trim();
  if (!trimmed) {
    log.warn({ elapsedMs }, 'yt-dlp: empty output (playlist)');
    throw new Error('yt-dlp returned no playlist data');
  }
  try {
    const parsed = JSON.parse(trimmed);
    log.debug(
      { elapsedMs, playlistTitle: parsed.title, entryCount: parsed.entries?.length || 0 },
      'yt-dlp: playlist OK',
    );
    return parsed;
  } catch (e) {
    log.error({ err: e.message, elapsedMs }, 'yt-dlp: JSON parse failed (playlist)');
    throw new Error(`yt-dlp playlist JSON parse failed: ${e.message}`);
  }
}

function buildTrackFromInfo(info, requestedBy, displayQuery, fallbackUrl) {
  return {
    title: info.title || info.fulltitle || 'Unknown title',
    webpageUrl: info.webpage_url || info.original_url || info.url || fallbackUrl,
    durationSec: info.duration ?? null,
    thumbnail: (info.thumbnails && info.thumbnails.length
      ? info.thumbnails[info.thumbnails.length - 1].url
      : info.thumbnail) || null,
    requestedBy,
    displayQuery,
  };
}

/**
 * Resolve a single video / search query into a single track.
 * @returns {Promise<object>} a single track object
 */
async function resolveSingle(target, displayQuery, requestedBy, log) {
  const args = [
    '-j',
    '--no-playlist',
    '--no-warnings',
    '--default-search', 'ytsearch1',
    '--socket-timeout', '15',
    target,
  ];
  const info = await runYtdlpJson(args, log);
  return buildTrackFromInfo(info, requestedBy, displayQuery, target);
}

/**
 * Resolve a YouTube playlist URL into a list of tracks.
 *
 * Uses --flat-playlist so we don't make per-video extractor calls;
 * each entry only carries id/title/url/duration which is enough to
 * enqueue and stream later.
 *
 * @returns {Promise<{tracks: object[], playlist: {title: string, totalEntries: number, truncated: boolean}}>}
 */
async function resolvePlaylist(target, displayQuery, requestedBy, log) {
  const args = [
    '-J',
    '--flat-playlist',
    '--yes-playlist',
    '--no-warnings',
    '--socket-timeout', '15',
    '--playlist-end', String(PLAYLIST_MAX_ENTRIES),
    target,
  ];
  const info = await runYtdlpPlaylistJson(args, log);
  const rawEntries = Array.isArray(info.entries) ? info.entries : [];

  const tracks = [];
  for (const entry of rawEntries) {
    if (!entry) continue;
    if (entry._type && entry._type !== 'url' && entry._type !== 'video' && entry._type !== 'url_transparent') {
      continue;
    }
    const webpageUrl = entry.url
      || entry.webpage_url
      || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
    if (!webpageUrl) continue;
    tracks.push(buildTrackFromInfo({ ...entry, webpage_url: webpageUrl }, requestedBy, displayQuery, webpageUrl));
  }

  const truncated = rawEntries.length >= PLAYLIST_MAX_ENTRIES
    && (info.playlist_count ? info.playlist_count > PLAYLIST_MAX_ENTRIES : true);

  return {
    tracks,
    playlist: {
      title: info.title || 'Untitled Playlist',
      totalEntries: info.playlist_count || rawEntries.length,
      truncated,
    },
  };
}

/**
 * Resolve a query into one or more tracks.
 *
 * Always returns the same shape:
 *   { tracks: Track[], playlist: PlaylistMeta | null }
 *
 * For single videos / searches / Spotify, tracks.length === 1 and
 * playlist === null. For YouTube playlists, tracks.length >= 1 and
 * playlist carries title/totalEntries/truncated metadata.
 */
export async function resolveQuery(rawQuery, requestedBy, log = logger) {
  const { target, displayQuery, isPlaylist } = await buildYtdlpTarget(rawQuery);
  log.info({ rawQuery, target, displayQuery, isPlaylist }, 'resolve: built yt-dlp target');

  if (isPlaylist) {
    const { tracks, playlist } = await resolvePlaylist(target, displayQuery, requestedBy, log);
    if (tracks.length === 0) {
      throw new Error('Playlist contained no playable entries');
    }
    log.info(
      { playlistTitle: playlist.title, kept: tracks.length, total: playlist.totalEntries, truncated: playlist.truncated },
      'resolve: playlist resolved',
    );
    return { tracks, playlist };
  }

  const track = await resolveSingle(target, displayQuery, requestedBy, log);
  return { tracks: [track], playlist: null };
}

export function spawnAudioStream(webpageUrl, log = logger) {
  const args = [
    '-o', '-',
    '-f', 'bestaudio[ext=webm]/bestaudio/best',
    '--no-playlist',
    '--no-warnings',
    '--no-part',
    '--no-progress',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '15',
    webpageUrl,
  ];
  const startedAt = Date.now();
  log.info({ bin: config.ytdlpPath, url: webpageUrl }, 'yt-dlp: spawn (stream)');
  log.debug({ args }, 'yt-dlp: stream args');

  const proc = spawn(config.ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderrBuf = '';
  let bytesOut = 0;
  let firstByteAt = null;

  proc.stderr.on('data', (c) => {
    const s = c.toString();
    stderrBuf += s;
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
    for (const line of s.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/error|forbidden|unavailable|fail/i.test(trimmed)) {
        log.warn({ line: trimmed }, 'yt-dlp[stderr]');
      } else {
        log.debug({ line: trimmed }, 'yt-dlp[stderr]');
      }
    }
  });

  proc.stdout.on('data', (c) => {
    if (firstByteAt == null) {
      firstByteAt = Date.now();
      log.info(
        { ttfbMs: firstByteAt - startedAt, firstChunkBytes: c.length },
        'yt-dlp: first audio bytes',
      );
    }
    bytesOut += c.length;
  });

  proc.on('error', (e) =>
    log.error({ err: e.message }, 'yt-dlp: stream spawn error'),
  );
  proc.on('close', (code, signal) => {
    const totalMs = Date.now() - startedAt;
    const summary = {
      code,
      signal,
      totalMs,
      bytesOut,
      ttfbMs: firstByteAt ? firstByteAt - startedAt : null,
      stderrTail: stderrBuf.slice(-1500),
    };
    if (code === 0 || signal === 'SIGKILL') {
      log.info(summary, 'yt-dlp: stream closed');
    } else {
      log.warn(summary, 'yt-dlp: stream exited non-zero');
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
