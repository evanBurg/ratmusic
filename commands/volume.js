const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'volume',
  aliases: ['v', 'set', 'set-volume'],
  inVoiceChannel: true,
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Change volume')
    .addNumberOption((option) => option.setName('volume').setDescription('Volume to set').setRequired(true)),
  run: async (client, message, args) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    const volume = parseInt(args[0]);
    if (isNaN(volume)) return message.channel.send(`${client.emotes.error} | Please enter a valid number!`);
    queue.setVolume(volume);
    message.channel.send(`${client.emotes.success} | Volume set to \`${volume}\``);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    const volume = parseInt(interaction.options.getString('volume'));
    if (isNaN(volume)) return interaction.reply({ content: `${client.emotes.error} | Please enter a valid number!` });
    queue.setVolume(volume);
    interaction.reply({ content: `${client.emotes.success} | Volume set to \`${volume}\`` });
  },
};
