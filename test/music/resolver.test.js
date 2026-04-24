import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

const {
  isUrl,
  isSpotifyUrl,
  rewriteYouTubeMusic,
  buildYtdlpTarget,
  formatDuration,
  spotifyToSearchQuery,
} = await import('../../src/music/resolver.js');

describe('formatDuration', () => {
  it('handles null/NaN', () => {
    expect(formatDuration(null)).toBe('--:--');
    expect(formatDuration(undefined)).toBe('--:--');
    expect(formatDuration(NaN)).toBe('--:--');
  });
  it('formats seconds < 1h as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(599)).toBe('9:59');
  });
  it('formats seconds >= 1h as h:mm:ss', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7322)).toBe('2:02:02');
  });
});

describe('isUrl', () => {
  it('detects http(s) URLs', () => {
    expect(isUrl('https://youtube.com/watch?v=abc')).toBe(true);
    expect(isUrl('http://example.com')).toBe(true);
    expect(isUrl('HTTPS://A.B')).toBe(true);
  });
  it('rejects keywords', () => {
    expect(isUrl('despacito')).toBe(false);
    expect(isUrl('best song ever')).toBe(false);
    expect(isUrl('youtube.com/watch?v=abc')).toBe(false);
    expect(isUrl('')).toBe(false);
    expect(isUrl(null)).toBe(false);
  });
});

describe('isSpotifyUrl', () => {
  it('detects spotify links', () => {
    expect(isSpotifyUrl('https://open.spotify.com/track/abc')).toBe(true);
    expect(isSpotifyUrl('https://spotify.com/album/xyz')).toBe(true);
  });
  it('rejects others', () => {
    expect(isSpotifyUrl('https://youtube.com/watch?v=abc')).toBe(false);
    expect(isSpotifyUrl('despacito')).toBe(false);
  });
});

describe('rewriteYouTubeMusic', () => {
  it('rewrites music.youtube.com to www.youtube.com', () => {
    const out = rewriteYouTubeMusic('https://music.youtube.com/watch?v=abc');
    expect(out).toBe('https://www.youtube.com/watch?v=abc');
  });
  it('leaves regular YouTube URLs alone', () => {
    expect(rewriteYouTubeMusic('https://www.youtube.com/watch?v=abc'))
      .toBe('https://www.youtube.com/watch?v=abc');
  });
  it('leaves non-URL strings alone', () => {
    expect(rewriteYouTubeMusic('despacito')).toBe('despacito');
  });
});

describe('buildYtdlpTarget', () => {
  it('treats keyword input as ytsearch1:', async () => {
    const r = await buildYtdlpTarget('despacito');
    expect(r.target).toBe('ytsearch1:despacito');
    expect(r.displayQuery).toBe('despacito');
  });

  it('passes plain YouTube URLs through', async () => {
    const r = await buildYtdlpTarget('https://www.youtube.com/watch?v=abc');
    expect(r.target).toBe('https://www.youtube.com/watch?v=abc');
    expect(r.displayQuery).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('rewrites YouTube Music URLs to www', async () => {
    const r = await buildYtdlpTarget('https://music.youtube.com/watch?v=abc');
    expect(r.target).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('resolves Spotify URL via oEmbed and turns it into ytsearch1:', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Song Name - Artist' }),
    });
    const r = await buildYtdlpTarget('https://open.spotify.com/track/xyz', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(r.target).toBe('ytsearch1:Song Name - Artist');
    expect(r.displayQuery).toContain('from Spotify');
  });

  it('falls back to searching the spotify URL itself when oEmbed fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const r = await buildYtdlpTarget('https://open.spotify.com/track/xyz', { fetchImpl });
    expect(r.target).toBe('ytsearch1:https://open.spotify.com/track/xyz');
  });

  it('throws on empty input', async () => {
    await expect(buildYtdlpTarget('   ')).rejects.toThrow(/empty/);
  });
});

describe('spotifyToSearchQuery', () => {
  it('returns title when oEmbed succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Cool Song' }),
    });
    expect(await spotifyToSearchQuery('https://open.spotify.com/track/abc', fetchImpl)).toBe('Cool Song');
  });
  it('returns null when oEmbed errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await spotifyToSearchQuery('https://open.spotify.com/track/abc', fetchImpl)).toBeNull();
  });
});
