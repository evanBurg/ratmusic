const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'playskip',
  aliases: ['ps'],
  inVoiceChannel: true,
  data: new SlashCommandBuilder()
    .setName('playskip')
    .setDescription('Play a song in a voice channel and skip the current song')
    .addStringOption((option) => option.setName('song').setDescription('The song to play').setRequired(true)),
  run: async (client, message, args) => {
    const string = args.join(' ');
    if (!string) return message.channel.send(`${client.emotes.error} | Please enter a song url or query to search.`);
    client.distube.play(message.member.voice.channel, string, {
      member: message.member,
      textChannel: message.channel,
      message,
      skip: true,
    });
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const string = interaction.options.getString('song');
    if (!string) return interaction.reply({ content: `${client.emotes.error} | Please enter a song url or query to search.` });
    client.distube.play(interaction.member.voice.channel, string, {
      member: interaction.member,
      textChannel: interaction.channel,
      message: false,
      skip: true,
    });
    interaction.reply({ content: `Skipping and queuing.` });
  },
};
