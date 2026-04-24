import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// A FakeAudioPlayer behaves like @discordjs/voice's AudioPlayer for our
// purposes: it's an EventEmitter, holds a state, and `stop(force)` SYNCHRONOUSLY
// transitions to Idle and emits the Idle event (matching the real lib's
// synchronous setState behaviour). Several manager bugs depend on this exact
// re-entrancy, so the mock has to model it.
class FakeAudioPlayer extends EventEmitter {
  constructor() {
    super();
    this.state = { status: 'idle' };
    this.play = vi.fn((resource) => {
      this.state = { status: 'buffering' };
    });
    this.stop = vi.fn((_force) => {
      this.state = { status: 'idle' };
      this.emit('stateChange', { status: 'playing' }, { status: 'idle' });
      this.emit('idle');
    });
    this.subscribe = vi.fn(() => undefined);
  }
}

vi.mock('@discordjs/voice', () => ({
  joinVoiceChannel: vi.fn(),
  createAudioPlayer: vi.fn(() => new FakeAudioPlayer()),
  createAudioResource: vi.fn(() => ({})),
  AudioPlayerStatus: { Idle: 'idle', Playing: 'playing', Buffering: 'buffering', Paused: 'paused', AutoPaused: 'autopaused' },
  VoiceConnectionStatus: { Disconnected: 'disconnected', Signalling: 's', Connecting: 'c', Ready: 'r', Destroyed: 'destroyed' },
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

vi.mock('../../src/logger.js', async () => {
  const { fakeLoggerModule } = await import('../helpers/fakeLogger.js');
  return fakeLoggerModule;
});

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

  // Regression: the AudioPlayer's Idle event fires synchronously from stop(),
  // so the auto-advance handler runs (and spawns the next track's process)
  // before skip() returns. If skip() killed currentProc *after* stop(true),
  // it would clobber the freshly-spawned next track's process — effectively
  // skipping two tracks at once. See manager.js skip() comment.
  it('skip does not kill the next track that auto-advance just spawned', async () => {
    const { spawnAudioStream } = await import('../../src/music/resolver.js');
    spawnAudioStream.mockClear();

    const procA = { stdout: {}, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() };
    const procB = { stdout: {}, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() };
    // procA is hand-installed below; procB will come from _advance's spawn.
    spawnAudioStream.mockReturnValueOnce(procB);

    const m = getMusic('g1');
    m.ensurePlayer();
    m.current = track('A', 'Track A');
    m.currentProc = procA;
    m.enqueue(track('B', 'Track B'));

    const skipped = m.skip();

    expect(skipped.title).toBe('Track A');
    expect(procA.kill).toHaveBeenCalledWith('SIGKILL');
    // The crux of the regression: B's process must SURVIVE skip().
    expect(procB.kill).not.toHaveBeenCalled();
    // And we should now be playing B.
    expect(m.current?.title).toBe('Track B');
    expect(m.currentProc).toBe(procB);
    expect(m.queue).toHaveLength(0);
  });

  // Regression: the slash-command handler posts its own "Now playing: ..."
  // editReply, so manager._playNext() must not also post a channel notify
  // when invoked via maybeStart() (the user-command path). It SHOULD notify
  // when invoked via _advance() (the auto-advance path).
  it('maybeStart does not double-notify, but auto-advance does notify', async () => {
    const { spawnAudioStream } = await import('../../src/music/resolver.js');
    spawnAudioStream.mockReturnValue({ stdout: {}, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() });

    const send = vi.fn(() => Promise.resolve());
    const m = getMusic('g1');
    m.ensurePlayer();
    m.textChannel = { send };
    m.enqueue(track('A', 'Track A'));

    await m.maybeStart();
    expect(m.current?.title).toBe('Track A');
    expect(send).not.toHaveBeenCalled(); // no duplicate "Now playing"

    // Auto-advance: simulate the Player going Idle (track A finished).
    m.enqueue(track('B', 'Track B'));
    m.player.emit('idle'); // triggers _advance() -> _playNext() with default notify=true

    // Wait a microtask for any async handling to settle.
    await Promise.resolve();
    expect(m.current?.title).toBe('Track B');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].content).toMatch(/Now playing.*Track B/);
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
