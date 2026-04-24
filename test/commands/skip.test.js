import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeChatInteraction } from '../helpers/fakeInteraction.js';

const fakeMusic = {
  current: null,
  queue: [],
  skip: vi.fn(),
};

vi.mock('../../src/music/manager.js', () => ({
  getMusic: vi.fn(() => fakeMusic),
  shutdownAll: vi.fn(),
}));

const { execute, data } = await import('../../src/commands/skip.js');

beforeEach(() => {
  fakeMusic.current = null;
  fakeMusic.queue = [];
  fakeMusic.skip.mockReset();
});

describe('/skip command', () => {
  it('schema has no options', () => {
    const j = data.toJSON();
    expect(j.name).toBe('skip');
    expect(j.options ?? []).toHaveLength(0);
  });

  it('replies ephemeral when nothing is playing AND queue is empty', async () => {
    const i = makeChatInteraction();
    await execute(i);
    expect(i.reply.mock.calls[0][0].content).toMatch(/Nothing is playing/);
    expect(fakeMusic.skip).not.toHaveBeenCalled();
  });

  it('calls skip() and reports the skipped title', async () => {
    fakeMusic.current = { title: 'Burnin Up' };
    fakeMusic.skip.mockReturnValue({ title: 'Burnin Up' });
    const i = makeChatInteraction();
    await execute(i);
    expect(fakeMusic.skip).toHaveBeenCalledOnce();
    expect(i.reply.mock.calls[0][0].content).toMatch(/Skipped \*\*Burnin Up\*\*/);
  });
});
