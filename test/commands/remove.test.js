import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeChatInteraction } from '../helpers/fakeInteraction.js';

const fakeMusic = {
  queue: [],
  removeIndex: vi.fn(),
  removeRange: vi.fn(),
};

vi.mock('../../src/music/manager.js', () => ({
  getMusic: vi.fn(() => fakeMusic),
  shutdownAll: vi.fn(),
}));

const { execute, data } = await import('../../src/commands/remove.js');

beforeEach(() => {
  fakeMusic.queue = [];
  fakeMusic.removeIndex.mockReset();
  fakeMusic.removeRange.mockReset();
});

describe('/remove command', () => {
  it('schema has one required string option named "selector"', () => {
    const j = data.toJSON();
    expect(j.name).toBe('remove');
    expect(j.options).toHaveLength(1);
    expect(j.options[0]).toMatchObject({ name: 'selector', required: true, type: 3 });
  });

  it('errors ephemerally when the queue is empty', async () => {
    const i = makeChatInteraction({ options: { selector: '3' } });
    await execute(i);
    expect(i.reply.mock.calls[0][0].content).toMatch(/queue is empty/i);
    expect(fakeMusic.removeIndex).not.toHaveBeenCalled();
  });

  it('parses single number and calls removeIndex', async () => {
    fakeMusic.queue = [1, 2, 3, 4].map((n) => ({ title: `s${n}` }));
    fakeMusic.removeIndex.mockReturnValue({ title: 's3' });
    const i = makeChatInteraction({ options: { selector: '3' } });
    await execute(i);
    expect(fakeMusic.removeIndex).toHaveBeenCalledWith(3);
    expect(i.reply.mock.calls[0][0].content).toMatch(/Removed \*\*#3\*\*/);
  });

  it('reports when single number is out of bounds', async () => {
    fakeMusic.queue = [{ title: 'only' }];
    fakeMusic.removeIndex.mockReturnValue(null);
    const i = makeChatInteraction({ options: { selector: '99' } });
    await execute(i);
    expect(i.reply.mock.calls[0][0].content).toMatch(/No item at position/);
  });

  it('parses range "1-7" and calls removeRange (1, 7)', async () => {
    fakeMusic.queue = [1, 2, 3, 4, 5].map((n) => ({ title: `s${n}` }));
    fakeMusic.removeRange.mockReturnValue([{}, {}, {}]);
    const i = makeChatInteraction({ options: { selector: '1-7' } });
    await execute(i);
    expect(fakeMusic.removeRange).toHaveBeenCalledWith(1, 7);
    expect(i.reply.mock.calls[0][0].content).toMatch(/Removed \*\*3\*\* item\(s\) from positions \*\*1-7\*\*/);
  });

  it('normalises reversed range "7-1" -> (1, 7)', async () => {
    fakeMusic.queue = [1, 2, 3, 4, 5].map((n) => ({ title: `s${n}` }));
    fakeMusic.removeRange.mockReturnValue([{}, {}]);
    const i = makeChatInteraction({ options: { selector: '7-1' } });
    await execute(i);
    expect(fakeMusic.removeRange).toHaveBeenCalledWith(1, 7);
  });

  it('reports when range removes nothing', async () => {
    fakeMusic.queue = [1, 2].map((n) => ({ title: `s${n}` }));
    fakeMusic.removeRange.mockReturnValue([]);
    const i = makeChatInteraction({ options: { selector: '5-9' } });
    await execute(i);
    expect(i.reply.mock.calls[0][0].content).toMatch(/Nothing in range/);
  });

  it('rejects garbage selectors with a helpful message', async () => {
    fakeMusic.queue = [{ title: 'a' }];
    const i = makeChatInteraction({ options: { selector: 'abc' } });
    await execute(i);
    expect(i.reply.mock.calls[0][0].content).toMatch(/Selector must be/);
    expect(fakeMusic.removeIndex).not.toHaveBeenCalled();
    expect(fakeMusic.removeRange).not.toHaveBeenCalled();
  });
});
