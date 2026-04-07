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
 * Android TextInput specific fixes - combines includeFontPadding fix
 * with vertical text alignment for consistent behavior.
 */
export const androidTextInputFix: TextStyle = {
  ...(Platform.OS === 'android' && {
    includeFontPadding: false,
    textAlignVertical: 'center',
  }),
};

/**
 * Preset for inputs/text fields with platform-specific optimizations.
 */
export const inputTextDefaults: TextStyle = {
  ...androidTextInputFix,
};

/**
 * Get platform-specific props for Text components.
 * Returns an object with platform-optimal settings.
 */
export const getPlatformTextProps = () => ({
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.3, // Respect system font scale but cap it
});

/**
 * Get platform-specific props for TextInput components.
 */
export const getPlatformTextInputProps = () => ({
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.3,
  ...(Platform.OS === 'android' && {
    includeFontPadding: false,
    textAlignVertical: 'center' as const,
  }),
});
