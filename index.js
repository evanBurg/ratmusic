const { DisTube } = require('distube');
const Discord = require('discord.js');
const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.GuildVoiceStates,
    Discord.GatewayIntentBits.MessageContent,
  ],
});
const fs = require('fs');
const config = require('./config.json');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YtDlpPlugin } = require('@distube/yt-dlp');

client.config = require('./config.json');
client.distube = new DisTube(client, {
  leaveOnStop: false,
  emitNewSongOnly: true,
  emitAddSongWhenCreatingQueue: false,
  emitAddListWhenCreatingQueue: false,
  plugins: [
    new SpotifyPlugin({
      emitEventsAfterFetching: true,
    }),
    new SoundCloudPlugin(),
    new YtDlpPlugin(),
  ],
});
client.commands = new Discord.Collection();
client.aliases = new Discord.Collection();
client.emotes = config.emoji;

const slashCommands = [];
// Construct and prepare an instance of the REST module
const rest = new Discord.REST().setToken(config.token);
fs.readdir('./commands/', async (err, files) => {
  if (err) return console.log('Could not find any commands!');
  const jsFiles = files.filter((f) => f.split('.').pop() === 'js');
  if (jsFiles.length <= 0) return console.log('Could not find any commands!');
  jsFiles.forEach((file) => {
    const cmd = require(`./commands/${file}`);
    console.log(`Loaded ${file}`);
    client.commands.set(cmd.name, cmd);
    if (cmd.aliases) cmd.aliases.forEach((alias) => client.aliases.set(alias, cmd.name));
    if ('data' in cmd && 'execute' in cmd) {
      slashCommands.push(cmd.data.toJSON());
    }
  });
  try {
    console.log(`Started refreshing ${slashCommands.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    // const guildIds = ['1198670629478608966']
    // console.log(guildIds)
    await Promise.allSettled([
      rest.put(Discord.Routes.applicationCommands(config.clientId), { body: slashCommands }),
    ]);

    console.log(`Successfully reloaded ${slashCommands.length} application (/) commands.`);
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
});

client.on('ready', () => {
  console.log(`${client.user.tag} is ready to play music.`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const prefix = config.prefix;
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();
  const cmd = client.commands.get(command) || client.commands.get(client.aliases.get(command));
  if (!cmd) return;
  if (cmd.inVoiceChannel && !message.member.voice.channel) {
    return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  }
  try {
    cmd.run(client, message, args);
  } catch (e) {
    console.error(e);
    message.reply({ content: `${client.emotes.error} There was an error trying to execute that command!` });
    message.reply({ content: Discord.codeBlock(e) });
  }
});

client.on(Discord.Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.client.commands.get(interaction.commandName);

  if (!cmd) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await cmd.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!' });
      await interaction.followUp({ content: Discord.codeBlock(error) });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!' });
      await interaction.followUp({ content: Discord.codeBlock(error) });
    }
  }
});

const status = (queue) =>
  `Volume: \`${queue.volume}%\` | Filter: \`${queue.filters.names.join(', ') || 'Off'}\` | Loop: \`${
    queue.repeatMode ? (queue.repeatMode === 2 ? 'All Queue' : 'This Song') : 'Off'
  }\` | Autoplay: \`${queue.autoplay ? 'On' : 'Off'}\``;
client.distube
  .on('playSong', (queue, song) =>
    queue.textChannel.send(`${client.emotes.play} | Playing \`${song.name}\` - \`${song.formattedDuration}\`\nRequested by: ${song.user}\n${status(queue)}`)
  )
  .on('addSong', (queue, song) => queue.textChannel.send(`${client.emotes.success} | Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}`))
  .on('addList', (queue, playlist) =>
    queue.textChannel.send(`${client.emotes.success} | Added \`${playlist.name}\` playlist (${playlist.songs.length} songs) to queue\n${status(queue)}`)
  )
  .on('error', (channel, e) => {
    if (channel) channel.send(`${client.emotes.error} | An error encountered: ${e.toString().slice(0, 1974)}`);
    else console.error(e);
  })
  .on('empty', (channel) => channel.send('Voice channel is empty! Leaving the channel...'))
  .on('searchNoResult', (message, query) => message.channel.send(`${client.emotes.error} | No result found for \`${query}\`!`))
  .on('finish', (queue) => queue.textChannel.send('Finished!'));
// // DisTubeOptions.searchSongs = true
// .on("searchResult", (message, result) => {
//     let i = 0
//     message.channel.send(
//         `**Choose an option from below**\n${result
//             .map(song => `**${++i}**. ${song.name} - \`${song.formattedDuration}\``)
//             .join("\n")}\n*Enter anything else or wait 60 seconds to cancel*`
//     )
// })
// .on("searchCancel", message => message.channel.send(`${client.emotes.error} | Searching canceled`))
// .on("searchInvalidAnswer", message =>
//     message.channel.send(
//         `${client.emotes.error} | Invalid answer! You have to enter the number in the range of the results`
//     )
// )
// .on("searchDone", () => {})

client.login(config.token);
