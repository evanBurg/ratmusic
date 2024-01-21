const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'seek',
  inVoiceChannel: true,
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a position in the song')
    .addStringOption((option) => option.setName('time').setDescription('Position to seek to (in seconds)').setRequired(true)),
  run: async (client, message, args) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    if (!args[0]) {
      return message.channel.send(`${client.emotes.error} | Please provide position (in seconds) to seek!`);
    }
    const time = Number(args[0]);
    if (isNaN(time)) return message.channel.send(`${client.emotes.error} | Please enter a valid number!`);
    queue.seek(time);
    message.channel.send(`Seeked to ${time}!`);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    if (!interaction.options.getString('time')) {
      return interaction.reply({ content: `${client.emotes.error} | Please provide position (in seconds) to seek!` });
    }
    const time = Number(interaction.options.getString('time'));
    if (isNaN(time)) return interaction.reply({ content: `${client.emotes.error} | Please enter a valid number!` });
    queue.seek(time);
    interaction.reply({ content: `Seeked to ${time}!` });
  },
};
