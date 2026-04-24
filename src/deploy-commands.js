import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { data as play } from './commands/play.js';
import { data as skip } from './commands/skip.js';
import { data as queue } from './commands/queue.js';
import { data as stop } from './commands/stop.js';
import { data as remove } from './commands/remove.js';

const commands = [play, skip, queue, stop, remove].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

try {
  console.log(`Registering ${commands.length} guild commands to ${config.guildId}...`);
  const result = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands },
  );
  console.log(`Registered ${Array.isArray(result) ? result.length : '?'} commands successfully.`);
  process.exit(0);
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
