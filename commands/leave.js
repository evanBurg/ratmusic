const { SlashCommandBuilder } = require('discord.js');

const name = 'leave';

module.exports = {
  name,
  data: new SlashCommandBuilder().setName(name).setDescription('Ask the bot to leave the voice channel'),
  run: async (client, message) => {
    client.distube.voices.leave(message);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    client.distube.voices.leave(interaction);
    interaction.reply({ content: 'Leaving the voice channel.' })
  },
};
