#!/usr/bin/env bash
set -euo pipefail

# Run from inside the repo root on the remote.
# Installs systemd --user units and reloads the user manager.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_SYSTEMD_DIR="$HOME/.config/systemd/user"

mkdir -p "$USER_SYSTEMD_DIR"

cp -v "$REPO_ROOT/systemd/discord-music-bot.service"       "$USER_SYSTEMD_DIR/"
cp -v "$REPO_ROOT/systemd/discord-music-bot-admin.service" "$USER_SYSTEMD_DIR/"

systemctl --user daemon-reload

echo
echo "Installed user units:"
echo "  - discord-music-bot.service"
echo "  - discord-music-bot-admin.service"
echo
echo "Enable + start:"
echo "  systemctl --user enable --now discord-music-bot.service"
echo "  systemctl --user enable --now discord-music-bot-admin.service"
echo
echo "View logs:"
echo "  journalctl --user -u discord-music-bot.service -f"
