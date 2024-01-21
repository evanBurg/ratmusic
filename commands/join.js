const { Constants } = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');

const name = 'join';

module.exports = {
  name,
  aliases: ['move'],
  data: new SlashCommandBuilder().setName(name).setDescription('Asks the bot to join your voice channel'),
  run: async (client, message, args) => {
    let voiceChannel = message.member.voice.channel;
    if (args[0]) {
      voiceChannel = await client.channels.fetch(args[0]);
      if (!Constants.VoiceBasedChannelTypes.includes(voiceChannel?.type)) {
        return message.channel.send(`${client.emotes.error} | ${args[0]} is not a valid voice channel!`);
      }
    }
    if (!voiceChannel) {
      return message.channel.send(`${client.emotes.error} | You must be in a voice channel or enter a voice channel id!`);
    }
    client.distube.voices.join(voiceChannel);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    let voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: `${client.emotes.error} | You must be in a voice channel!`,
        
      });
    }
    client.distube.voices.join(voiceChannel);
    interaction.reply({ content: `Joining ${voiceChannel.name}` });
  },
};
