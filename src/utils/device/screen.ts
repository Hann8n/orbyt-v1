/**
 * Layout calculation utilities.
 * Small phone: shortSide ≤ 375 and longSide ≤ 720.
 */

import * as Device from 'expo-device';
import { Dimensions } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

/**
 * Native tab shells sometimes report `useSafeAreaInsets().top === 0` while the window still has a
 * non-zero top inset. Match that to `initialWindowMetrics` so headers (profile, channel) keep
 * correct padding under the status bar / Dynamic Island.
 */
export function getEffectiveTopInset(hookTop: number): number {
  return Math.max(hookTop, initialWindowMetrics?.insets.top ?? 0);
}

const TABLET_SHORT_SIDE_DP = 600;
const SMALL_PHONE_SHORT_SIDE_DP = 375;
const SMALL_PHONE_LONG_SIDE_DP = 720;

const LAYOUT = {
  TAB_NAV_HEIGHT: 45,
  SMALL_SCREEN_NAV_HEIGHT: 40,
} as const;

export interface DeviceClass {
  isTablet: boolean;
  isSmallPhone: boolean;
  isCompact: boolean;
}

export function classifyDevice(width: number, height: number): DeviceClass {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const isTablet =
    Device.deviceType === Device.DeviceType.TABLET || shortSide >= TABLET_SHORT_SIDE_DP;
  const isSmallPhone =
    !isTablet && shortSide <= SMALL_PHONE_SHORT_SIDE_DP && longSide <= SMALL_PHONE_LONG_SIDE_DP;
  return { isTablet, isSmallPhone, isCompact: isTablet || isSmallPhone };
}

const getWindowDimensions = () => Dimensions.get('window');

export const getBottomNavBarHeight = (insets: { bottom: number }, isCompact?: boolean): number => {
  const bottom = insets.bottom || 0;
  if (isCompact !== undefined) {
    return (isCompact ? LAYOUT.SMALL_SCREEN_NAV_HEIGHT : LAYOUT.TAB_NAV_HEIGHT) + bottom;
  }
  const { width, height } = getWindowDimensions();
  const { isCompact: c } = classifyDevice(width, height);
  return (c ? LAYOUT.SMALL_SCREEN_NAV_HEIGHT : LAYOUT.TAB_NAV_HEIGHT) + bottom;
};

export type ViewportSafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/**
 * Viewport size for feed layouts. By default subtracts tab-bar chrome and top safe area
 * on non-compact phones. Pass `useFullWindowHeight` when the feed has no tab bar overlay
 * or the caller needs the raw window height (e.g. full-height video screen).
 */
export const getViewportDimensions = (
  insets?: ViewportSafeAreaInsets,
  options?: { useFullWindowHeight?: boolean }
) => {
  const { width, height } = getWindowDimensions();
  const effectiveInsets = insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { isCompact } = classifyDevice(width, height);
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets, isCompact);
  const useFullHeight = Boolean(options?.useFullWindowHeight) || isCompact;
  return {
    width,
    height: useFullHeight ? height : height - bottomNavBarHeight - effectiveInsets.top,
    effectiveInsets,
    bottomNavBarHeight,
    isFullScreen: useFullHeight,
  };
};
