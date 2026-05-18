#!/bin/bash

set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

PLATFORM="${1:-all}"
if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" && "$PLATFORM" != "all" ]]; then
  echo "❌ Invalid platform: $PLATFORM"
  echo "Usage: $0 [ios|android|all]"
  exit 1
fi

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
  printf "\r  %s " "$message"
}

build_android() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Building Android AAB"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  bash "$SCRIPT_DIR/ensure-android-keystore-props.sh" || exit 1
  if [ ! -f "$PROJECT_DIR/android/keystore.properties" ]; then
    echo "❌ android/keystore.properties not found. Release AAB requires .env with:"
    echo "   ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD"
    echo "   Optional: ANDROID_KEYSTORE_PATH (default: .backup/orbyt-upload-key.keystore)"
    echo "   Copy .env.example to .env and fill in your keystore credentials."
    return 1
  fi
  if [ -d "android" ]; then
    cd android
    echo "  Building (this may take several minutes)..."
    BUILD_LOG="/tmp/build_output_android_$$.log"
    ./gradlew bundleRelease > "$BUILD_LOG" 2>&1 &
    GRADLE_PID=$!
    spinner $GRADLE_PID "Building Android AAB"
    wait $GRADLE_PID
    GRADLE_EXIT=$?
    cd ..
    
    if [ $GRADLE_EXIT -eq 0 ]; then
      echo "[✓]"
      echo "✅ Android AAB built successfully!"
      echo "   Location: android/app/build/outputs/bundle/release/app-release.aab"
      rm -f "$BUILD_LOG"
      return 0
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
      return 1
    fi
  else
    echo "❌ Android directory not found. Run prebuild first."
    return 1
  fi
}

build_ios() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Building iOS Archive"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "⚠️  iOS builds require macOS. Skipping iOS build."
    return 0
  fi

  if [ ! -d "ios" ]; then
    echo "❌ iOS directory not found. Run prebuild first."
    return 1
  fi

  WORKSPACE_PATH=$(find ios -name "*.xcworkspace" -type d | head -1)
  PROJECT_PATH=$(find ios -name "*.xcodeproj" -type d -not -path "*/Pods/*" | head -1)
  
  if [ -z "$WORKSPACE_PATH" ] && [ -z "$PROJECT_PATH" ]; then
    echo "❌ Could not find Xcode workspace or project. Run prebuild first."
    return 1
  fi

  SCHEME_NAME=""
  if [ -n "$PROJECT_PATH" ]; then
    SCHEME_NAME=$(xcodebuild -list -project "$PROJECT_PATH" 2>/dev/null | \
      grep -A 10 "Schemes:" | grep -v "Schemes:" | \
      grep -v "^[[:space:]]*$" | head -1 | xargs)
  fi
  
  if [ -z "$SCHEME_NAME" ] && [ -n "$WORKSPACE_PATH" ]; then
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
    return 1
  fi
  
  if [ -n "$WORKSPACE_PATH" ]; then
    USE_WORKSPACE=true
  else
    USE_WORKSPACE=false
  fi

  echo "  Workspace: ${WORKSPACE_PATH:-$PROJECT_PATH}"
  echo "  Scheme: $SCHEME_NAME"
  echo ""

  if [ "$USE_WORKSPACE" = true ] && [ -f "ios/Podfile" ]; then
    echo "  Running pod install..."
    (cd ios && pod install)
    if [ $? -ne 0 ]; then
      echo "❌ pod install failed. Fix the errors above and try again."
      return 1
    fi
    echo "  ✅ pod install complete"
    echo ""
  fi

  ARCHIVES_DIR="$HOME/Library/Developer/Xcode/Archives"
  ARCHIVE_DATE=$(date +%Y-%m-%d)
  ARCHIVE_TIME=$(date +%H.%M.%S)
  ARCHIVE_DATE_DIR="$ARCHIVES_DIR/$ARCHIVE_DATE"
  
  APP_NAME=$(node -e "const config = require('./app.config.js'); console.log(config.name);" 2>/dev/null || echo "orbyt")
  ARCHIVE_NAME="${APP_NAME} ${ARCHIVE_DATE} ${ARCHIVE_TIME}.xcarchive"
  export ARCHIVE_PATH="$ARCHIVE_DATE_DIR/$ARCHIVE_NAME"
  
  mkdir -p "$ARCHIVE_DATE_DIR"
  
  echo "  Archive will be saved to: $ARCHIVE_PATH"
  echo "  (This will appear in Xcode Organizer)"
  echo ""

  echo "  Building and archiving (this may take several minutes)..."
  echo "  Note: Archives require valid code signing setup."
  BUILD_LOG="/tmp/build_output_ios_$$.log"
  
  TEAM_ID="${DEVELOPMENT_TEAM}"
  if [ -z "$TEAM_ID" ]; then
    TEAM_ID=$(node -e "const config = require('./app.config.js'); console.log(config.ios?.appleTeamId || '');" 2>/dev/null | tr -d '\n' || true)
  fi
  [ "$TEAM_ID" = "undefined" ] && TEAM_ID=""
  BUILD_SETTINGS="CODE_SIGN_STYLE=Automatic"
  [ -n "$TEAM_ID" ] && BUILD_SETTINGS="DEVELOPMENT_TEAM=$TEAM_ID $BUILD_SETTINGS"
  
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

  ARCHIVE_VALID=0
  if [ $XCODE_EXIT -eq 0 ]; then
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
      return 1
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
    return 0
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
    return 1
  fi
}

