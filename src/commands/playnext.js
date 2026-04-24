import { SlashCommandBuilder } from 'discord.js';
import { addToQueue } from './_addToQueue.js';

export const data = new SlashCommandBuilder()
  .setName('playnext')
  .setDescription('Add a song to the front of the queue (plays after the current song)')
  .addStringOption((o) =>
    o
      .setName('query')
      .setDescription('YouTube / YouTube Music / Spotify / SoundCloud URL, or keyword search')
      .setRequired(true),
  );

export async function execute(interaction) {
  return addToQueue(interaction, { atFront: true });
}
