import { SlashCommandBuilder } from 'discord.js';
import { getMusic } from '../music/manager.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Clear the queue, stop playback, leave voice channel');

export async function execute(interaction) {
  const music = getMusic(interaction.guildId);
  const had = music.current || music.queue.length > 0;
  music.stopAndLeave();
  await interaction.reply({
    content: had ? 'Stopped, queue cleared, left the voice channel.' : 'Nothing to stop. Left voice channel if connected.',
  });
}
