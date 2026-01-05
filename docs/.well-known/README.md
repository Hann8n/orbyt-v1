# Universal Links & App Links Configuration

This directory contains the association files needed for iOS Universal Links and Android App Links.

## Files

- `apple-app-site-association` - iOS Universal Links (for getorbyt.com)
- `assetlinks.json` - Android App Links (for getorbyt.com)

## Setup Instructions

### For getorbyt.com

These files should be accessible at:
- `https://getorbyt.com/.well-known/apple-app-site-association`
- `https://getorbyt.com/.well-known/assetlinks.json`

**Important:** The `apple-app-site-association` file must be served with:
- Content-Type: `application/json` (NOT `application/pkcs7-mime`)
- No file extension
- Accessible over HTTPS

### For orbyt.video

You'll need to create the same files on your orbyt.video domain:
- `https://orbyt.video/.well-known/apple-app-site-association`
- `https://orbyt.video/.well-known/assetlinks.json`

Copy the files from this directory and update them if needed.

## Required Updates

### Apple App Site Association

1. Replace `TEAM_ID` in `apple-app-site-association` with your Apple Developer Team ID
   - Find it in: [Apple Developer Portal](https://developer.apple.com/account) → Membership
   - Format: `ABC123DEF4` (10 characters)

### Android Asset Links

1. Replace `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` in `assetlinks.json` with your app's SHA-256 certificate fingerprint
   - For Google Play: Get it from Play Console → Your app → Setup → App integrity
   - For local builds: Run `keytool -list -v -keystore your-keystore.jks -alias your-alias`
   - Format: `XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX`

## Testing

### iOS
- Test Universal Links: `https://branch.io/resources/aasa-validator/`
- Or use: `xcrun simctl openurl booted "https://getorbyt.com/test"`

### Android
- Test App Links: `adb shell pm get-app-links com.orbyt.app`
- Or use: `adb shell am start -a android.intent.action.VIEW -d "https://getorbyt.com/test"`

## Verification

After deploying, verify the files are accessible:
```bash
curl https://getorbyt.com/.well-known/apple-app-site-association
curl https://getorbyt.com/.well-known/assetlinks.json
```

Both should return JSON (not HTML 404).
