import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeChatInteraction } from '../helpers/fakeInteraction.js';

const fakeMusic = {
  current: null,
  queue: [],
  connect: vi.fn().mockResolvedValue(undefined),
  enqueue: vi.fn(function (t) { this.queue.push(t); }),
  enqueueNext: vi.fn(function (t) { this.queue.unshift(t); }),
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
      title: `Resolved: ${q}`,
      webpageUrl: `https://yt/${q}`,
      durationSec: 200,
      requestedBy: by,
    })),
  };
});

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

const { execute, data } = await import('../../src/commands/play.js');

beforeEach(() => {
  fakeMusic.current = null;
  fakeMusic.queue = [];
  fakeMusic.connect.mockClear();
  fakeMusic.enqueue.mockClear();
  fakeMusic.enqueueNext.mockClear();
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
    expect(i.reply).toHaveBeenCalledOnce();
    expect(i.reply.mock.calls[0][0].content).toMatch(/supply a query/i);
    expect(fakeMusic.enqueue).not.toHaveBeenCalled();
  });

  it('rejects when user not in voice channel', async () => {
    const i = makeChatInteraction({ options: { query: 'despacito' }, inVoice: false });
    await execute(i);
    expect(i.reply).toHaveBeenCalledOnce();
    expect(i.reply.mock.calls[0][0].content).toMatch(/voice channel/i);
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
});
