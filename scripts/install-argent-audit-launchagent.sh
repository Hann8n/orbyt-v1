#!/usr/bin/env bash
set -euo pipefail

SOURCE_PLIST="/Users/jack/orbyt-master/orbyt/scripts/launchd/com.orbyt.argent-audit.plist"
TARGET_PLIST="$HOME/Library/LaunchAgents/com.orbyt.argent-audit.plist"
LABEL="com.orbyt.argent-audit"

if [[ ! -f "$SOURCE_PLIST" ]]; then
  echo "Source plist not found: $SOURCE_PLIST" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cp "$SOURCE_PLIST" "$TARGET_PLIST"

launchctl unload "$TARGET_PLIST" >/dev/null 2>&1 || true
launchctl load "$TARGET_PLIST"
launchctl start "$LABEL"

echo "Installed and started launch agent: $LABEL"
echo "Plist: $TARGET_PLIST"
