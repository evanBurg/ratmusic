const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'filter',
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Add or remove audio filters to the currently playing song')
    .addStringOption((option) => option.setName('filter').setDescription('The filter to add or remove').setRequired(true)),
  aliases: ['filters'],
  inVoiceChannel: true,
  base: (client, filter, queue) => {
    if (filter === 'off' && queue.filters.size) queue.filters.clear();
    else if (Object.keys(client.distube.filters).includes(filter)) {
      if (queue.filters.has(filter)) queue.filters.remove(filter);
      else queue.filters.add(filter);
    }

    throw `${client.emotes.error} | Not a valid filter`;
  },
  run: async (client, message, args) => {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`);
    const filter = args[0];

    try {
      this.base(client, filter, queue);
    } catch (e) {
      return message.channel.send(e);
    }

    message.channel.send(`Current Queue Filter: \`${queue.filters.names.join(', ') || 'Off'}\``);
  },
  execute: async (interaction) => {
    const client = interaction.client;
    const queue = client.distube.getQueue(message);
    if (!queue) return interaction.reply({ content: `${client.emotes.error} | There is nothing in the queue right now!` });

    const filter = interaction.options.getString('filter') ?? 'off';

    try {
      this.base(client, filter, queue);
    } catch (e) {
      returninteraction.followUp({ content: e });
    }

    interaction.followUp({ content: `Current Queue Filter: \`${queue.filters.names.join(', ') || 'Off'}\`` });
  },
};
