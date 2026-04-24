import { MessageFlags } from 'discord.js';
import { getMusic } from '../music/manager.js';
import { resolveQuery, formatDuration } from '../music/resolver.js';
import { logger } from '../logger.js';

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
  const rawQuery = interaction.options.getString('query') ?? '';
  const query = rawQuery.trim();
  if (!query) {
    return interaction.reply({
      content:
        'Please supply a query (URL or search text). If Discord did not show the input field, refresh your client (Ctrl+R) and try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = interaction.member;
  const voice = member?.voice?.channel;
  if (!voice) {
    return interaction.reply({
      content: 'You need to be in a voice channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  let track;
  try {
    track = await resolveQuery(query, interaction.user.id);
  } catch (e) {
    logger.warn({ err: e.message, query }, 'resolve failed');
    return interaction.editReply({
      content: `Could not resolve **${truncate(query, 100)}**: ${e.message}`,
    });
  }

  const music = getMusic(interaction.guildId);

  try {
    await music.connect(voice, interaction.channel);
  } catch (e) {
    return interaction.editReply({
      content: `Could not join your voice channel: ${e.message}`,
    });
  }

  if (atFront) {
    music.enqueueNext(track);
  } else {
    music.enqueue(track);
  }

  const wasIdle = !music.current;
  await music.maybeStart();

  let where;
  if (wasIdle) {
    where = 'Now playing';
  } else if (atFront) {
    where = 'Playing next';
  } else {
    const position = music.queue.length;
    where = `Added to queue (position **#${position}**)`;
  }

  await interaction.editReply({
    content: `${where}: **${truncate(track.title, 200)}** \`[${formatDuration(track.durationSec)}]\``,
  });
}
