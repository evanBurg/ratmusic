const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'nowplaying',
  aliases: ['np'],
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Display the currently playing song'),
  run: async (client, message, args) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    const song = queue.songs[0];
    message.channel.send(`${client.emotes.play} | I'm playing **\`${song.name}\`**, by ${song.user}`);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    const song = queue.songs[0];
    interaction.reply({ content: `${client.emotes.play} | I'm playing **\`${song.name}\`**, by ${song.user}` });
  },
};
