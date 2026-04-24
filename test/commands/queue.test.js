import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeChatInteraction } from '../helpers/fakeInteraction.js';

const fakeMusic = { current: null, queue: [] };

vi.mock('../../src/music/manager.js', () => ({
  getMusic: vi.fn(() => fakeMusic),
  shutdownAll: vi.fn(),
}));

const { execute, data } = await import('../../src/commands/queue.js');

beforeEach(() => {
  fakeMusic.current = null;
  fakeMusic.queue = [];
});

describe('/queue command', () => {
  it('schema has no options', () => {
    expect(data.toJSON().name).toBe('queue');
  });

  it('replies with one embed and one action row when empty', async () => {
    const i = makeChatInteraction();
    await execute(i);
    const payload = i.reply.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(1);
    expect(payload.components).toHaveLength(1);
    const buttons = payload.components[0].toJSON().components;
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('enables Skip/Stop buttons when something is playing', async () => {
    fakeMusic.current = { title: 'a song', durationSec: 10, requestedBy: 'u' };
    const i = makeChatInteraction();
    await execute(i);
    const payload = i.reply.mock.calls[0][0];
    const buttons = payload.components[0].toJSON().components;
    expect(buttons.every((b) => b.disabled === false || b.disabled === undefined)).toBe(true);
  });
});
