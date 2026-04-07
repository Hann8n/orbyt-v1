import { Platform, TextStyle } from 'react-native';

/**
 * Platform-specific text rendering fixes and helpers.
 * Improves text alignment and rendering consistency across iOS and Android.
 */

/**
 * Android text rendering fix - prevents extra padding around text.
 * Apply this to TextInput components that need precise spacing.
 */
export const androidTextFix: TextStyle = {
  ...(Platform.OS === 'android' && {
    includeFontPadding: false,
  }),
};

/**
 * Preset for inputs/text fields with platform-specific optimizations.
 */
export const inputTextDefaults: TextStyle = {
  ...(Platform.OS === 'android' && {
    includeFontPadding: false,
    textAlignVertical: 'center',
  }),
};
