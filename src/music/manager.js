
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
import {
  attachConnectionTelemetry,
  attachPlayerTelemetry,
  describeConnState,
} from './voiceTelemetry.js';

const VOICE_READY_TIMEOUT_MS = parseInt(
  process.env.VOICE_READY_TIMEOUT_MS || '20000',
  10,
);

/**
 * Per-guild music state.
 */
class GuildMusic {
  constructor(guildId) {
    this.guildId = guildId;
    this.queue = [];
    this.current = null;
    this.connection = null;
    this.player = null;
    this.textChannel = null;
    this.voiceChannelId = null;
    this.currentProc = null;
    this.destroyed = false;
    this.log = logger.child({ guildId });
  }

  ensurePlayer(reqLog = this.log) {
    if (this.player) return this.player;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    attachPlayerTelemetry(this.player, this.log.child({ component: 'player' }));

    this.player.on('error', (err) => {
      this.log.error({ err: err.message, stack: err.stack }, 'audio player error');
      this._safeNotify(`⚠️ Playback error: ${err.message}`);
      this._advance();
    });
    this.player.on(AudioPlayerStatus.Idle, () => {
      this._advance();
    });
    return this.player;
  }

  /**
   * @param {*} voiceChannel
   * @param {*} textChannel
   * @param {{log?: import('pino').Logger}} [opts]
   */
  async connect(voiceChannel, textChannel, opts = {}) {
    const reqLog = (opts.log || this.log).child({ voiceChannelId: voiceChannel.id });
    this.textChannel = textChannel;

    if (this.connection && this.voiceChannelId === voiceChannel.id) {
      reqLog.info(
        { reusing: true, status: this.connection.state?.status },
        'voice: reusing existing connection',
      );
      return this.connection;
    }

    if (this.connection) {
      reqLog.info(
        { from: this.voiceChannelId, to: voiceChannel.id },
        'voice: switching channels, destroying old connection',
      );
      try { this.connection.destroy(); } catch (e) {
        reqLog.warn({ err: e.message }, 'voice: error destroying old connection');
      }
      this.connection = null;
    }

    reqLog.info(
      {
        guildId: voiceChannel.guild.id,
        channelId: voiceChannel.id,
        channelName: voiceChannel.name,
        bitrate: voiceChannel.bitrate,
        rtcRegion: voiceChannel.rtcRegion,
        userLimit: voiceChannel.userLimit,
        memberCount: voiceChannel.members?.size,
        readyTimeoutMs: VOICE_READY_TIMEOUT_MS,
      },
      'voice: about to call joinVoiceChannel',
    );

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
      debug: true,
    });
    this.voiceChannelId = voiceChannel.id;

    attachConnectionTelemetry(this.connection, reqLog.child({ component: 'voiceConn' }));

    this.connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
      reqLog.warn(
        {
          oldStatus: oldState.status,
          newStatus: newState.status,
          reason: newState.reason,
          closeCode: newState.closeCode,
        },
        'voice: disconnected, attempting recovery',
      );
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
        reqLog.info('voice: recovered from disconnect');
      } catch (e) {
        reqLog.warn({ err: e?.message }, 'voice: recovery failed, destroying');
        this.destroy();
      }
    });

    this.connection.subscribe(this.ensurePlayer(reqLog));
    reqLog.debug('voice: subscribed audio player to connection');

    const startedAt = Date.now();
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
      const elapsedMs = Date.now() - startedAt;
      reqLog.info(
        {
          elapsedMs,
          state: describeConnState(this.connection.state),
        },
        'voice: connection READY',
      );
    } catch (e) {
      const elapsedMs = Date.now() - startedAt;
      reqLog.error(
        {
          err: e?.message,
          stack: e?.stack,
          elapsedMs,
          finalState: describeConnState(this.connection.state),
        },
        'voice: timed out waiting for READY',
      );
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

  enqueueBatch(tracks) {
    for (const t of tracks) this.queue.push(t);
  }

  enqueueNextBatch(tracks) {
    if (!tracks.length) return;
    this.queue.unshift(...tracks);
  }

  async maybeStart(reqLog = this.log) {
    if (!this.player) {
      reqLog.debug('maybeStart: no player yet');
      return;
    }
    if (this.current) {
      reqLog.debug({ current: this.current.title }, 'maybeStart: already playing');
      return;
    }
    if (this.queue.length === 0) {
      reqLog.debug('maybeStart: queue empty');
      return;
    }
    // notify=false because the caller (a slash command handler) is about to
    // post its own "Now playing: ..." reply. We only want the channel-side
    // announcement when the player auto-advances between tracks.
    await this._playNext(reqLog, { notify: false });
  }

  async _playNext(reqLog = this.log, { notify = true } = {}) {
    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      reqLog.debug('_playNext: nothing to play');
      return;
    }
    this.current = next;
    reqLog.info(
      {
        title: next.title,
        url: next.webpageUrl,
        durationSec: next.durationSec,
        requestedBy: next.requestedBy,
        notify,
      },
      'play: starting next track',
    );

    try {
      const proc = spawnAudioStream(next.webpageUrl, reqLog.child({ component: 'ytdlp-stream' }));
      this.currentProc = proc;
      const resource = createAudioResource(proc.stdout, { inputType: StreamType.Arbitrary });
      this.ensurePlayer(reqLog).play(resource);
      reqLog.info({ title: next.title }, 'play: audio resource handed to player');
      if (notify) {
        this._safeNotify(`🎶 Now playing: **${escapeMd(next.title)}**`);
      }
    } catch (e) {
      reqLog.error({ err: e.message, stack: e.stack }, 'play: failed to start track');
      this._safeNotify(`❌ Failed to play **${escapeMd(next.title)}**: ${e.message}`);
      this._advance();
    }
  }

  _advance() {
    this._killCurrentProc();
    this.current = null;
    if (this.queue.length === 0) {
      this.log.debug('advance: queue exhausted, staying connected idle');
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
    // IMPORTANT: kill the current track's yt-dlp process BEFORE stopping the
    // player. AudioPlayer events are emitted synchronously, so player.stop()
    // immediately fires Idle, which runs our _advance() handler, which calls
    // _playNext(), which spawns the NEXT track's yt-dlp and writes it to
    // this.currentProc — all before player.stop() returns. If we _killCurrentProc()
    // after stop(), we kill the brand-new track's process, which goes Idle with
    // no audio, which auto-advances again, effectively skipping two tracks.
    this._killCurrentProc();
    if (this.player) this.player.stop(true);
    return skipped;
  }

  removeIndex(oneBased) {
    const i = oneBased - 1;
    if (i < 0 || i >= this.queue.length) return null;
    return this.queue.splice(i, 1)[0];
  }

  removeRange(startOne, endOne) {
    const start = Math.max(1, startOne) - 1;
    const end = Math.min(this.queue.length, endOne);
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
      this.log.warn({ err: e.message }, 'failed to send notify message');
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
