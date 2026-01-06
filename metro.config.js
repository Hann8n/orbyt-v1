const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const videoTrimRoot = path.resolve(__dirname, '../react-native-video-trim');

/**
 * Metro configuration for Expo
 * https://docs.expo.dev/guides/customizing-metro
 *
 * @type {import('expo/metro-config').MetroConfig}
 */
const config = getDefaultConfig(projectRoot);

// Configure watchFolders to include the local package source
config.watchFolders = [projectRoot, videoTrimRoot, path.resolve(videoTrimRoot, 'src')];

// Configure resolver to look in both project and package node_modules
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(videoTrimRoot, 'node_modules'),
  ],
  // Resolve local package to source directory for direct source watching
  // This allows Metro to pick up changes without rebuilding
  extraNodeModules: {
    'react-native-video-trim': path.resolve(videoTrimRoot, 'src'),
  },
  // Enable package exports support and allow fallback to file-based resolution
  // This handles cases where transitive dependencies import internal paths
  unstable_enablePackageExports: true,
};

module.exports = config;
