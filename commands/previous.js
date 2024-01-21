const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'previous',
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('previous').setDescription('Play the previous song'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    const song = queue.previous();
    message.channel.send(`${client.emotes.success} | Now playing:\n${song.name}`);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    const song = queue.previous();
    interaction.reply({ content: `${client.emotes.success} | Now playing:\n${song.name}` });
  },
};
