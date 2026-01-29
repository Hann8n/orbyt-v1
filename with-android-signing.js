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

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let c = cfg.modResults.contents;

    if (!c.includes(TAG)) {
      c = c.replace(
        /def projectRoot = rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\)\r?\n\r?\n/,
        `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n${KEYSTORE_BLOCK}`
      );
    }

    if (!c.includes('storeFile file(keystoreProperties')) {
      c = c.replace(
        /\s+\}\r?\n\s+buildTypes\s*\{/,
        `        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {`
      );
    }

    if (!c.includes('keystorePropertiesFile.exists() ? signingConfigs.release')) {
      // SDK 55+ uses 'enableMinifyInReleaseBuilds' pattern
      c = c.replace(
        /(\r?\n\s+)signingConfig signingConfigs\.debug(\r?\n\s+def enableShrinkResources)/,
        '$1signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug$2'
      );
    }

    cfg.modResults.contents = c;
    return cfg;
  });
};
