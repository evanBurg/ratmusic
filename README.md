Discord Music Bot

Personal Discord music bot. Slash commands, yt-dlp resolution (YouTube, YouTube Music, Spotify, SoundCloud, keyword search), per-guild queue, and a LAN-accessible admin web panel.

Commands

- /play QUERY  - YouTube, YouTube Music, Spotify, SoundCloud URLs, or keyword search (first result)
- /skip        - skip the current song
- /queue       - show queue with Skip/Stop buttons
- /stop        - clear queue, stop, leave voice channel
- /remove SEL  - remove single (e.g. 3) or range (e.g. 1-7 inclusive)

All commands only work in the channel ID set in BOT_COMMANDS_CHANNEL_ID.

Admin Panel

http://SERVER_IP:8787 from your LAN. HTTP Basic auth.
Features: live log tail, restart bot, stop bot, git pull and restart.

Setup

  cp .env.example .env
  nano .env     # fill in DISCORD_TOKEN, IDs, ADMIN_PASSWORD
  pnpm install
  pnpm run deploy
  pnpm start

Files

- src/index.js              bot entrypoint
- src/deploy-commands.js    registers slash commands with your guild
- src/commands/             slash command handlers
- src/music/                queue, player, URL resolver
- src/web/server.js         admin web panel
- systemd/                  user-mode systemd units
