# Testing Universal Links & App Links

## Prerequisites

Before testing, ensure:
1. ✅ Association files are deployed and accessible via HTTPS
2. ✅ iOS: App is installed on a physical device (simulator works but device is better)
3. ✅ Android: App is installed on a device
4. ✅ Files are served with correct Content-Type headers

## Step 1: Verify Files Are Accessible

### Check iOS Association File

```bash
# Test getorbyt.com
curl -I https://getorbyt.com/.well-known/apple-app-site-association

# Should return:
# Content-Type: application/json
# HTTP/1.1 200 OK

# Test orbyt.video
curl -I https://orbyt.video/.well-known/apple-app-site-association
```

**Important:** The file must:
- Return HTTP 200 (not 301/302 redirect)
- Have `Content-Type: application/json`
- Be accessible over HTTPS

### Check Android Association File

```bash
# Test getorbyt.com
curl https://getorbyt.com/.well-known/assetlinks.json

# Should return JSON, not HTML
# Test orbyt.video
curl https://orbyt.video/.well-known/assetlinks.json
```

### Validate File Content

```bash
# Check iOS file content
curl https://getorbyt.com/.well-known/apple-app-site-association | jq .

# Check Android file content
curl https://getorbyt.com/.well-known/assetlinks.json | jq .
```

## Step 2: Test iOS Universal Links

### Method 1: Online Validator (Recommended)

1. Go to: https://branch.io/resources/aasa-validator/
2. Enter your domain: `getorbyt.com` or `orbyt.video`
3. Click "Validate"
4. Check for:
   - ✅ File is accessible
   - ✅ Valid JSON format
   - ✅ Correct Team ID and Bundle ID
   - ✅ Paths are configured correctly

### Method 2: Notes App Test (Easiest)

1. Open **Notes** app on your iPhone
2. Type a link: `https://getorbyt.com/profile/jack.orbyt.video`
3. Long press the link
4. You should see **"Open in orbyt"** option
5. Tap it → Should open your app

### Method 3: Safari Test

1. Open **Safari** on your iPhone
2. Navigate to: `https://getorbyt.com/test`
3. The link should open directly in your app (not Safari)
4. If it opens in Safari, universal links aren't working

### Method 4: Command Line (Simulator)

```bash
# Open link in iOS Simulator
xcrun simctl openurl booted "https://getorbyt.com/profile/jack.orbyt.video"

# Or for orbyt.video
xcrun simctl openurl booted "https://orbyt.video/profile/jack.orbyt.video"
```

### Method 5: Messages/Email Test

1. Send yourself a message with: `https://getorbyt.com/test`
2. Tap the link
3. Should open in your app

## Step 3: Test Android App Links

### Method 1: Command Line Verification

```bash
# Check if domains are verified
adb shell pm get-app-links com.orbyt.app

# Should show:
# com.orbyt.app:
#   ID: ...
#   Signatures: [YOUR_SHA256_FINGERPRINT]
#   Domain verification state:
#     getorbyt.com: verified
#     orbyt.video: verified
```

### Method 2: Test Link Opening

```bash
# Test opening a link
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d "https://getorbyt.com/profile/jack.orbyt.video" \
  com.orbyt.app

# Or for orbyt.video
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d "https://orbyt.video/profile/jack.orbyt.video" \
  com.orbyt.app
```

### Method 3: Browser Test

1. Open **Chrome** on your Android device
2. Navigate to: `https://getorbyt.com/test`
3. Tap "Open in app" banner (if shown)
4. Or the link should open directly in your app

### Method 4: Force Re-verification

```bash
# Force Android to re-verify app links
adb shell pm verify-app-links --re-verify com.orbyt.app

# Check verification status
adb shell pm get-app-links --user cur com.orbyt.app
```

## Step 4: Test Deep Link Parsing

### Test URLs That Should Work

```bash
# Profile links
https://getorbyt.com/profile/jack.orbyt.video
https://orbyt.video/profile/jack.orbyt.video
https://getorbyt.com/profile/did:plc:abc123

# Post links (if you have post routes)
https://getorbyt.com/post/at://did:plc:.../app.bsky.feed.post/...
https://orbyt.video/post/at://did:plc:.../app.bsky.feed.post/...

# Channel links
https://getorbyt.com/channel/at://did:plc:.../app.bsky.feed.generator/...

# Custom scheme
com.getorbyt://profile/jack.orbyt.video
```

## Troubleshooting

### iOS Universal Links Not Working

1. **Check file accessibility:**
   ```bash
   curl -v https://getorbyt.com/.well-known/apple-app-site-association
   ```
   - Must return 200, not 301/302
   - Must have `Content-Type: application/json`

2. **Reinstall the app:**
   - iOS caches the association file
   - Delete app → Reinstall from App Store/TestFlight
   - iOS downloads AASA on first install

3. **Check Team ID:**
   - Verify `D8VXFBV8SJ` matches your Apple Developer account
   - Check in: https://developer.apple.com/account → Membership

4. **Check Bundle ID:**
   - Must match exactly: `com.getorbyt.app`
   - Check in: Xcode → Signing & Capabilities

5. **Check Associated Domains:**
   - In Xcode, verify: `applinks:getorbyt.com` and `applinks:orbyt.video`
   - Should be in: Signing & Capabilities → Associated Domains

6. **Test with validator:**
   - Use: https://branch.io/resources/aasa-validator/
   - Fix any errors shown

### Android App Links Not Working

1. **Check fingerprint:**
   ```bash
   # Get your app's fingerprint
   adb shell pm get-app-links com.orbyt.app
   ```
   - Must match exactly what's in `assetlinks.json`

2. **Verify file is accessible:**
   ```bash
   curl https://getorbyt.com/.well-known/assetlinks.json
   ```
   - Must return JSON, not HTML
   - Must be served over HTTPS

3. **Check autoVerify:**
   - In `app.json`, ensure `autoVerify: true` in intent filters

4. **Clear app data:**
   - Settings → Apps → orbyt → Clear data
   - Reinstall app

5. **Force re-verification:**
   ```bash
   adb shell pm verify-app-links --re-verify com.orbyt.app
   ```

### Common Issues

**Issue: File returns HTML 404**
- Solution: Ensure files are deployed to `.well-known/` directory
- Check server configuration allows `.well-known` paths

**Issue: File returns wrong Content-Type**
- Solution: Configure server to serve `.well-known/apple-app-site-association` as `application/json`
- Nginx example:
  ```nginx
  location /.well-known/apple-app-site-association {
      default_type application/json;
      add_header Content-Type application/json;
  }
  ```

**Issue: iOS shows Safari icon in App Switcher**
- Solution: Ensure `activitycontinuation` field is in AASA file
- Reinstall app after adding it

**Issue: Links open in browser, not app**
- Solution: 
  - iOS: Reinstall app (AASA is cached)
  - Android: Run `adb shell pm verify-app-links --re-verify com.orbyt.app`

## Quick Test Checklist

- [ ] Files accessible via HTTPS
- [ ] Files return correct Content-Type
- [ ] iOS validator shows no errors
- [ ] Notes app shows "Open in orbyt"
- [ ] Android `pm get-app-links` shows verified
- [ ] Links open in app, not browser
- [ ] Deep link parser routes correctly

## Development Testing

For local development with Expo:

```bash
# Start with tunnel (required for HTTPS)
npx expo start --tunnel

# Set custom subdomain for consistency
EXPO_TUNNEL_SUBDOMAIN=my-orbyt-dev npx expo start --tunnel
```

Then update your association files temporarily to use the tunnel URL for testing.
