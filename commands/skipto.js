const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'skipto',
  inVoiceChannel: true,
  data: new SlashCommandBuilder()
    .setName('skipto')
    .setDescription('Skip to the selected song in the queue')
    .addNumberOption((option) => option.setName('queueindex').setDescription('The index of the song in the queue to skip to').setRequired(true)),
  run: async (client, message, args) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    if (!args[0]) {
      return message.channel.send(`${client.emotes.error} | Please provide time (in seconds) to go rewind!`);
    }
    const num = Number(args[0]);
    if (isNaN(num)) return message.channel.send(`${client.emotes.error} | Please enter a valid number!`);
    await client.distube.jump(message, num).then((song) => {
      message.channel.send({ content: `Skipped to: ${song.name}` });
    });
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    const guild = interaction.command.guild;
    const queueIndex = Number(interaction.options.getString('queueindex'));
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    if (isNaN(queueIndex)) return interaction.reply({ content: `${client.emotes.error} | Please enter a valid number!` });
    await client.distube.jump(guild, queueIndex).then((song) => {
      interaction.reply({ content: `Skipped to: ${song.name}` });
    });
  },
};
