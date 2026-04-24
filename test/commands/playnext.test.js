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

const { execute, data } = await import('../../src/commands/playnext.js');

beforeEach(() => {
  fakeMusic.current = null;
  fakeMusic.queue = [];
  fakeMusic.connect.mockClear();
  fakeMusic.enqueue.mockClear();
  fakeMusic.enqueueNext.mockClear();
  fakeMusic.maybeStart.mockClear();
});

describe('/playnext command', () => {
  it('declares the expected schema (one required string option named "query")', () => {
    const json = data.toJSON();
    expect(json.name).toBe('playnext');
    expect(json.options).toHaveLength(1);
    expect(json.options[0]).toMatchObject({ name: 'query', required: true, type: 3 });
  });

  it('asks for a query when missing/empty', async () => {
    const i = makeChatInteraction({ options: {} });
    await execute(i);
    expect(i.reply).toHaveBeenCalledOnce();
    expect(i.reply.mock.calls[0][0].content).toMatch(/supply a query/i);
  });

  it('uses enqueueNext (front of queue), not enqueue', async () => {
    fakeMusic.current = { title: 'Already', webpageUrl: 'x', durationSec: 1, requestedBy: 'u' };
    fakeMusic.queue = [
      { title: 'a', webpageUrl: 'a', durationSec: 1 },
      { title: 'b', webpageUrl: 'b', durationSec: 1 },
    ];
    const i = makeChatInteraction({ options: { query: 'jumpahead' } });
    await execute(i);
    expect(fakeMusic.enqueueNext).toHaveBeenCalledOnce();
    expect(fakeMusic.enqueue).not.toHaveBeenCalled();
    expect(fakeMusic.queue.map((t) => t.title)).toEqual(['Resolved: jumpahead', 'a', 'b']);
    expect(i.editReply.mock.calls[0][0].content).toMatch(/Playing next/);
  });

  it('replies "Now playing" when the queue is empty AND nothing is playing', async () => {
    const i = makeChatInteraction({ options: { query: 'first' } });
    await execute(i);
    expect(fakeMusic.enqueueNext).toHaveBeenCalledOnce();
    expect(i.editReply.mock.calls[0][0].content).toMatch(/Now playing/);
  });
});
