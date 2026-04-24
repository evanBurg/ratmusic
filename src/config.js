import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v || v.startsWith('your-')) {
    throw new Error(`Missing or unset env var: ${name}. Edit .env and set it.`);
  }
  return v;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: required('DISCORD_GUILD_ID'),
  botCommandsChannelId: required('BOT_COMMANDS_CHANNEL_ID'),
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  logLevel: process.env.LOG_LEVEL || 'info',
  admin: {
    port: parseInt(process.env.ADMIN_PORT || '8787', 10),
    user: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'change-me',
    bind: process.env.ADMIN_BIND || '0.0.0.0',
    botService: process.env.BOT_SERVICE || 'discord-music-bot.service',
    adminService: process.env.ADMIN_SERVICE || 'discord-music-bot-admin.service',
  },
};
