const { withAppBuildGradle } = require('@expo/config-plugins');

const TAG = 'with-android-signing-keystore-props';
const KEYSTORE_BLOCK = `// @generated begin ${TAG} - expo prebuild (DO NOT MODIFY)
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
// @generated end ${TAG}

`;

const DEFAULT_DEBUG_SIGNING_BLOCK = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const DEBUG_AND_RELEASE_SIGNING_BLOCK = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }`;

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let contents = cfg.modResults.contents;

    if (!contents.includes(TAG)) {
      contents = contents.replace(
        /def projectRoot = rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\)\r?\n\r?\n/,
        `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n${KEYSTORE_BLOCK}`
      );
    }

    if (!contents.includes('storeFile file(keystoreProperties')) {
      contents = contents.replace(DEFAULT_DEBUG_SIGNING_BLOCK, DEBUG_AND_RELEASE_SIGNING_BLOCK);
    }

    if (!contents.includes('keystorePropertiesFile.exists() ? signingConfigs.release')) {
      contents = contents.replace(
        /(\r?\n\s+)signingConfig signingConfigs\.debug(\r?\n\s+def enableShrinkResources)/,
        '$1signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug$2'
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};
