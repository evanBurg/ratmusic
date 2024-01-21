const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'autoplay',
  inVoiceChannel: true,
  data: new SlashCommandBuilder().setName('autoplay').setDescription('Allow the bot to play related songs after queue ends'),
  run: async (client, message) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    const autoplay = queue.toggleAutoplay();
    message.channel.send(`${client.emotes.success} | AutoPlay: \`${autoplay ? 'On' : 'Off'}\``);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!`});
    const autoplay = queue.toggleAutoplay();
    interaction.reply({ content: `${client.emotes.success} | AutoPlay: \`${autoplay ? 'On' : 'Off'}\``});
  },
};
