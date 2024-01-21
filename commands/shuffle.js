const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'shuffle',
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    queue.shuffle();
    message.channel.send('Shuffled songs in the queue');
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    queue.shuffle();
    interaction.reply({ content: 'Shuffled songs in the queue' });
  },
};
