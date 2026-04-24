import { getMusic } from '../music/manager.js';
import { resolveQuery, formatDuration } from '../music/resolver.js';
import { logger, nextRequestId } from '../logger.js';

function truncate(s, n) {
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/**
 * Shared logic for /play and /playnext.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{ atFront: boolean }} opts
 */
export async function addToQueue(interaction, { atFront }) {
  const reqId = nextRequestId();
  const cmd = atFront ? 'playnext' : 'play';
  const reqLog = logger.child({
    reqId,
    cmd,
    user: interaction.user?.tag,
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    interactionId: interaction.id,
  });
  reqLog.info('cmd: received');

  try {
    await interaction.deferReply();
    reqLog.debug('cmd: deferReply ok');
  } catch (e) {
    reqLog.warn(
      { err: e.message, code: e.code },
      'cmd: deferReply failed (interaction expired before handler ran)',
    );
    return;
  }

  const rawQuery = interaction.options.getString('query') ?? '';
  const query = rawQuery.trim();
  if (!query) {
    reqLog.warn('cmd: empty query');
    return interaction.editReply({
      content:
        '⚠️ Please supply a query (URL or search text). If Discord did not show the input field, refresh your client (Ctrl+R) and try again.',
    });
  }

  const member = interaction.member;
  const voice = member?.voice?.channel;
  if (!voice) {
    reqLog.warn('cmd: user not in voice channel');
    return interaction.editReply({
      content: '🎙️ You need to be in a voice channel.',
    });
  }
  reqLog.info(
    {
      voiceChannelId: voice.id,
      voiceChannelName: voice.name,
      query: truncate(query, 200),
    },
    'cmd: validated, resolving',
  );

  let tracks;
  let playlist;
  try {
    const result = await resolveQuery(query, interaction.user.id, reqLog);
    tracks = result.tracks;
    playlist = result.playlist;
    reqLog.info(
      {
        trackCount: tracks.length,
        playlistTitle: playlist?.title,
        firstTitle: tracks[0]?.title,
      },
      'cmd: resolved',
    );
  } catch (e) {
    reqLog.warn({ err: e.message }, 'cmd: resolve failed');
    return interaction.editReply({
      content: `❌ Could not resolve **${truncate(query, 100)}**: ${e.message}`,
    });
  }

  const music = getMusic(interaction.guildId);

  try {
    await music.connect(voice, interaction.channel, { log: reqLog });
  } catch (e) {
    reqLog.error({ err: e.message }, 'cmd: voice connect failed');
    return interaction.editReply({
      content: `🚫 Could not join your voice channel: ${e.message}`,
    });
  }

  const wasIdle = !music.current;

  if (playlist) {
    if (atFront) {
      music.enqueueNextBatch(tracks);
    } else {
      music.enqueueBatch(tracks);
    }
    reqLog.info(
      { atFront, addedTracks: tracks.length, queueLen: music.queue.length, hasCurrent: !!music.current },
      'cmd: enqueued playlist',
    );

    await music.maybeStart(reqLog);

    const totalSec = tracks.reduce((a, t) => a + (t.durationSec || 0), 0);
    const lengthHint = totalSec > 0 ? ` \`[${formatDuration(totalSec)} total]\`` : '';
    const truncHint = playlist.truncated
      ? ` _(showing first ${tracks.length} of ${playlist.totalEntries}; rest skipped)_`
      : '';

    let header;
    if (wasIdle) {
      header = `▶️ Now playing playlist 📃 **${truncate(playlist.title, 150)}** — **${tracks.length}** track(s)${lengthHint}${truncHint}\n🎵 First up: **${truncate(tracks[0].title, 150)}** \`[${formatDuration(tracks[0].durationSec)}]\``;
    } else if (atFront) {
      header = `⏭️ Queued playlist 📃 **${truncate(playlist.title, 150)}** to play next — **${tracks.length}** track(s)${lengthHint}${truncHint}`;
    } else {
      const startPos = music.queue.length - tracks.length + 1;
      header = `➕ Added playlist 📃 **${truncate(playlist.title, 150)}** to the queue — **${tracks.length}** track(s) (positions **#${startPos}–#${music.queue.length}**)${lengthHint}${truncHint}`;
    }

    await interaction.editReply({ content: header });
    reqLog.info({ wasIdle, atFront, kind: 'playlist' }, 'cmd: replied OK');
    return;
  }

  const track = tracks[0];

  if (atFront) {
    music.enqueueNext(track);
  } else {
    music.enqueue(track);
  }
  reqLog.info(
    { atFront, queueLen: music.queue.length, hasCurrent: !!music.current },
    'cmd: enqueued',
  );

  await music.maybeStart(reqLog);

  let where;
  if (wasIdle) {
    where = '▶️ Now playing';
  } else if (atFront) {
    where = '⏭️ Playing next';
  } else {
    const position = music.queue.length;
    where = `➕ Added to queue (position **#${position}**)`;
  }

  await interaction.editReply({
    content: `${where}: **${truncate(track.title, 200)}** \`[${formatDuration(track.durationSec)}]\``,
  });
  reqLog.info({ where, kind: 'single' }, 'cmd: replied OK');
}
