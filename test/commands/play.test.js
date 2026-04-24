import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeChatInteraction } from '../helpers/fakeInteraction.js';

const fakeMusic = {
  current: null,
  queue: [],
  connect: vi.fn().mockResolvedValue(undefined),
  enqueue: vi.fn(function (t) { this.queue.push(t); }),
  enqueueNext: vi.fn(function (t) { this.queue.unshift(t); }),
  enqueueBatch: vi.fn(function (ts) { for (const t of ts) this.queue.push(t); }),
  enqueueNextBatch: vi.fn(function (ts) { this.queue.unshift(...ts); }),
  maybeStart: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../src/music/manager.js', () => ({
  getMusic: vi.fn(() => fakeMusic),
  shutdownAll: vi.fn(),
}));

vi.mock('../../src/music/resolver.js', async () => {
  const actual = await vi.importActual('../../src/music/resolver.js');
  return {
    ...actual,
    resolveQuery: vi.fn(async (q, by) => ({
      tracks: [{
        title: `Resolved: ${q}`,
        webpageUrl: `https://yt/${q}`,
        durationSec: 200,
        requestedBy: by,
      }],
      playlist: null,
    })),
  };
});

vi.mock('../../src/logger.js', async () => {
  const { fakeLoggerModule } = await import('../helpers/fakeLogger.js');
  return fakeLoggerModule;
});

const { execute, data } = await import('../../src/commands/play.js');
const { resolveQuery } = await import('../../src/music/resolver.js');

beforeEach(() => {
  fakeMusic.current = null;
  fakeMusic.queue = [];
  fakeMusic.connect.mockClear();
  fakeMusic.enqueue.mockClear();
  fakeMusic.enqueueNext.mockClear();
  fakeMusic.enqueueBatch.mockClear();
  fakeMusic.enqueueNextBatch.mockClear();
  fakeMusic.maybeStart.mockClear();
});

describe('/play command', () => {
  it('declares the expected schema (one required string option named "query")', () => {
    const json = data.toJSON();
    expect(json.name).toBe('play');
    expect(json.options).toHaveLength(1);
    expect(json.options[0]).toMatchObject({ name: 'query', required: true, type: 3 });
  });

  it('asks for a query when missing/empty (defensive path)', async () => {
    const i = makeChatInteraction({ options: { query: '' } });
    await execute(i);
    expect(i.deferReply).toHaveBeenCalledOnce();
    expect(i.editReply).toHaveBeenCalledOnce();
    expect(i.editReply.mock.calls[0][0].content).toMatch(/supply a query/i);
    expect(fakeMusic.enqueue).not.toHaveBeenCalled();
  });

  it('rejects when user not in voice channel', async () => {
    const i = makeChatInteraction({ options: { query: 'despacito' }, inVoice: false });
    await execute(i);
    expect(i.deferReply).toHaveBeenCalledOnce();
    expect(i.editReply).toHaveBeenCalledOnce();
    expect(i.editReply.mock.calls[0][0].content).toMatch(/voice channel/i);
    expect(fakeMusic.enqueue).not.toHaveBeenCalled();
  });

  it('defers reply, calls enqueue (push to end), and replies "Now playing" when idle', async () => {
    const i = makeChatInteraction({ options: { query: 'despacito' } });
    await execute(i);
    expect(i.deferReply).toHaveBeenCalled();
    expect(fakeMusic.connect).toHaveBeenCalled();
    expect(fakeMusic.enqueue).toHaveBeenCalledOnce();
    expect(fakeMusic.enqueueNext).not.toHaveBeenCalled();
    expect(fakeMusic.maybeStart).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalledOnce();
    expect(i.editReply.mock.calls[0][0].content).toMatch(/Now playing/);
    expect(i.editReply.mock.calls[0][0].content).toMatch(/Resolved: despacito/);
  });

  it('replies "Added to queue (position #N)" when something is already playing', async () => {
    fakeMusic.current = { title: 'Already', webpageUrl: 'x', durationSec: 1, requestedBy: 'u' };
    fakeMusic.queue = [{ title: 'a', webpageUrl: 'a', durationSec: 1 }];
    const i = makeChatInteraction({ options: { query: 'next song' } });
    await execute(i);
    expect(fakeMusic.enqueue).toHaveBeenCalledOnce();
    const msg = i.editReply.mock.calls[0][0].content;
    expect(msg).toMatch(/Added to queue \(position \*\*#2\*\*\)/);
  });

  it('decorates every reply with an emoji', async () => {
    const i = makeChatInteraction({ options: { query: 'despacito' } });
    await execute(i);
    const msg = i.editReply.mock.calls[0][0].content;
    // Has at least one emoji-ish codepoint (any Symbol/Pictograph/Geometric block).
    expect(/[\u{1F300}-\u{1FAFF}\u2500-\u27BF\u2B00-\u2BFF]/u.test(msg)).toBe(true);
  });

  describe('with a YouTube playlist URL', () => {
    beforeEach(() => {
      resolveQuery.mockResolvedValueOnce({
        tracks: [
          { title: 'Track 1', webpageUrl: 'https://yt/1', durationSec: 60, requestedBy: 'u1' },
          { title: 'Track 2', webpageUrl: 'https://yt/2', durationSec: 90, requestedBy: 'u1' },
          { title: 'Track 3', webpageUrl: 'https://yt/3', durationSec: 120, requestedBy: 'u1' },
        ],
        playlist: { title: 'My Playlist', totalEntries: 3, truncated: false },
      });
    });

    it('uses enqueueBatch (not enqueue) and replies with playlist info when idle', async () => {
      const i = makeChatInteraction({ options: { query: 'https://www.youtube.com/playlist?list=PLabc' } });
      await execute(i);
      expect(fakeMusic.enqueueBatch).toHaveBeenCalledOnce();
      expect(fakeMusic.enqueue).not.toHaveBeenCalled();
      expect(fakeMusic.enqueueNextBatch).not.toHaveBeenCalled();
      expect(fakeMusic.queue).toHaveLength(3);
      const msg = i.editReply.mock.calls[0][0].content;
      expect(msg).toMatch(/Now playing playlist/);
      expect(msg).toMatch(/My Playlist/);
      expect(msg).toMatch(/3.*track/);
      expect(msg).toMatch(/Track 1/);
    });

    it('reports "Added playlist ... to the queue" when something is already playing', async () => {
      fakeMusic.current = { title: 'Already' };
      const i = makeChatInteraction({ options: { query: 'https://www.youtube.com/playlist?list=PLabc' } });
      await execute(i);
      expect(fakeMusic.enqueueBatch).toHaveBeenCalledOnce();
      const msg = i.editReply.mock.calls[0][0].content;
      expect(msg).toMatch(/Added playlist/);
      expect(msg).toMatch(/positions \*\*#1–#3\*\*/);
    });
  });

  it('mentions truncation when the playlist was clipped', async () => {
    resolveQuery.mockResolvedValueOnce({
      tracks: Array.from({ length: 100 }, (_, i) => ({
        title: `T${i}`, webpageUrl: `u${i}`, durationSec: 1, requestedBy: 'u',
      })),
      playlist: { title: 'Huge', totalEntries: 500, truncated: true },
    });
    const i = makeChatInteraction({ options: { query: 'https://www.youtube.com/playlist?list=PLbig' } });
    await execute(i);
    const msg = i.editReply.mock.calls[0][0].content;
    expect(msg).toMatch(/showing first 100 of 500/);
  });
});
