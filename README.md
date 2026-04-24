ratmusic

Personal Discord music bot. Slash commands, yt-dlp resolution (YouTube, YouTube Music, Spotify, SoundCloud, keyword search), per-guild queue, and a LAN-accessible admin web panel.

Commands

- /play QUERY      - add to end of queue (YouTube, YouTube Music, Spotify, SoundCloud URLs, or keyword search)
- /playnext QUERY  - insert at front of queue (plays right after current song)
- /skip            - skip the current song
- /queue           - show queue with Skip/Stop buttons
- /stop            - clear queue, stop, leave voice channel
- /remove SEL      - remove single (e.g. 3) or range (e.g. 1-7 inclusive)

The bot listens in any channel where it can see slash commands. Restrict where it
runs by editing the command's permissions in **Server Settings → Integrations →
ratmusic** (per-channel allow/deny) or by removing the bot's "Use Application
Commands" permission from channels where you don't want it.

Admin Panel

http://SERVER_IP:8787 from your LAN. HTTP Basic auth.
Features: live log tail, restart bot, stop bot, git pull and restart.

Setup

  cp .env.example .env
  nano .env     # fill in DISCORD_TOKEN, IDs, ADMIN_PASSWORD
  pnpm install
  pnpm run deploy
  pnpm start

Tests

  pnpm test          # run the Vitest suite once
  pnpm test:watch    # watch mode

Files

- src/index.js              bot entrypoint
- src/deploy-commands.js    registers slash commands with your guild
- src/commands/             slash command handlers
- src/music/                queue, player, URL resolver
- src/web/server.js         admin web panel
- systemd/                  user-mode systemd units
- test/                     Vitest test suite
