#!/bin/bash
# Script to rebuild AAB with correct keystore

echo "=========================================="
echo "Rebuilding Android App Bundle (AAB)"
echo "=========================================="
echo ""

# Check if keystore.properties is configured
if grep -q "<enter-your" android/keystore.properties; then
    echo "⚠️  WARNING: keystore.properties still has placeholder values!"
    echo "Please edit android/keystore.properties and fill in the passwords first."
    exit 1
fi

echo "Cleaning previous build..."
cd android
./gradlew clean

echo ""
echo "Building release AAB..."
./gradlew bundleRelease

echo ""
echo "=========================================="
echo "Build complete!"
echo "=========================================="
echo ""
echo "AAB location:"
echo "android/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "To verify the signature fingerprint:"
echo "apksigner verify --print-certs android/app/build/outputs/bundle/release/app-release.aab | grep SHA1"
