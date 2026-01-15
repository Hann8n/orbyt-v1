# Submitting to Google Play Store Without EAS

This guide will help you build and submit your Android app to the Google Play Store manually, without using EAS Submit.

## Prerequisites

1. **Google Play Developer Account**: Sign up at [Google Play Console](https://play.google.com/console)
2. **Create an App**: Create your app in Google Play Console
3. **Keystore File**: You have a keystore at `.backup/orbyt-upload-key.keystore`

## Step 1: Configure Keystore Signing

Your Android project is already configured to use a keystore. You need to create a `keystore.properties` file in the `android/` directory.

1. Create `android/keystore.properties` with the following content:

```properties
MYAPP_RELEASE_STORE_FILE=../.backup/orbyt-upload-key.keystore
MYAPP_RELEASE_KEY_ALIAS=<your-key-alias>
MYAPP_RELEASE_STORE_PASSWORD=<your-keystore-password>
MYAPP_RELEASE_KEY_PASSWORD=<your-key-password>
```

**Important**: Replace the placeholders with your actual keystore credentials:
- `<your-key-alias>`: The alias name you used when creating the keystore
  - To find your alias, run: `keytool -list -v -keystore .backup/orbyt-upload-key.keystore`
  - Look for "Alias name:" in the output
- `<your-keystore-password>`: The password for the keystore file
- `<your-key-password>`: The password for the key alias (often the same as keystore password)

**Security Note**: The `keystore.properties` file is already in `.gitignore`, so it won't be committed to your repository.

## Step 2: Build the Android App Bundle (AAB)

Google Play Store requires an Android App Bundle (AAB) file, not an APK. Build it using:

```bash
cd android
./gradlew bundleRelease
```

Or from the project root:

```bash
yarn build:android-aab
```

The AAB file will be generated at:
```
android/app/build/outputs/bundle/release/app-release.aab
```

## Step 3: Verify the Build

Before uploading, verify your build:

1. **Check the version**: The version in `app.json` (currently `1.0.8`) should match what you want to publish
2. **Check the package name**: Ensure `com.orbyt.app` matches your Google Play Console app
3. **Test the AAB**: You can test install it on a device using:
   ```bash
   bundletool build-apks --bundle=android/app/build/outputs/bundle/release/app-release.aab --output=app.apks --mode=universal
   ```

## Step 4: Upload to Google Play Console

1. **Go to Google Play Console**: [https://play.google.com/console](https://play.google.com/console)
2. **Select your app**: Choose your app from the dashboard
3. **Navigate to Production** (or Internal Testing/Beta):
   - Go to **Release** → **Production** (or your desired track)
   - Click **Create new release**
4. **Upload the AAB**:
   - Click **Upload** and select `android/app/build/outputs/bundle/release/app-release.aab`
   - Wait for Google Play to process the bundle
5. **Fill in Release Notes**:
   - Add release notes describing what's new in this version
6. **Review and Rollout**:
   - Review all the information
   - Click **Save** then **Review release**
   - After review, click **Start rollout to Production**

## Step 5: Complete Store Listing (First Time Only)

If this is your first submission, you'll also need to complete:

1. **Store listing**: App description, screenshots, feature graphic, etc.
2. **Content rating**: Complete the content rating questionnaire
3. **Privacy policy**: Add a privacy policy URL
4. **App access**: Declare if your app is restricted or available to all users
5. **Ads**: Declare if your app contains ads
6. **Data safety**: Complete the data safety section

## Troubleshooting

### "Your Android App Bundle is signed with the wrong key" Error

**This is the most common issue!** If you see this error in Google Play Console:

```
Your Android App Bundle is signed with the wrong key. 
Expected fingerprint: SHA1: 3B:23:01:4B:53:FF:65:67:CE:0B:9A:EB:39:15:11:11:7A:3F:43:D6
But uploaded has: SHA1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

**What this means:**
- Your AAB was built with a different keystore than the one used for the original upload
- Google Play requires ALL updates to be signed with the SAME keystore as the first upload
- The current AAB was likely signed with the debug keystore (because `keystore.properties` wasn't configured)

**How to fix:**

1. **Find the correct keystore** - You need the keystore that matches the expected fingerprint:
   ```bash
   # Check your backup keystore
   keytool -list -v -keystore .backup/orbyt-upload-key.keystore
   ```
   Look for the SHA1 fingerprint that matches: `3B:23:01:4B:53:FF:65:67:CE:0B:9A:EB:39:15:11:11:7A:3F:43:D6`

2. **If you used EAS before** - The keystore might be stored in EAS. Check:
   - EAS Dashboard → Your Project → Credentials → Android
   - Download the keystore if it's there

3. **Configure the correct keystore** in `android/keystore.properties`:
   ```properties
   MYAPP_RELEASE_STORE_FILE=../path/to/correct-keystore.keystore
   MYAPP_RELEASE_KEY_ALIAS=<alias-from-correct-keystore>
   MYAPP_RELEASE_STORE_PASSWORD=<password>
   MYAPP_RELEASE_KEY_PASSWORD=<password>
   ```

4. **Rebuild the AAB** with the correct keystore:
   ```bash
   cd android
   ./gradlew clean
   ./gradlew bundleRelease
   ```

5. **Verify the new AAB** has the correct fingerprint before uploading

**If you can't find the original keystore:**
- You **cannot** update the app on Google Play without it
- You would need to create a new app listing (new package name) or contact Google Play support
- This is why keystore backups are critical!

### Build Fails with Signing Errors

- Verify your `keystore.properties` file exists and has correct paths
- Ensure the keystore file path is correct (relative to `android/` directory)
- Double-check passwords and alias name
- Make sure `keystore.properties` is NOT the template file (should not have `<your-...>` placeholders)

### Version Code Issues

If you get version code conflicts:
- The `versionCode` in `android/app/build.gradle` needs to increment for each release
- Currently set to `1` - you may need to update it manually or use a script

### Upload Errors

- Ensure you're uploading an AAB, not an APK
- Check that the package name matches exactly
- Verify the signing certificate matches previous uploads (if updating an existing app)

## Updating Version Numbers

When releasing a new version:

1. Update `version` in `app.json` (e.g., `1.0.8` → `1.0.9`)
2. Update `versionName` in `android/app/build.gradle` to match
3. Increment `versionCode` in `android/app/build.gradle` (must be higher than previous)

## Alternative: Build APK for Testing

If you want to build an APK for testing (not for Play Store submission):

```bash
cd android
./gradlew assembleRelease
```

The APK will be at:
```
android/app/build/outputs/apk/release/app-release.apk
```

## Next Steps

After your first successful submission:
- Set up automated version code incrementing
- Consider using CI/CD to automate builds
- Set up internal testing tracks for beta releases
