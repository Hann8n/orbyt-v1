# Universal Links & App Links Setup Instructions

## ✅ What's Been Configured

1. **App Configuration (`app.json`)**
   - ✅ iOS associated domains for `getorbyt.com` and `orbyt.video`
   - ✅ Android intent filters for both domains
   - ✅ Custom scheme: `com.getorbyt://`

2. **Association Files Created**
   - ✅ `apple-app-site-association` (iOS Universal Links)
   - ✅ `assetlinks.json` (Android App Links)

3. **Deep Link Parser**
   - ✅ Updated to handle both `getorbyt.com` and `orbyt.video` domains

## 🔧 Required Actions

### Step 1: Update Apple App Site Association

Edit `docs/.well-known/apple-app-site-association`:

1. Replace `TEAM_ID` with your Apple Developer Team ID
   - Find it at: https://developer.apple.com/account → Membership
   - Example: If your Team ID is `ABC123DEF4`, change:
     ```json
     "appID": "ABC123DEF4.com.getorbyt.app"
     ```

### Step 2: Update Android Asset Links

Edit `docs/.well-known/assetlinks.json`:

1. Replace `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` with your app's SHA-256 fingerprint

   **Option A: From Google Play Console (Recommended)**
   - Go to: Play Console → Your App → Setup → App integrity
   - Copy the "SHA-256 certificate fingerprint" from "App signing key certificate"
   - Format: `XX:XX:XX:XX:...` (64 characters with colons)

   **Option B: From Local Keystore**
   ```bash
   keytool -list -v -keystore android/app/your-keystore.jks -alias your-alias
   ```
   Look for "SHA256:" in the output

   **Option C: From EAS Build**
   - If using EAS Build, the fingerprint is automatically generated
   - Check your EAS build logs or use: `eas credentials`

### Step 3: Deploy Files to getorbyt.com

Ensure these files are accessible at:
- `https://getorbyt.com/.well-known/apple-app-site-association`
- `https://getorbyt.com/.well-known/assetlinks.json`

**Important for iOS:**
- The `apple-app-site-association` file must:
  - Be served with `Content-Type: application/json`
  - Have no file extension
  - Be accessible over HTTPS
  - Return 200 status (not 301/302 redirect)

**Server Configuration Example (Nginx):**
```nginx
location /.well-known/apple-app-site-association {
    default_type application/json;
    add_header Content-Type application/json;
}
```

### Step 4: Deploy Files to orbyt.video

Copy the same files to your `orbyt.video` domain:
- `https://orbyt.video/.well-known/apple-app-site-association`
- `https://orbyt.video/.well-known/assetlinks.json`

Update the files if needed (they should be identical).

## 🧪 Testing

### Test iOS Universal Links

1. **Online Validator:**
   - https://branch.io/resources/aasa-validator/
   - Enter: `https://getorbyt.com`

2. **Device Test:**
   ```bash
   xcrun simctl openurl booted "https://getorbyt.com/profile/jack.orbyt.video"
   ```

3. **Notes App Test:**
   - Type a link like `https://getorbyt.com/test` in Notes
   - Long press → Should show "Open in orbyt"

### Test Android App Links

1. **Command Line:**
   ```bash
   adb shell pm get-app-links com.orbyt.app
   ```

2. **Test Link:**
   ```bash
   adb shell am start -a android.intent.action.VIEW -d "https://getorbyt.com/test"
   ```

3. **Verify:**
   ```bash
   adb shell pm verify-app-links --re-verify com.orbyt.app
   ```

### Verify File Accessibility

```bash
# Check iOS file
curl -I https://getorbyt.com/.well-known/apple-app-site-association
# Should return: Content-Type: application/json

# Check Android file
curl https://getorbyt.com/.well-known/assetlinks.json
# Should return JSON, not HTML
```

## 📝 Supported URL Formats

After setup, these URLs will open in your app:

- `https://getorbyt.com/profile/jack.orbyt.video`
- `https://getorbyt.com/post/at://did:plc:.../app.bsky.feed.post/...`
- `https://orbyt.video/profile/jack.orbyt.video`
- `https://orbyt.video/post/at://did:plc:.../app.bsky.feed.post/...`
- `com.getorbyt://profile/jack.orbyt.video`

## 🔍 Troubleshooting

### iOS Universal Links Not Working

1. **Check file accessibility:**
   ```bash
   curl https://getorbyt.com/.well-known/apple-app-site-association
   ```

2. **Verify Content-Type:**
   - Must be `application/json`, not `text/html`

3. **Check Team ID:**
   - Ensure it matches your Apple Developer account

4. **Reinstall app:**
   - Universal Links are cached, reinstall to refresh

### Android App Links Not Working

1. **Verify fingerprint:**
   - Must match the exact certificate used to sign the app

2. **Check autoVerify:**
   - Ensure `autoVerify: true` in `app.json` intent filters

3. **Verify domain:**
   ```bash
   adb shell pm get-app-links com.orbyt.app
   ```
   - Should show your domains as verified

4. **Clear app data:**
   - Settings → Apps → orbyt → Clear data

## 📚 Additional Resources

- [Apple Universal Links Documentation](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app)
- [Android App Links Documentation](https://developer.android.com/training/app-links)
- [Expo Linking Documentation](https://docs.expo.dev/versions/latest/sdk/linking/)