echo "🚀 Starting unified build workflow..."
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Incrementing build numbers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx tsx scripts/update-version.ts increment-build
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Preparing native projects"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
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
    echo "  Syncing version from app.config.js to iOS project..."
    APP_VERSION=$(node -e "const config = require('./app.config.js'); console.log(config.version);")
    BUILD_NUMBER=$(node -e "const config = require('./app.config.js'); console.log(config.ios?.buildNumber || '1');" 2>/dev/null || echo "1")
    
    if [ -n "$APP_VERSION" ] && [[ "$OSTYPE" == "darwin"* ]]; then
      if [ -f "ios/orbyt/Info.plist" ]; then
        /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" ios/orbyt/Info.plist 2>/dev/null || true
        /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" ios/orbyt/Info.plist 2>/dev/null || true
      fi
      
      if [ -f "ios/orbyt.xcodeproj/project.pbxproj" ]; then
        sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $APP_VERSION;/g" ios/orbyt.xcodeproj/project.pbxproj 2>/dev/null || true
        sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/g" ios/orbyt.xcodeproj/project.pbxproj 2>/dev/null || true
      fi
      echo "  ✅ Synced version to $APP_VERSION (build $BUILD_NUMBER)"
    fi
  fi
fi
echo ""

if [[ "$PLATFORM" == "all" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Step 3: Building Android and iOS in parallel"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  build_android &
  ANDROID_PID=$!
  
  build_ios &
  IOS_PID=$!
  
  wait $ANDROID_PID
  ANDROID_EXIT=$?
  
  wait $IOS_PID
  IOS_EXIT=$?
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Build Results:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ $ANDROID_EXIT -eq 0 ]; then
    echo "✅ Android: SUCCESS"
  else
    echo "❌ Android: FAILED"
  fi
  
  if [ $IOS_EXIT -eq 0 ]; then
    echo "✅ iOS: SUCCESS"
  else
    echo "❌ iOS: FAILED"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if [ $ANDROID_EXIT -ne 0 ] || [ $IOS_EXIT -ne 0 ]; then
    exit 1
  fi
elif [[ "$PLATFORM" == "android" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Step 3: Building Android AAB"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  build_android || exit 1
elif [[ "$PLATFORM" == "ios" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Step 3: Building iOS Archive"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  build_ios || exit 1
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
  if [[ -n "$ARCHIVE_PATH" ]]; then
    echo "   iOS Archive: $ARCHIVE_PATH"
  else
    echo "   iOS Archive: See build output above for location"
  fi
  echo "   Open in Organizer: Xcode → Window → Organizer"
fi
