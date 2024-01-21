const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'skip',
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the currently playing song'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    try {
      const song = await queue.skip();
      message.channel.send(`${client.emotes.success} | Skipped! Now playing:\n${song.name}`);
    } catch (e) {
      message.channel.send(`${client.emotes.error} | ${e}`);
    }
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    try {
      const song = await queue.skip();
      interaction.reply({ content: `${client.emotes.success} | Skipped! Now playing:\n${song.name}` });
    } catch (e) {
      interaction.reply({ content: `${client.emotes.error} | ${e}` });
    }
  },
};
