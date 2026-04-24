import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import { generateDependencyReport } from '@discordjs/voice';
import { config, validateBotConfig } from './config.js';

validateBotConfig();
import { logger, nextRequestId } from './logger.js';
import { shutdownAll } from './music/manager.js';
import { handleButton } from './interactions/buttons.js';

import * as play from './commands/play.js';
import * as playnext from './commands/playnext.js';
import * as skip from './commands/skip.js';
import * as queueCmd from './commands/queue.js';
import * as stop from './commands/stop.js';
import * as remove from './commands/remove.js';

const commands = new Map([
  [play.data.name, play],
  [playnext.data.name, playnext],
  [skip.data.name, skip],
  [queueCmd.data.name, queueCmd],
  [stop.data.name, stop],
  [remove.data.name, remove],
]);

logger.info(
  { report: generateDependencyReport().split('\n') },
  'voice: @discordjs/voice dependency report',
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, (c) => {
  logger.info(
    {
      tag: c.user.tag,
      id: c.user.id,
      guildCount: c.guilds.cache.size,
    },
    'Discord client ready',
  );
});

client.on(Events.Error, (e) =>
  logger.error({ err: e?.message, stack: e?.stack }, 'discord client error'),
);
client.on(Events.Warn, (msg) => logger.warn({ msg }, 'discord client warn'));
if (process.env.DISCORD_DEBUG === '1') {
  client.on(Events.Debug, (msg) => logger.debug({ msg }, 'discord client debug'));
}

client.on(Events.InteractionCreate, async (interaction) => {
  const reqLog = logger.child({
    interactionId: interaction.id,
    interactionType: interaction.type,
    commandName: interaction.commandName,
    customId: interaction.customId,
    user: interaction.user?.tag,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });
  reqLog.debug('interaction: received');
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) {
        reqLog.warn('interaction: unknown command');
        return interaction.reply({ content: '❓ Unknown command.', flags: MessageFlags.Ephemeral });
      }
      await cmd.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
  } catch (err) {
    reqLog.error(
      { err: err?.message, stack: err?.stack },
      'interaction handler crashed',
    );
    if (interaction.isRepliable()) {
      const payload = { content: `💥 Internal error: ${err?.message || 'unknown'}`, flags: MessageFlags.Ephemeral };
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

logger.info({ rid: nextRequestId() }, 'logging in to Discord');
client.login(config.token).catch((err) => {
  logger.fatal({ err: err.message }, 'Discord login failed');
  process.exit(1);
});
