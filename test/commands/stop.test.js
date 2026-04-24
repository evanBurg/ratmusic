import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeChatInteraction } from '../helpers/fakeInteraction.js';

const fakeMusic = {
  current: null,
  queue: [],
  stopAndLeave: vi.fn(),
};

vi.mock('../../src/music/manager.js', () => ({
  getMusic: vi.fn(() => fakeMusic),
  shutdownAll: vi.fn(),
}));

const { execute, data } = await import('../../src/commands/stop.js');

beforeEach(() => {
  fakeMusic.current = null;
  fakeMusic.queue = [];
  fakeMusic.stopAndLeave.mockClear();
});

describe('/stop command', () => {
  it('schema has no options', () => {
    expect(data.toJSON().name).toBe('stop');
  });

  it('always calls stopAndLeave()', async () => {
    const i = makeChatInteraction();
    await execute(i);
    expect(fakeMusic.stopAndLeave).toHaveBeenCalledOnce();
  });

  it('reports a different message when nothing was playing', async () => {
    const i = makeChatInteraction();
    await execute(i);
    expect(i.reply.mock.calls[0][0].content).toMatch(/Nothing to stop/);
  });

  it('reports success message when something was queued', async () => {
    fakeMusic.queue = [{ title: 'a' }];
    const i = makeChatInteraction();
    await execute(i);
    expect(i.reply.mock.calls[0][0].content).toMatch(/Stopped, queue cleared/);
  });
});
