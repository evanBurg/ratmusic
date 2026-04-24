import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { spawnAudioStream } from './resolver.js';
import { logger } from '../logger.js';

/**
 * Per-guild music state.
 */
class GuildMusic {
  constructor(guildId) {
    this.guildId = guildId;
    this.queue = [];           // array of track descriptors
    this.current = null;       // currently-playing track
    this.connection = null;
    this.player = null;
    this.textChannel = null;   // channel to post auto-messages into
    this.voiceChannelId = null;
    this.currentProc = null;   // yt-dlp child process for current track
    this.destroyed = false;
  }

  ensurePlayer() {
    if (this.player) return this.player;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.player.on('error', (err) => {
      logger.error({ err: err.message, guildId: this.guildId }, 'audio player error');
      this._safeNotify(`Playback error: ${err.message}`);
      this._advance();
    });
    this.player.on(AudioPlayerStatus.Idle, () => {
      // Track finished naturally
      this._advance();
    });
    return this.player;
  }

  async connect(voiceChannel, textChannel) {
    this.textChannel = textChannel;
    if (this.connection && this.voiceChannelId === voiceChannel.id) return this.connection;

    if (this.connection) {
      try { this.connection.destroy(); } catch {}
      this.connection = null;
    }

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    this.voiceChannelId = voiceChannel.id;

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        // It's a real disconnect
        this.destroy();
      }
    });

    this.connection.subscribe(this.ensurePlayer());

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
    } catch (e) {
      this.destroy();
      throw e;
    }
    return this.connection;
  }

  enqueue(track) {
    this.queue.push(track);
  }

  enqueueNext(track) {
    this.queue.unshift(track);
  }

  /** Start playing if idle. Safe to call repeatedly. */
  async maybeStart() {
    if (!this.player) return;
    if (this.current) return;
    if (this.queue.length === 0) return;
    await this._playNext();
  }

  async _playNext() {
    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      return;
    }
    this.current = next;

    try {
      const proc = spawnAudioStream(next.webpageUrl);
      this.currentProc = proc;
      const resource = createAudioResource(proc.stdout, { inputType: StreamType.Arbitrary });
      this.ensurePlayer().play(resource);
      this._safeNotify(`Now playing: **${escapeMd(next.title)}**`);
    } catch (e) {
      logger.error({ err: e.message }, 'failed to start track');
      this._safeNotify(`Failed to play **${escapeMd(next.title)}**: ${e.message}`);
      this._advance();
    }
  }

  _advance() {
    this._killCurrentProc();
    this.current = null;
    if (this.queue.length === 0) {
      // Stay connected; idle is fine. (Stop command will disconnect.)
      return;
    }
    this._playNext();
  }

  _killCurrentProc() {
    if (this.currentProc) {
      try { this.currentProc.kill('SIGKILL'); } catch {}
      this.currentProc = null;
    }
  }

  skip() {
    const skipped = this.current;
    if (!skipped && this.queue.length === 0) return null;
    // Stopping the player triggers Idle -> _advance() naturally.
    if (this.player) this.player.stop(true);
    this._killCurrentProc();
    return skipped;
  }

  removeIndex(oneBased) {
    const i = oneBased - 1;
    if (i < 0 || i >= this.queue.length) return null;
    return this.queue.splice(i, 1)[0];
  }

  removeRange(startOne, endOne) {
    const start = Math.max(1, startOne) - 1;
    const end = Math.min(this.queue.length, endOne); // exclusive end after this
    if (start >= this.queue.length || end <= start) return [];
    return this.queue.splice(start, end - start);
  }

  stopAndLeave() {
    this.queue = [];
    this.current = null;
    this._killCurrentProc();
    if (this.player) {
      try { this.player.stop(true); } catch {}
    }
    if (this.connection) {
      try { this.connection.destroy(); } catch {}
      this.connection = null;
      this.voiceChannelId = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.stopAndLeave();
  }

  _safeNotify(msg) {
    if (!this.textChannel) return;
    this.textChannel.send({ content: msg }).catch((e) => {
      logger.warn({ err: e.message }, 'failed to send notify message');
    });
  }
}

function escapeMd(s) {
  return String(s).replace(/([*_~`>|\\])/g, '\\$1');
}

const guilds = new Map();

export function getMusic(guildId) {
  let g = guilds.get(guildId);
  if (!g) {
    g = new GuildMusic(guildId);
    guilds.set(guildId, g);
  }
  return g;
}

export function shutdownAll() {
  for (const g of guilds.values()) {
    try { g.destroy(); } catch {}
  }
  guilds.clear();
}
