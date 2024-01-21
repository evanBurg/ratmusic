const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'resume',
  aliases: ['resume', 'unpause'],
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume the currently playing song'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    if (queue.paused) {
      queue.resume();
      message.channel.send('Resumed the song for you :)');
    } else {
      message.channel.send('The queue is not paused!');
    }
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });
    if (queue.paused) {
      queue.resume();
      interaction.reply({ content: 'Resumed the song for you :)' });
    } else {
      interaction.reply({ content: 'The queue is not paused!' });
    }
  },
};
