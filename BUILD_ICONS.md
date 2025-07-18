# Build Icons Configuration

This project is configured to use different app icons for development and production builds.

## Icon Files

- **Development Icon**: `src/assets/Icons/icon-dev.png` - Used for development and preview builds
- **Production Icon**: `src/assets/Icons/icon-prod.png` - Used for production builds

## Build Commands

### Development Build (with dev icon)
```bash
npm run build:dev
# or
yarn build:dev
```

### Preview Build (with dev icon)
```bash
npm run build:preview
# or
yarn build:preview
```

### Production Build (with prod icon)
```bash
npm run build:prod
# or
yarn build:prod
```

## How It Works

1. **Build Configuration**: The `build-config.js` script automatically copies the appropriate app configuration file based on the build profile.

2. **App Configs**:
   - `app.dev.json` - Development configuration (uses dev icon, different bundle ID)
   - `app.prod.json` - Production configuration (uses prod icon, production bundle ID)

3. **EAS Configuration**: The `eas.json` file sets environment variables that tell the build script which configuration to use.

## Key Differences

### Development Build
- App name: "orbyt (Dev)"
- Bundle ID: `com.bytesocial.byte-app.dev` (iOS) / `com.bytesocial.byteapp.dev` (Android)
- Icon: `icon-dev.png`
- Slug: `byte-app-dev`

### Production Build
- App name: "orbyt"
- Bundle ID: `com.bytesocial.byte-app` (iOS) / `com.bytesocial.byteapp` (Android)
- Icon: `icon-prod.png`
- Slug: `byte-app`

## Manual Build Commands

If you prefer to use EAS CLI directly:

```bash
# Development
eas build --profile development

# Preview
eas build --profile preview

# Production
eas build --profile production
```

The build script will automatically handle the icon selection based on the profile. 