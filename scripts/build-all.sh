#!/bin/bash

# Unified build workflow script
# Clears caches, increments build numbers, and builds Android AAB and/or iOS archive locally
# Usage: build-all.sh [ios|android|all]
#   ios     - Build only iOS
#   android - Build only Android
#   all     - Build both (default)

# Don't use set -e - we want to handle errors explicitly and show verbose output
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# Parse platform argument
PLATFORM="${1:-all}"
if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" && "$PLATFORM" != "all" ]]; then
  echo "❌ Invalid platform: $PLATFORM"
  echo "Usage: $0 [ios|android|all]"
  exit 1
fi

# Progress indicator function
spinner() {
  local pid=$1
  local message=$2
  local spinstr='|/-\'
  local delay=0.15
  while kill -0 $pid 2>/dev/null; do
    local temp=${spinstr#?}
    printf "\r  %s [%c] " "$message" "$spinstr"
    local spinstr=$temp${spinstr%"$temp"}
    sleep $delay
  done
  # Don't print success here - let the caller handle it based on exit code
  printf "\r  %s " "$message"
}

echo "🚀 Starting unified build workflow..."
echo ""

# Step 1: Clear all caches
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Clearing caches"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bash "$SCRIPT_DIR/clear-cache.sh" "$PLATFORM"
echo ""

# Step 2: Increment build numbers
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Incrementing build numbers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx tsx scripts/update-version.ts increment-build
echo ""

# Step 2.5: Set OTA update channel to preview for beta builds
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2.5: Configuring OTA update channel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
export EXPO_PUBLIC_EAS_UPDATE_CHANNEL="preview"
echo "  ✅ OTA update channel configured for: preview (beta testers)"
echo "  📝 Note: To publish OTA updates, run: eas update --channel preview --message \"Your update message\""
echo ""

# Step 3: Ensure native directories exist
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Preparing native projects"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Prebuild Android if needed
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  # Always run prebuild for Android to ensure config plugins run (they configure dependencies)
  # Prebuild is safe to run multiple times - it updates configs without destroying custom code
  echo "  Running Android prebuild (ensures plugins configure dependencies)..."
  BUILD_LOG="/tmp/build_output_$$.log"
  npx expo prebuild --platform android > "$BUILD_LOG" 2>&1 &
  PREBUILD_PID=$!
  spinner $PREBUILD_PID "Running Android prebuild"
  wait $PREBUILD_PID
  PREBUILD_EXIT=$?
  if [ $PREBUILD_EXIT -ne 0 ]; then
    echo "[✗]"
    echo ""
    echo "❌ Android prebuild failed with exit code $PREBUILD_EXIT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Full output:"
    if [ -f "$BUILD_LOG" ]; then
      cat "$BUILD_LOG"
    else
      echo "  (No log file found at $BUILD_LOG)"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    rm -f "$BUILD_LOG"
    exit 1
  fi
  echo "[✓]"
  rm -f "$BUILD_LOG"
fi

# Prebuild iOS if needed
if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  if [ ! -d "ios" ]; then
    echo "  Generating iOS native project..."
    BUILD_LOG="/tmp/build_output_$$.log"
    npx expo prebuild --platform ios > "$BUILD_LOG" 2>&1 &
    PREBUILD_PID=$!
    spinner $PREBUILD_PID "Running iOS prebuild"
    wait $PREBUILD_PID
    PREBUILD_EXIT=$?
    if [ $PREBUILD_EXIT -ne 0 ]; then
      echo "[✗]"
      echo ""
      echo "❌ iOS prebuild failed with exit code $PREBUILD_EXIT"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "Full output:"
      if [ -f "$BUILD_LOG" ]; then
        cat "$BUILD_LOG"
      else
        echo "  (No log file found at $BUILD_LOG)"
      fi
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      rm -f "$BUILD_LOG"
      exit 1
    fi
    echo "[✓]"
    rm -f "$BUILD_LOG"
  else
    echo "  iOS native project exists, skipping prebuild"
    # Sync version and build number from app.json to iOS project files
    echo "  Syncing version from app.json to iOS project..."
    APP_VERSION=$(node -p "require('./app.json').expo.version")
    BUILD_NUMBER=$(node -p "require('./app.json').expo.ios?.buildNumber || '1'" 2>/dev/null || echo "1")
    
    if [ -n "$APP_VERSION" ] && [[ "$OSTYPE" == "darwin"* ]]; then
      # Update Info.plist CFBundleShortVersionString and CFBundleVersion
      if [ -f "ios/orbyt/Info.plist" ]; then
        /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" ios/orbyt/Info.plist 2>/dev/null || true
        /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" ios/orbyt/Info.plist 2>/dev/null || true
      fi
      
      # Update project.pbxproj MARKETING_VERSION and CURRENT_PROJECT_VERSION
      if [ -f "ios/orbyt.xcodeproj/project.pbxproj" ]; then
        sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $APP_VERSION;/g" ios/orbyt.xcodeproj/project.pbxproj 2>/dev/null || true
        sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/g" ios/orbyt.xcodeproj/project.pbxproj 2>/dev/null || true
      fi
      echo "  ✅ Synced version to $APP_VERSION (build $BUILD_NUMBER)"
    fi
  fi
fi
echo ""

# Step 4: Build Android AAB
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Step 4: Building Android AAB"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ -d "android" ]; then
  cd android
  echo "  Building (this may take several minutes)..."
  BUILD_LOG="/tmp/build_output_$$.log"
  # Run gradle and capture output
  ./gradlew bundleRelease > "$BUILD_LOG" 2>&1 &
  GRADLE_PID=$!
  spinner $GRADLE_PID "Building Android AAB"
  wait $GRADLE_PID
  GRADLE_EXIT=$?
  cd ..
  
  # Check exit code and show appropriate output
  if [ $GRADLE_EXIT -eq 0 ]; then
    echo "[✓]"
    echo "✅ Android AAB built successfully!"
    echo "   Location: android/app/build/outputs/bundle/release/app-release.aab"
    rm -f "$BUILD_LOG"
  else
    echo "[✗]"
    echo ""
    echo "❌ Android build failed with exit code $GRADLE_EXIT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Full build output:"
    if [ -f "$BUILD_LOG" ]; then
      cat "$BUILD_LOG"
    else
      echo "  (No log file found at $BUILD_LOG)"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    rm -f "$BUILD_LOG"
    exit 1
  fi
  else
    echo "❌ Android directory not found. Run prebuild first."
    exit 1
  fi
  echo ""
fi

# Step 5: Build iOS Archive
if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Step 5: Building iOS Archive"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "⚠️  iOS builds require macOS. Skipping iOS build."
    echo ""
    echo "✅ Build workflow complete"
    exit 0
  fi

  if [ ! -d "ios" ]; then
    echo "❌ iOS directory not found. Run prebuild first."
    exit 1
  fi

  # Find the workspace and project
  WORKSPACE_PATH=$(find ios -name "*.xcworkspace" -type d | head -1)
  PROJECT_PATH=$(find ios -name "*.xcodeproj" -type d -not -path "*/Pods/*" | head -1)
  
  if [ -z "$WORKSPACE_PATH" ] && [ -z "$PROJECT_PATH" ]; then
    echo "❌ Could not find Xcode workspace or project. Run prebuild first."
    exit 1
  fi

  # Always try to find the app scheme from the main project first (not Pods)
  # This ensures we get the actual app target, not a Pod dependency
  SCHEME_NAME=""
  if [ -n "$PROJECT_PATH" ]; then
    SCHEME_NAME=$(xcodebuild -list -project "$PROJECT_PATH" 2>/dev/null | \
      grep -A 10 "Schemes:" | grep -v "Schemes:" | \
      grep -v "^[[:space:]]*$" | head -1 | xargs)
  fi
  
  # If no scheme found in project, try workspace (but filter out Pod schemes)
  if [ -z "$SCHEME_NAME" ] && [ -n "$WORKSPACE_PATH" ]; then
    # Get all schemes and filter out known Pod/library schemes
    SCHEME_NAME=$(xcodebuild -list -workspace "$WORKSPACE_PATH" 2>/dev/null | \
      grep -A 100 "Schemes:" | grep -v "Schemes:" | \
      grep -v "^[[:space:]]*$" | \
      grep -v -i "pods\|easclient\|exconstants\|eximage\|exjson\|exmanifests\|expoasset\|expoatproto\|expobackground\|expoblur\|expocamera\|expoclipboard\|expodevice\|expodynamic\|expofilesystem\|expofont\|expoglass\|expohaptics\|expohead\|expoimage\|expokeep\|expolinear\|expolinking\|expomedia\|expomodules\|exposcreen\|exposecure\|exposplash\|exposystem\|expovideo\|expoweb\|expostructured" | \
      head -1 | xargs)
  fi

  if [ -z "$SCHEME_NAME" ]; then
    echo "❌ Could not find a valid app scheme in Xcode project."
    echo "   Found workspace: ${WORKSPACE_PATH:-none}"
    echo "   Found project: ${PROJECT_PATH:-none}"
    echo "   Please ensure your iOS project has a scheme configured."
    exit 1
  fi
  
  # Determine if we should use workspace or project for building
  # Always use workspace if available (required for CocoaPods), otherwise use project
  if [ -n "$WORKSPACE_PATH" ]; then
    USE_WORKSPACE=true
  else
    USE_WORKSPACE=false
  fi

  echo "  Workspace: ${WORKSPACE_PATH:-$PROJECT_PATH}"
  echo "  Scheme: $SCHEME_NAME"
  echo ""

  # Ensure CocoaPods are installed (required when using workspace)
  if [ "$USE_WORKSPACE" = true ] && [ -f "ios/Podfile" ]; then
    echo "  Running pod install..."
    (cd ios && pod install)
    if [ $? -ne 0 ]; then
      echo "❌ pod install failed. Fix the errors above and try again."
      exit 1
    fi
    echo "  ✅ pod install complete"
    echo ""
  fi

  # Use Xcode's default Archives location so it appears in Organizer
  # Format: ~/Library/Developer/Xcode/Archives/YYYY-MM-DD/AppName YYYY-MM-DD HH.MM.SS.xcarchive
  ARCHIVES_DIR="$HOME/Library/Developer/Xcode/Archives"
  ARCHIVE_DATE=$(date +%Y-%m-%d)
  ARCHIVE_TIME=$(date +%H.%M.%S)
  ARCHIVE_DATE_DIR="$ARCHIVES_DIR/$ARCHIVE_DATE"
  
  # Get app name for archive name
  APP_NAME=$(node -p "require('./app.json').expo.name" 2>/dev/null || echo "orbyt")
  ARCHIVE_NAME="${APP_NAME} ${ARCHIVE_DATE} ${ARCHIVE_TIME}.xcarchive"
  ARCHIVE_PATH="$ARCHIVE_DATE_DIR/$ARCHIVE_NAME"
  
  # Create archives directory if it doesn't exist
  mkdir -p "$ARCHIVE_DATE_DIR"
  
  echo "  Archive will be saved to: $ARCHIVE_PATH"
  echo "  (This will appear in Xcode Organizer)"
  echo ""

  # Build and archive with proper settings
  echo "  Building and archiving (this may take several minutes)..."
  echo "  Note: Archives require valid code signing setup."
  BUILD_LOG="/tmp/build_output_$$.log"
  
  # DEVELOPMENT_TEAM: use env var, or expo.ios.developmentTeam from app.json
  TEAM_ID="${DEVELOPMENT_TEAM}"
  if [ -z "$TEAM_ID" ]; then
    TEAM_ID=$(node -p "require('./app.json').expo?.ios?.developmentTeam || ''" 2>/dev/null | tr -d '\n' || true)
  fi
  [ "$TEAM_ID" = "undefined" ] && TEAM_ID=""
  BUILD_SETTINGS="CODE_SIGN_STYLE=Automatic"
  [ -n "$TEAM_ID" ] && BUILD_SETTINGS="DEVELOPMENT_TEAM=$TEAM_ID $BUILD_SETTINGS"
  
  # Build command with best practices:
  # - Use workspace if available (required for CocoaPods)
  # - Allow provisioning updates for automatic signing
  # - Set SDK to iphoneos
  # - Use Release configuration
  if [ "$USE_WORKSPACE" = true ]; then
    xcodebuild archive \
      -workspace "$WORKSPACE_PATH" \
      -scheme "$SCHEME_NAME" \
      -configuration Release \
      -sdk iphoneos \
      -archivePath "$ARCHIVE_PATH" \
      -allowProvisioningUpdates \
      -allowProvisioningDeviceRegistration \
      $BUILD_SETTINGS \
      > "$BUILD_LOG" 2>&1 &
  else
    xcodebuild archive \
      -project "$PROJECT_PATH" \
      -scheme "$SCHEME_NAME" \
      -configuration Release \
      -sdk iphoneos \
      -archivePath "$ARCHIVE_PATH" \
      -allowProvisioningUpdates \
      -allowProvisioningDeviceRegistration \
      $BUILD_SETTINGS \
      > "$BUILD_LOG" 2>&1 &
  fi
  
  XCODE_PID=$!
  spinner $XCODE_PID "Building iOS archive"
  wait $XCODE_PID
  XCODE_EXIT=$?

  # Check exit code AND verify archive actually contains the app bundle
  ARCHIVE_VALID=0
  if [ $XCODE_EXIT -eq 0 ]; then
    # Verify the archive actually contains an app bundle
    APP_BUNDLE=$(find "$ARCHIVE_PATH/Products/Applications" -name "*.app" -type d -maxdepth 2 2>/dev/null | head -1)
    
    if [ -z "$APP_BUNDLE" ]; then
      ARCHIVE_VALID=1
      echo "[✗]"
      echo ""
      echo "⚠️  Archive created but is missing the app bundle!"
      echo "   The Products/Applications directory is empty or incomplete."
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "Common causes and solutions:"
      echo ""
      echo "1. SKIP_INSTALL misconfigured:"
      echo "   → Check in Xcode: Build Settings → SKIP_INSTALL"
      echo "   → App target should have SKIP_INSTALL = NO"
      echo "   → Library/framework targets should have SKIP_INSTALL = YES"
      echo ""
      echo "2. Code signing issues:"
      echo "   → Open Xcode → Select your app target → Signing & Capabilities"
      echo "   → Enable 'Automatically manage signing' and select your Team"
      echo "   → Ensure you have a valid development/distribution certificate"
      echo ""
      echo "3. Scheme configuration:"
      echo "   → In Xcode: Product → Scheme → Edit Scheme"
      echo "   → Archive → Build → Ensure only your app target is checked"
      echo "   → Remove any library/framework targets from the build list"
      echo ""
      echo "4. Missing Info.plist keys:"
      echo "   → Ensure CFBundleIdentifier, CFBundleExecutable are set"
      echo "   → Check Release configuration has all required settings"
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "Build log (last 50 lines):"
      if [ -f "$BUILD_LOG" ]; then
        tail -50 "$BUILD_LOG" | sed 's/^/  /'
        echo ""
        echo "  Full log saved to: $BUILD_LOG"
      fi
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
      echo "💡 Troubleshooting steps:"
      echo "   1. Open the project in Xcode: ${WORKSPACE_PATH:-$PROJECT_PATH}"
      echo "   2. Product → Archive"
      echo "   3. Review any errors in the Xcode UI"
      echo "   4. Ensure code signing is configured: Signing & Capabilities tab"
      rm -f "$BUILD_LOG"
      exit 1
    fi
  fi

  if [ $XCODE_EXIT -eq 0 ] && [ $ARCHIVE_VALID -eq 0 ]; then
    echo "[✓]"
    echo "✅ iOS Archive built successfully!"
    echo "   Location: $ARCHIVE_PATH"
    echo "   App Bundle: $(basename "$APP_BUNDLE")"
    echo ""
    echo "📦 To create an IPA file, use Xcode Organizer:"
    echo "   1. Open Xcode → Window → Organizer"
    echo "   2. Select your archive → Distribute App"
    echo "   3. Choose distribution method (App Store, Ad Hoc, etc.)"
    rm -f "$BUILD_LOG"
  else
    echo "[✗]"
    echo ""
    echo "❌ iOS archive build failed with exit code $XCODE_EXIT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Build log (last 100 lines):"
    if [ -f "$BUILD_LOG" ]; then
      tail -100 "$BUILD_LOG" | sed 's/^/  /'
      echo ""
      echo "  Full log saved to: $BUILD_LOG"
    else
      echo "  (No log file found at $BUILD_LOG)"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Check code signing in Xcode (Signing & Capabilities tab)"
    echo "   2. Ensure your Apple Developer account is configured"
    echo "   3. Try archiving manually in Xcode for detailed error messages"
    echo "   4. Verify scheme builds the app target, not a library/framework"
    rm -f "$BUILD_LOG"
    exit 1
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Build workflow complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 Build outputs:"
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  echo "   Android AAB: android/app/build/outputs/bundle/release/app-release.aab"
fi
if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  echo "   iOS Archive: $ARCHIVE_PATH"
  echo "   Open in Organizer: Xcode → Window → Organizer"
fi
