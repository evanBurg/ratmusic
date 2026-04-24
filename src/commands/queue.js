import { SlashCommandBuilder } from 'discord.js';
import { getMusic } from '../music/manager.js';
import { queueEmbed, queueButtons } from '../music/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Show the current music queue');

export async function execute(interaction) {
  const music = getMusic(interaction.guildId);
  const empty = !music.current && music.queue.length === 0;
  await interaction.reply({
    embeds: [queueEmbed(music)],
    components: [queueButtons(empty)],
  });
}
