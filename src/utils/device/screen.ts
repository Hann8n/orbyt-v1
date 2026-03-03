/**
 * Layout calculation utilities.
 *
 * "Small phone" requires BOTH short-side AND long-side to be within the caps.
 * Using OR (the old behaviour) caused iPhone 13 mini (375×812) to be
 * misclassified as small because its short side equals the SE threshold,
 * even though its aspect ratio is a normal 9:16.
 *
 *   SE 1st gen   320×568  short=320 ≤ 375, long=568  ≤ 720  → small ✓
 *   SE 2nd/3rd   375×667  short=375 ≤ 375, long=667  ≤ 720  → small ✓
 *   13 mini      375×812  short=375 ≤ 375, long=812  > 720  → NOT small ✓
 *   14 / 15      390×844  short=390 > 375                   → NOT small ✓
 */

import * as Device from 'expo-device';
import { Dimensions } from 'react-native';

// ---------------------------------------------------------------------------
// Exported constants — imported by useDeviceLayout and any other consumer
// ---------------------------------------------------------------------------

export const TABLET_SHORT_SIDE_DP = 600;
export const SMALL_PHONE_SHORT_SIDE_DP = 375;
export const SMALL_PHONE_LONG_SIDE_DP = 720;

export const LAYOUT = {
  TAB_NAV_HEIGHT: 45,
  SMALL_SCREEN_NAV_HEIGHT: 40,
} as const;

// ---------------------------------------------------------------------------
// Pure classification — accepts dimensions, returns device flags.
// Imported by useDeviceLayout (reactive) and isCompactDevice (non-reactive).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Non-reactive helpers — for stores and module-level code only.
// Prefer useDeviceLayout() inside React components.
// ---------------------------------------------------------------------------

const getWindowDimensions = () => Dimensions.get('window');

export const getBottomNavBarHeight = (insets: { bottom: number }): number => {
  const { width, height } = getWindowDimensions();
  const { isCompact } = classifyDevice(width, height);
  return (
    (isCompact ? LAYOUT.SMALL_SCREEN_NAV_HEIGHT : LAYOUT.TAB_NAV_HEIGHT) + (insets.bottom || 0)
  );
};

export const getViewportDimensions = (
  isModal: boolean = false,
  _isHeaderFeed: boolean = false,
  insets?: { top: number; bottom: number; left: number; right: number }
) => {
  const { width, height } = getWindowDimensions();
  const effectiveInsets = insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);
  const { isCompact } = classifyDevice(width, height);
  const useFullHeight = isModal || isCompact;
  return {
    width,
    height: useFullHeight ? height : height - bottomNavBarHeight - effectiveInsets.top,
    effectiveInsets,
    bottomNavBarHeight,
    isFullScreen: useFullHeight,
  };
};
