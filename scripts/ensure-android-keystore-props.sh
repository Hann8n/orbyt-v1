#!/bin/bash
# Creates android/keystore.properties from ANDROID_* env vars for release signing.
# Used by build-all.sh and build:android-apk so bundleRelease/assembleRelease produce
# distributable AAB/APK (Play Store or sideloading).
#
# Required env (for distribution): ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
# Optional: ANDROID_KEYSTORE_PATH (default: .backup/orbyt-upload-key.keystore, relative to project root)
#
# If ANDROID_KEYSTORE_PASSWORD is unset, no file is created and release builds use debug signing.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
KEYSTORE_PROPS="$ANDROID_DIR/keystore.properties"

# Load .env so ANDROID_* vars are available when running from build scripts
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_DIR/.env"
  set +a
fi

if [ -z "${ANDROID_KEYSTORE_PASSWORD:-}" ]; then
  echo "  ⚠ ANDROID_KEYSTORE_PASSWORD not set. Release builds will use debug signing (not for Play Store distribution)."
  exit 0
fi

if [ ! -d "$ANDROID_DIR" ]; then
  echo "  ⚠ android/ not found. Run: npx expo prebuild --platform android"
  exit 0
fi

# storeFile: path for Gradle file() when evaluated from android/app (project root for app = android/app).
# Default: project root .backup/orbyt-upload-key.keystore → ../../.backup/orbyt-upload-key.keystore
if [ -n "${ANDROID_KEYSTORE_PATH:-}" ]; then
  if [[ "$ANDROID_KEYSTORE_PATH" = /* ]]; then
    STORE_FILE="$ANDROID_KEYSTORE_PATH"
    REAL_PATH="$ANDROID_KEYSTORE_PATH"
  else
    STORE_FILE="../../$ANDROID_KEYSTORE_PATH"
    REAL_PATH="$PROJECT_DIR/$ANDROID_KEYSTORE_PATH"
  fi
else
  STORE_FILE="../../.backup/orbyt-upload-key.keystore"
  REAL_PATH="$PROJECT_DIR/.backup/orbyt-upload-key.keystore"
fi

KEY_ALIAS="${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS is required when ANDROID_KEYSTORE_PASSWORD is set}"
KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-$ANDROID_KEYSTORE_PASSWORD}"

if [ ! -f "$REAL_PATH" ]; then
  echo "  ❌ Keystore not found: $REAL_PATH"
  exit 1
fi

# Escape for properties: no surrounding quotes; newlines in values would break the file
printf "storeFile=%s\nstorePassword=%s\nkeyAlias=%s\nkeyPassword=%s\n" \
  "$STORE_FILE" "$ANDROID_KEYSTORE_PASSWORD" "$KEY_ALIAS" "$KEY_PASSWORD" \
  > "$KEYSTORE_PROPS"

echo "  ✅ android/keystore.properties created for release signing"
