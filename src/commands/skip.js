import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getMusic } from '../music/manager.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the currently playing song');

export async function execute(interaction) {
  const music = getMusic(interaction.guildId);
  if (!music.current && music.queue.length === 0) {
    return interaction.reply({ content: '🤷 Nothing is playing.', flags: MessageFlags.Ephemeral });
  }
  const skipped = music.skip();
  await interaction.reply({
    content: skipped ? `⏭️ Skipped **${escapeMd(skipped.title)}**.` : '⏭️ Skipped.',
  });
}

function escapeMd(s) {
  return String(s).replace(/([*_~`>|\\])/g, '\\$1');
}
