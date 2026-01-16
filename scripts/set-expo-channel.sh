#!/bin/bash

# Script to automatically set Expo update channel based on Xcode build configuration
# Usage: Called as a build phase in Xcode

set -e

# Get the build configuration (Debug or Release)
CONFIGURATION="${CONFIGURATION:-Release}"
# Get the build action (build, install, etc.)
ACTION="${ACTION:-build}"

# Determine channel based on build action
# Archive builds (ACTION=install) should use preview
# All other builds from Xcode should use development
if [ "$ACTION" = "install" ]; then
  CHANNEL="preview"
else
  CHANNEL="development"
fi

# Path to Expo.plist
EXPO_PLIST="${SRCROOT}/orbyt/Supporting/Expo.plist"

if [ ! -f "$EXPO_PLIST" ]; then
  echo "Error: Expo.plist not found at $EXPO_PLIST"
  exit 1
fi

# Use PlistBuddy to update the channel
/usr/libexec/PlistBuddy -c "Set :EXUpdatesRequestHeaders:expo-channel-name $CHANNEL" "$EXPO_PLIST" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Add :EXUpdatesRequestHeaders dict" "$EXPO_PLIST" 2>/dev/null && \
/usr/libexec/PlistBuddy -c "Add :EXUpdatesRequestHeaders:expo-channel-name string $CHANNEL" "$EXPO_PLIST" 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :EXUpdatesRequestHeaders:expo-channel-name $CHANNEL" "$EXPO_PLIST"

echo "✅ Set Expo update channel to: $CHANNEL (Configuration: $CONFIGURATION, Action: $ACTION)"
