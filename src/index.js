import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { config, validateBotConfig } from './config.js';

validateBotConfig();
import { logger } from './logger.js';
import { shutdownAll } from './music/manager.js';
import { handleButton } from './interactions/buttons.js';

import * as play from './commands/play.js';
import * as skip from './commands/skip.js';
import * as queueCmd from './commands/queue.js';
import * as stop from './commands/stop.js';
import * as remove from './commands/remove.js';

const commands = new Map([
  [play.data.name, play],
  [skip.data.name, skip],
  [queueCmd.data.name, queueCmd],
  [stop.data.name, stop],
  [remove.data.name, remove],
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, (c) => {
  logger.info({ tag: c.user.tag, id: c.user.id }, 'Discord client ready');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      // Channel restriction: only respond inside the configured #bot-commands channel
      if (interaction.channelId !== config.botCommandsChannelId) {
        return interaction.reply({
          content: `Please use this command in <#${config.botCommandsChannelId}>.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const cmd = commands.get(interaction.commandName);
      if (!cmd) {
        return interaction.reply({ content: 'Unknown command.', flags: MessageFlags.Ephemeral });
      }
      await cmd.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      // Same channel restriction for buttons
      if (interaction.channelId !== config.botCommandsChannelId) {
        return interaction.reply({
          content: `Please use bot controls in <#${config.botCommandsChannelId}>.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      await handleButton(interaction);
      return;
    }
  } catch (err) {
    logger.error({ err: err?.message, stack: err?.stack }, 'interaction handler crashed');
    if (interaction.isRepliable()) {
      const payload = { content: `Internal error: ${err?.message || 'unknown'}`, flags: MessageFlags.Ephemeral };
      try {
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch {}
    }
  }
});

const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  try { shutdownAll(); } catch {}
  client.destroy().finally(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => logger.error({ err: e?.message, stack: e?.stack }, 'unhandled rejection'));
process.on('uncaughtException', (e) => logger.error({ err: e?.message, stack: e?.stack }, 'uncaught exception'));

client.login(config.token).catch((err) => {
  logger.fatal({ err: err.message }, 'Discord login failed');
  process.exit(1);
});
