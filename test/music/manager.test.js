import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@discordjs/voice', () => ({
  joinVoiceChannel: vi.fn(),
  createAudioPlayer: vi.fn(() => ({ on: vi.fn(), play: vi.fn(), stop: vi.fn() })),
  createAudioResource: vi.fn(() => ({})),
  AudioPlayerStatus: { Idle: 'idle' },
  VoiceConnectionStatus: { Disconnected: 'disconnected', Signalling: 's', Connecting: 'c', Ready: 'r' },
  StreamType: { Arbitrary: 'arbitrary' },
  entersState: vi.fn(async () => undefined),
  NoSubscriberBehavior: { Pause: 'pause' },
}));

vi.mock('../../src/music/resolver.js', () => ({
  spawnAudioStream: vi.fn(() => ({
    stdout: {},
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

const { getMusic, shutdownAll } = await import('../../src/music/manager.js');

function track(id, title = `Song ${id}`) {
  return { title, webpageUrl: `https://example.com/${id}`, durationSec: 100, requestedBy: 'u1' };
}

describe('GuildMusic queue operations', () => {
  beforeEach(() => {
    shutdownAll();
  });

  it('enqueue pushes to the end', () => {
    const m = getMusic('g1');
    m.enqueue(track(1));
    m.enqueue(track(2));
    m.enqueue(track(3));
    expect(m.queue.map((t) => t.title)).toEqual(['Song 1', 'Song 2', 'Song 3']);
  });

  it('enqueueNext unshifts to the front', () => {
    const m = getMusic('g1');
    m.enqueue(track(1));
    m.enqueue(track(2));
    m.enqueueNext(track(99));
    expect(m.queue.map((t) => t.title)).toEqual(['Song 99', 'Song 1', 'Song 2']);
  });

  it('enqueueNext on empty queue gives a single item', () => {
    const m = getMusic('g1');
    m.enqueueNext(track(7));
    expect(m.queue).toHaveLength(1);
    expect(m.queue[0].title).toBe('Song 7');
  });

  it('removeIndex removes the right item and returns it', () => {
    const m = getMusic('g1');
    [1, 2, 3, 4].forEach((i) => m.enqueue(track(i)));
    const removed = m.removeIndex(2);
    expect(removed.title).toBe('Song 2');
    expect(m.queue.map((t) => t.title)).toEqual(['Song 1', 'Song 3', 'Song 4']);
  });

  it('removeIndex returns null for out-of-bounds', () => {
    const m = getMusic('g1');
    m.enqueue(track(1));
    expect(m.removeIndex(0)).toBeNull();
    expect(m.removeIndex(2)).toBeNull();
    expect(m.removeIndex(-3)).toBeNull();
    expect(m.queue).toHaveLength(1);
  });

  it('removeRange removes inclusive range', () => {
    const m = getMusic('g1');
    [1, 2, 3, 4, 5].forEach((i) => m.enqueue(track(i)));
    const removed = m.removeRange(2, 4);
    expect(removed.map((t) => t.title)).toEqual(['Song 2', 'Song 3', 'Song 4']);
    expect(m.queue.map((t) => t.title)).toEqual(['Song 1', 'Song 5']);
  });

  it('removeRange clamps end to queue length', () => {
    const m = getMusic('g1');
    [1, 2, 3].forEach((i) => m.enqueue(track(i)));
    const removed = m.removeRange(2, 99);
    expect(removed.map((t) => t.title)).toEqual(['Song 2', 'Song 3']);
    expect(m.queue.map((t) => t.title)).toEqual(['Song 1']);
  });

  it('removeRange returns empty when start beyond queue', () => {
    const m = getMusic('g1');
    [1, 2].forEach((i) => m.enqueue(track(i)));
    const removed = m.removeRange(99, 100);
    expect(removed).toEqual([]);
    expect(m.queue).toHaveLength(2);
  });

  it('skip with a current track returns it and stops player', () => {
    const m = getMusic('g1');
    m.ensurePlayer();
    m.current = track(42);
    const stopSpy = vi.spyOn(m.player, 'stop');
    const skipped = m.skip();
    expect(skipped.title).toBe('Song 42');
    expect(stopSpy).toHaveBeenCalledWith(true);
  });

  it('skip returns null when nothing playing and queue empty', () => {
    const m = getMusic('g1');
    expect(m.skip()).toBeNull();
  });

  it('stopAndLeave clears queue and current', () => {
    const m = getMusic('g1');
    m.enqueue(track(1));
    m.enqueue(track(2));
    m.current = track(0);
    m.stopAndLeave();
    expect(m.queue).toEqual([]);
    expect(m.current).toBeNull();
  });

  it('getMusic returns the same instance for the same guildId', () => {
    const a = getMusic('g1');
    const b = getMusic('g1');
    const c = getMusic('g2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
