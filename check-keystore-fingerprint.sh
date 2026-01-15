#!/bin/bash
# Script to check if keystore matches Google Play's expected fingerprint

echo "=========================================="
echo "Keystore Fingerprint Checker"
echo "=========================================="
echo ""
echo "Expected fingerprint (from Google Play):"
echo "SHA1: 3B:23:01:4B:53:FF:65:67:CE:0B:9A:EB:39:15:11:11:7A:3F:43:D6"
echo ""
echo "Checking .backup/orbyt-upload-key.keystore..."
echo "You'll be prompted for the keystore password:"
echo ""

KEYSTORE_PATH=".backup/orbyt-upload-key.keystore"

if [ ! -f "$KEYSTORE_PATH" ]; then
    echo "ERROR: Keystore file not found at $KEYSTORE_PATH"
    exit 1
fi

EXPECTED_SHA1="3B:23:01:4B:53:FF:65:67:CE:0B:9A:EB:39:15:11:11:7A:3F:43:D6"

echo "Running keytool (enter password when prompted)..."
echo ""

ACTUAL_SHA1=$(keytool -list -v -keystore "$KEYSTORE_PATH" 2>&1 | grep -i "SHA1:" | head -1 | sed 's/.*SHA1: //' | tr -d ' ')

if [ -z "$ACTUAL_SHA1" ]; then
    echo "ERROR: Could not read keystore. Check your password."
    exit 1
fi

echo "Actual fingerprint:"
echo "SHA1: $ACTUAL_SHA1"
echo ""

# Normalize both (remove colons and convert to uppercase for comparison)
EXPECTED_NORM=$(echo "$EXPECTED_SHA1" | tr -d ':' | tr '[:lower:]' '[:upper:]')
ACTUAL_NORM=$(echo "$ACTUAL_SHA1" | tr -d ':' | tr '[:lower:]' '[:upper:]')

if [ "$EXPECTED_NORM" = "$ACTUAL_NORM" ]; then
    echo "✅ SUCCESS! The keystore matches Google Play's expected fingerprint!"
    echo ""
    echo "Next steps:"
    echo "1. Configure android/keystore.properties with this keystore"
    echo "2. Rebuild the AAB: cd android && ./gradlew bundleRelease"
else
    echo "❌ MISMATCH! This keystore does NOT match the expected fingerprint."
    echo ""
    echo "You need to find the keystore with fingerprint:"
    echo "SHA1: $EXPECTED_SHA1"
    echo ""
    echo "Options:"
    echo "1. Check EAS Dashboard → Your Project → Credentials → Android"
    echo "2. Check if you have other keystore backups"
    echo "3. If you used EAS for the original upload, download it from EAS"
fi
