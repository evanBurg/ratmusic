const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'queue',
  aliases: ['q'],
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the queue'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
    const q = queue.songs.map((song, i) => `${i === 0 ? 'Playing:' : `${i}.`} ${song.name} - \`${song.formattedDuration}\``).join('\n');
    message.channel.send(`${client.emotes.queue} | **Server Queue**\n${q}`);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing playing!` });
    const q = queue.songs.map((song, i) => `${i === 0 ? 'Playing:' : `${i}.`} ${song.name} - \`${song.formattedDuration}\``).join('\n');
    interaction.reply({ content: `${client.emotes.queue} | **Server Queue**\n${q}` });
  },
};
