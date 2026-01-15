# Finding the Correct Keystore for Google Play

Your AAB was signed with the wrong keystore. You need to find the keystore that matches fingerprint:
**SHA1: 3B:23:01:4B:53:FF:65:67:CE:0B:9A:EB:39:15:11:11:7A:3F:43:D6**

## Step 1: Check Your Backup Keystore

Run this script to check if your backup keystore matches:

```bash
./check-keystore-fingerprint.sh
```

Or manually:
```bash
keytool -list -v -keystore .backup/orbyt-upload-key.keystore | grep -A 1 "SHA1:"
```

**Note**: Run this from the project root (not from the `android` directory), and enter the keystore password when prompted.

## Step 2: Check EAS for the Keystore

If your backup keystore doesn't match, the correct one might be stored in EAS:

### Option A: Via EAS Dashboard (Easiest)
1. Go to [expo.dev](https://expo.dev)
2. Navigate to your project: **orbyt** (project ID: `67a8dfaf-4d9a-4d5d-bf99-1df4e4619bc8`)
3. Go to **Credentials** → **Android**
4. Look for **Keystore** or **Signing Key**
5. If it's there, download it

### Option B: Via EAS CLI
```bash
npx eas-cli credentials --platform android
```

Then:
- Select your project
- Choose the production build profile
- Look for keystore options
- Download the keystore if available

## Step 3: If You Find the Correct Keystore

1. **Save it** to a secure location (e.g., `.backup/orbyt-production-key.keystore`)

2. **Create `android/keystore.properties`**:
   ```properties
   MYAPP_RELEASE_STORE_FILE=../.backup/orbyt-production-key.keystore
   MYAPP_RELEASE_KEY_ALIAS=<alias-name>
   MYAPP_RELEASE_STORE_PASSWORD=<keystore-password>
   MYAPP_RELEASE_KEY_PASSWORD=<key-password>
   ```

   To find the alias:
   ```bash
   keytool -list -v -keystore .backup/orbyt-production-key.keystore
   ```
   Look for "Alias name:" in the output.

3. **Rebuild the AAB**:
   ```bash
   cd android
   ./gradlew clean
   ./gradlew bundleRelease
   ```

4. **Verify the new AAB** has the correct fingerprint before uploading

## Step 4: If You Can't Find the Original Keystore

**This is a serious problem!** Without the original keystore:

- ❌ You **cannot** update the existing app on Google Play
- ✅ You can create a **new app** with a different package name
- ✅ You can contact **Google Play Support** (they may be able to help in rare cases)

**Important**: Always backup your production keystore in multiple secure locations!

## Quick Reference

- **Expected fingerprint**: `3B:23:01:4B:53:FF:65:67:CE:0B:9A:EB:39:15:11:11:7A:3F:43:D6`
- **Current AAB fingerprint**: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (debug keystore)
- **Project ID**: `67a8dfaf-4d9a-4d5d-bf99-1df4e4619bc8`
- **Package name**: `com.orbyt.app`
