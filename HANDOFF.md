# ratmusic — handoff to next agent

This file is a short-hand brief for the next agent. The full prior conversation
is in `transcript.jsonl` next to this file (251 lines of JSONL). Read it for
deep context, but the essentials are below.

## Where to run

The next agent should run **directly on the server** at
`~/ratmusic/` on `kev@kev-plex-server` (10.88.111.22). All previous work was
done on a developer machine and rsync'd over — the on-disk state at
`~/ratmusic/` is the source of truth.

- Node: nvm-managed v20.20.2 (PATH: `$HOME/.nvm/versions/node/v20.20.2/bin`).
  `~/.bashrc` already sources nvm so interactive shells have `node`/`pnpm`.
- Package manager: pnpm (`pnpm install`, `pnpm test`, `pnpm start`).
- Tests: `pnpm test` (Vitest, 57 passing).
- Git remote: `git@github.com:evanBurg/ratmusic.git`.

> ⚠️ The latest **logging revamp is on disk only — NOT committed/pushed**.
> If you `git reset --hard origin/main` you will lose it. Either commit
> first, or work from the on-disk state and push when happy.
> The staging copy on the dev box has the same files in
> `/home/kev/ratmusic-staging/`.

## Current bug being investigated

Voice connection fails with `"Could not join your voice channel: The
operation was aborted"`. The bot briefly joins the voice channel visually,
then leaves after ~15-20 seconds. The error is from
`@discordjs/voice`'s `entersState(connection, Ready, …)` timing out.

### Things already ruled out

1. **Encryption library was missing.** `libsodium-wrappers@0.7.16` ships a
   broken ESM build (imports `./libsodium.mjs` which doesn't exist).
   Replaced with `@noble/ciphers@2.2.0` (pure JS, no native build).
   `generateDependencyReport()` now shows `@noble/ciphers: 2.2.0`.
2. **Interaction token expiry (10062).** `_addToQueue.js` now calls
   `interaction.deferReply()` as the first action, wrapped in try/catch.
3. **Stale slash command cache.** `src/deploy-commands.js` clears global
   commands before re-registering guild commands.

So the remaining failure mode is the voice handshake itself stalling
between Connecting and Ready (most likely UDP punch-through or AEAD
handshake silently failing). The fresh logging will tell us exactly which
networking sub-state we get stuck in.

## What the new logging gives you

Every `/play` now emits a series of log lines tagged with a stable
`reqId`. Run with debug + pretty:

```bash
cd ~/ratmusic
LOG_LEVEL=debug LOG_PRETTY=1 node src/index.js
```

Then trigger `/play <song>` in `#bot-commands` and look for, in order:

- `cmd: received` → `cmd: deferReply ok` → `cmd: validated, resolving`
- `resolve: built yt-dlp target` → `yt-dlp: spawn (resolve)` → `yt-dlp: resolve OK`
- `cmd: resolved track` → `voice: about to call joinVoiceChannel`
- `voice: connection state change` (one per transition) — each one carries
  `networking.code` + `networking.name` (`OpeningWs` / `Identifying` /
  `UdpHandshaking` / `SelectingProtocol` / `Ready` / `Closed`) and the
  `udpRemote` Discord told us to use, plus `encryptionMode` once chosen.
- `voice: connection READY` (success) **OR** `voice: timed out waiting for
  READY` with `finalState` showing the last networking sub-state we
  reached.
- `play: starting next track` → `yt-dlp: spawn (stream)` → `yt-dlp: first
  audio bytes` (with TTFB).
- `audio: player state change` (Idle → Buffering → Playing).

Useful env vars (all already wired):

- `LOG_LEVEL=debug` — turn on debug-level logs.
- `LOG_PRETTY=1` — force pino-pretty (default when stdout is a TTY).
- `DISCORD_DEBUG=1` — also stream the discord.js gateway debug stream.
- `VOICE_READY_TIMEOUT_MS=20000` — how long to wait for Ready (default 20s,
  bump to 60000 if you want more slack while debugging).

## Useful files to skim first

- `src/music/manager.js` — `connect()` is where the voice handshake lives.
- `src/music/voiceTelemetry.js` — `attachConnectionTelemetry` /
  `attachPlayerTelemetry` (you can extend these if you need more detail).
- `src/music/resolver.js` — `spawnAudioStream()` now logs TTFB, byte
  counts, and forwards yt-dlp stderr.
- `src/commands/_addToQueue.js` — generates `reqId`, defers immediately,
  threads a child logger into resolver + manager.
- `src/index.js` — logs `generateDependencyReport()` at startup and tags
  every interaction.

## Services

Both `ratmusic.service` and `ratmusic-admin.service` are currently
**inactive and disabled** (per user request, so the human-driven debug
loop owns the bot process). Re-enable when ready:

```bash
systemctl --user enable --now ratmusic.service ratmusic-admin.service
```

## Next likely diagnostic steps

1. Run the bot in foreground with `LOG_LEVEL=debug` and one `/play`. Note
   which `networking.name` is the last one before timeout.
2. If stuck at `UdpHandshaking` → host can't UDP-punch out to the
   `udpRemote.ip:port` Discord chose. Test with
   `nc -u <ip> <port>` from the server, then poke at firewall / NAT /
   Plex network rules.
3. If stuck at `SelectingProtocol` or it transitions to `Closed` with
   `closeCode=4006/4014` → encryption negotiation problem; consider
   installing `sodium-native` (needs build toolchain, allowlist in
   `package.json` `pnpm.onlyBuiltDependencies`).
4. If we hit `Ready` but the player never leaves `Buffering` → yt-dlp
   stream isn't yielding bytes; check `yt-dlp: first audio bytes` (or its
   absence) and the stderr tail.

Good hunting.
