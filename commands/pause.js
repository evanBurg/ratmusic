const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'pause',
  aliases: ['pause', 'hold'],
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the currently playing song'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    if (queue.paused) {
      queue.resume();
      return message.channel.send('Resumed the song for you :)');
    }
    queue.pause();
    message.channel.send('Paused the song for you :)');
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    if (queue.paused) {
      queue.resume();
      return interaction.reply({ content: 'Resumed the song for you :)' });
    }
    queue.pause();
    interaction.reply({ content: 'Paused the song for you :)' });
  },
};
