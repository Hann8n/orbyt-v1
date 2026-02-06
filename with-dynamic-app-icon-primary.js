const { withInfoPlist } = require('@expo/config-plugins');
const path = require('path');

/**
 * Fix for @mozzius/expo-dynamic-app-icon with Expo 55 Liquid Glass icons.
 *
 * When ios.icon is a .icon path (e.g. Orbyt.icon), Expo sets
 * ASSETCATALOG_COMPILER_APPICON_NAME to the icon set name ("Orbyt").
 * The dynamic app icon plugin hardcodes CFBundlePrimaryIcon.CFBundleIconFiles
 * to ["AppIcon"], so the primary icon name doesn't match and the default
 * app icon can fail. This plugin runs after the dynamic icon plugin and
 * sets CFBundlePrimaryIcon to use the actual icon set name.
 */
function withDynamicAppIconPrimary(config) {
  return withInfoPlist(config, config => {
    const iosIcon = config.ios?.icon;
    if (typeof iosIcon !== 'string' || !iosIcon.endsWith('.icon')) {
      return config;
    }
    const iconSetName = path.basename(iosIcon, '.icon');
    const plist = config.modResults;
    if (plist.CFBundleIcons && plist.CFBundleIcons.CFBundlePrimaryIcon) {
      plist.CFBundleIcons.CFBundlePrimaryIcon = {
        CFBundleIconFiles: [iconSetName],
      };
    }
    ['CFBundleIcons~ipad'].forEach(key => {
      if (plist[key]?.CFBundlePrimaryIcon) {
        plist[key].CFBundlePrimaryIcon = {
          CFBundleIconFiles: [iconSetName],
        };
      }
    });
    return config;
  });
}

module.exports = withDynamicAppIconPrimary;
