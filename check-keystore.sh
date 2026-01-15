#!/bin/bash
# Script to check keystore fingerprint

echo "Checking keystore fingerprints..."
echo ""
echo "Expected fingerprint (from Google Play):"
echo "SHA1: 3B:23:01:4B:53:FF:65:67:CE:0B:9A:EB:39:15:11:11:7A:3F:43:D6"
echo ""
echo "Current AAB fingerprint:"
echo "SHA1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25"
echo ""
echo "Checking .backup/orbyt-upload-key.keystore..."
echo "You'll be prompted for the keystore password:"
echo ""

keytool -list -v -keystore .backup/orbyt-upload-key.keystore 2>&1 | grep -A 1 "SHA1:"
