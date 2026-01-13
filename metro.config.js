const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/**
 * Metro configuration for Expo
 * https://docs.expo.dev/guides/customizing-metro
 *
 * @type {import('expo/metro-config').MetroConfig}
 */
const config = getDefaultConfig(projectRoot);

// Configure resolver
config.resolver = {
  ...config.resolver,
  // Enable package exports support and allow fallback to file-based resolution
  // This handles cases where transitive dependencies import internal paths
  unstable_enablePackageExports: true,
};

module.exports = config;
