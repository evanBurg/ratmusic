const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'repeat',
  aliases: ['loop', 'rp'],
  data: new SlashCommandBuilder().setName('repeat').setDescription('Toggle repeat mode'),
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
    let mode = null;
    switch (args[0]) {
      case 'off':
        mode = 0;
        break;
      case 'song':
        mode = 1;
        break;
      case 'queue':
        mode = 2;
        break;
    }
    mode = queue.setRepeatMode(mode);
    mode = mode ? (mode === 2 ? 'Repeat queue' : 'Repeat song') : 'Off';
    message.channel.send(`${client.emotes.repeat} | Set repeat mode to \`${mode}\``);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(interaction);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing playing!` });
    let mode = null;
    switch (interaction.options.getString('mode')) {
      case 'off':
        mode = 0;
        break;
      case 'song':
        mode = 1;
        break;
      case 'queue':
        mode = 2;
        break;
    }
    mode = queue.setRepeatMode(mode);
    mode = mode ? (mode === 2 ? 'Repeat queue' : 'Repeat song') : 'Off';
    interaction.reply({ content: `${client.emotes.repeat} | Set repeat mode to \`${mode}\`` });
  },
};
