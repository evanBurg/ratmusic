const Discord = require('discord.js');

const name = 'help';

module.exports = {
  name: name,
  aliases: ['h', 'cmd', 'command'],
  data: new Discord.SlashCommandBuilder().setName(name).setDescription('List the commands available'),
  run: async (client, message) => {
    message.channel.send({
      embeds: [
        new Discord.EmbedBuilder()
          .setTitle('Commands')
          .setDescription(client.commands.map((cmd) => `\`${cmd.name}\``).join(', '))
          .setColor('Blurple'),
      ],
    });
  },
  execute: async (interaction) => {
    const client = interaction.client;
    interaction.reply({
      embeds: [
        new Discord.EmbedBuilder()
          .setTitle('Commands')
          .setDescription(client.commands.map((cmd) => `\`${cmd.name}\``).join(', '))
          .setColor('Blurple'),
      ],
    });
  },
};
