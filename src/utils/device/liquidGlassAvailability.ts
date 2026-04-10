import { Platform } from 'react-native';
import * as GlassEffect from 'expo-glass-effect';

/**
 * `expo-glass-effect`'s `isLiquidGlassAvailable` can throw or be unavailable on some native builds.
 * Use this instead of calling the module API directly from screens or at module top-level.
 */
export function isLiquidGlassAvailableSafe(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }
  const fn = (GlassEffect as { isLiquidGlassAvailable?: () => boolean }).isLiquidGlassAvailable;
  if (typeof fn !== 'function') {
    return false;
  }
  try {
    return Boolean(fn());
  } catch {
    return false;
  }
}
