import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getMusic } from '../music/manager.js';
import { resolveQuery, formatDuration } from '../music/resolver.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Add a song to the queue')
  .addStringOption((o) =>
    o.setName('query')
      .setDescription('YouTube / YouTube Music / Spotify / SoundCloud URL, or keyword search')
      .setRequired(true),
  );

export async function execute(interaction) {
  const member = interaction.member;
  const voice = member?.voice?.channel;
  if (!voice) {
    return interaction.reply({ content: 'You need to be in a voice channel.', flags: MessageFlags.Ephemeral });
  }

  const query = interaction.options.getString('query', true);
  await interaction.deferReply();

  let track;
  try {
    track = await resolveQuery(query, interaction.user.id);
  } catch (e) {
    logger.warn({ err: e.message, query }, 'resolve failed');
    return interaction.editReply({ content: `Could not resolve **${truncate(query, 100)}**: ${e.message}` });
  }

  const music = getMusic(interaction.guildId);

  try {
    await music.connect(voice, interaction.channel);
  } catch (e) {
    return interaction.editReply({ content: `Could not join your voice channel: ${e.message}` });
  }

  music.enqueue(track);
  const position = music.current ? music.queue.length : 0;
  await music.maybeStart();

  const where = position === 0
    ? 'Now playing'
    : `Added to queue (position **#${position}**)`;
  await interaction.editReply({
    content: `${where}: **${truncate(track.title, 200)}** \`[${formatDuration(track.durationSec)}]\``,
  });
}

function truncate(s, n) {
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
