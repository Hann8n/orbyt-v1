#!/bin/bash

# Comprehensive cache clearing script for Expo/React Native projects
# Clears Expo cache, Metro bundler cache, Gradle cache, Xcode derived data, and Watchman cache
# Usage: clear-cache.sh [ios|android|all]
#   ios     - Clear only iOS-related caches
#   android - Clear only Android-related caches
#   all     - Clear all caches (default)

# Don't use set -e - we want to handle errors gracefully and allow cancellation
set +e

PLATFORM="${1:-all}"

# Trap SIGINT (Ctrl+C) to allow graceful cancellation
GRADLE_CLEAN_PID=""
cleanup() {
  if [ -n "$GRADLE_CLEAN_PID" ] && kill -0 "$GRADLE_CLEAN_PID" 2>/dev/null; then
    echo ""
    echo "  Cancelling Gradle clean..."
    kill "$GRADLE_CLEAN_PID" 2>/dev/null || true
    wait "$GRADLE_CLEAN_PID" 2>/dev/null || true
  fi
  exit 130
}
trap cleanup SIGINT

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" && "$PLATFORM" != "all" ]]; then
  echo "❌ Invalid platform: $PLATFORM"
  echo "Usage: $0 [ios|android|all]"
  exit 1
fi

echo "🧹 Clearing caches..."

# Always clear Expo and Metro caches (shared between platforms)
echo "  Clearing Expo cache..."
rm -rf .expo 2>/dev/null || true

echo "  Clearing Metro bundler cache..."
rm -rf $TMPDIR/metro-* 2>/dev/null || true
rm -rf $TMPDIR/haste-* 2>/dev/null || true
rm -rf $TMPDIR/react-* 2>/dev/null || true
# Also clear Metro cache in common locations
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf /tmp/haste-* 2>/dev/null || true
rm -rf /tmp/react-* 2>/dev/null || true

# Android Gradle cache
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  if [ -d "android" ]; then
    echo "  Clearing Android Gradle cache..."
    cd android
    # Run gradlew clean in background so it can be interrupted
    ./gradlew clean > /dev/null 2>&1 &
    GRADLE_CLEAN_PID=$!
    # Wait for it, but allow interruption via trap
    wait $GRADLE_CLEAN_PID 2>/dev/null || true
    GRADLE_CLEAN_PID=""  # Clear PID after completion
    cd ..
  fi
fi

# Xcode derived data (macOS only)
if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  Clearing Xcode derived data..."
    rm -rf ~/Library/Developer/Xcode/DerivedData/* 2>/dev/null || true
  fi
fi

# Watchman cache (if installed) - shared, so always clear
if command -v watchman &> /dev/null; then
  echo "  Clearing Watchman cache..."
  watchman watch-del-all > /dev/null 2>&1 || true
fi

# Node modules cache (optional - commented out for speed)
# echo "  Clearing node_modules cache..."
# rm -rf node_modules/.cache 2>/dev/null || true

echo "✅ Cache clearing complete!"
