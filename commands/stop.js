const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'stop',
  aliases: ['disconnect', 'leave'],
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop playing music'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    queue.stop();
    message.channel.send(`${client.emotes.success} | Stopped!`);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    queue.stop();
    interaction.reply({ content: `${client.emotes.success} | Stopped!` });
  },
};
