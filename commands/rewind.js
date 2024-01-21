const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'rewind',
  inVoiceChannel: true,
  data: new SlashCommandBuilder()
    .setName('rewind')
    .setDescription('Rewinds the song for the specified amount of time')
    .addStringOption((option) => option.setName('time').setDescription('The amount of time to rewind (in seconds)').setRequired(true)),
  run: async (client, message, args) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    if (!args[0]) {
      return message.channel.send(`${client.emotes.error} | Please provide time (in seconds) to go rewind!`);
    }
    const time = Number(args[0]);
    if (isNaN(time)) return message.channel.send(`${client.emotes.error} | Please enter a valid number!`);
    queue.seek(queue.currentTime - time);
    message.channel.send(`Rewinded the song for ${time}!`);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    if (!interaction.options.getString('time')) {
      return interaction.reply({ content: `${client.emotes.error} | Please provide time (in seconds) to go rewind!` });
    }
    const time = Number(interaction.options.getString('time'));
    if (isNaN(time)) return interaction.reply({ content: `${client.emotes.error} | Please enter a valid number!` });
    queue.seek(queue.currentTime - time);
    interaction.reply({ content: `Rewinded the song for ${time}!` });
  },
};
