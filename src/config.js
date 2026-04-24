import 'dotenv/config';

function isUnset(v) {
  return !v || v === '' || /^your-/i.test(v);
}

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  logLevel: process.env.LOG_LEVEL || 'info',
  admin: {
    port: parseInt(process.env.ADMIN_PORT || '8787', 10),
    user: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'change-me',
    bind: process.env.ADMIN_BIND || '0.0.0.0',
    botService: process.env.BOT_SERVICE || 'ratmusic.service',
    adminService: process.env.ADMIN_SERVICE || 'ratmusic-admin.service',
  },
};

export function validateBotConfig() {
  const required = ['token', 'clientId', 'guildId'];
  const missing = required.filter((k) => isUnset(config[k]));
  if (missing.length) {
    throw new Error(
      `Missing or unset env vars: ${missing.map(k => k.toUpperCase()).join(', ')}. Edit .env on the server.`,
    );
  }
}
