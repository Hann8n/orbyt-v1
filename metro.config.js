const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/**
 * Metro configuration for Expo
 * https://docs.expo.dev/guides/customizing-metro
 *
 * @type {import('expo/metro-config').MetroConfig}
 */
const config = getDefaultConfig(projectRoot);

// Not in metro-config's jest-validate example; Metro only honors transformer.unstable_workerThreads.
if (config.watcher && 'unstable_workerThreads' in config.watcher) {
  delete config.watcher.unstable_workerThreads;
}

module.exports = config;
