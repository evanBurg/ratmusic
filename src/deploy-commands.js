import { REST, Routes } from 'discord.js';
import { config, validateBotConfig } from './config.js';

validateBotConfig();

import { data as play } from './commands/play.js';
import { data as playnext } from './commands/playnext.js';
import { data as skip } from './commands/skip.js';
import { data as queue } from './commands/queue.js';
import { data as stop } from './commands/stop.js';
import { data as remove } from './commands/remove.js';

const commands = [play, playnext, skip, queue, stop, remove].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

try {
  console.log('Clearing any global application commands...');
  await rest.put(Routes.applicationCommands(config.clientId), { body: [] });

  console.log(`Registering ${commands.length} guild commands to ${config.guildId}...`);
  const result = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands },
  );
  console.log(`Registered ${Array.isArray(result) ? result.length : '?'} commands successfully.`);
  console.log('Tip: in Discord, press Ctrl+R (or Cmd+R) to refresh the slash command cache.');
  process.exit(0);
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
