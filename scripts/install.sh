#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_SYSTEMD_DIR="$HOME/.config/systemd/user"

mkdir -p "$USER_SYSTEMD_DIR"

cp -v "$REPO_ROOT/systemd/ratmusic.service"       "$USER_SYSTEMD_DIR/"
cp -v "$REPO_ROOT/systemd/ratmusic-admin.service" "$USER_SYSTEMD_DIR/"

systemctl --user daemon-reload

echo
echo "Installed user units:"
echo "  - ratmusic.service"
echo "  - ratmusic-admin.service"
echo
echo "Enable + start:"
echo "  systemctl --user enable --now ratmusic.service"
echo "  systemctl --user enable --now ratmusic-admin.service"
echo
echo "View logs:"
echo "  journalctl --user -u ratmusic.service -f"
