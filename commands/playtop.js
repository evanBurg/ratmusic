const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'playnext',
  aliases: ['pn'],
  data: new SlashCommandBuilder()
    .setName('playnext')
    .setDescription('Play a song next in the queue')
    .addStringOption((option) => option.setName('song').setDescription('The song to play').setRequired(true)),
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const string = args.join(' ');
    if (!string) return message.channel.send(`${client.emotes.error} | Please enter a song url or query to search.`);
    client.distube.play(message.member.voice.channel, string, {
      member: message.member,
      textChannel: message.channel,
      message,
      position: 1,
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
      position: 1,
    });
    interaction.reply({ content: `Queueing this song next.` });
  },
};
