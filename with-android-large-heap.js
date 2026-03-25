const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidLargeHeap(config) {
  return withAndroidManifest(config, async config => {
    const androidManifest = config.modResults.manifest;

    const buildProfile = process.env.EAS_BUILD_PROFILE;
    const shouldEnableLargeHeap =
      process.env.ORBYT_ANDROID_LARGE_HEAP === '1' ||
      buildProfile === 'production' ||
      buildProfile === 'preview';

    if (androidManifest.application && androidManifest.application[0]) {
      if (shouldEnableLargeHeap) {
        androidManifest.application[0].$['android:largeHeap'] = 'true';
      } else {
        delete androidManifest.application[0].$['android:largeHeap'];
      }
    }
    return config;
  });
};
