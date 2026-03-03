/**
 * Layout calculation utilities.
 * Small phone: shortSide ≤ 375 and longSide ≤ 720.
 */

import * as Device from 'expo-device';
import { Dimensions } from 'react-native';

export const TABLET_SHORT_SIDE_DP = 600;
export const SMALL_PHONE_SHORT_SIDE_DP = 375;
export const SMALL_PHONE_LONG_SIDE_DP = 720;

export const LAYOUT = {
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
  if (isCompact !== undefined) {
    return (
      (isCompact ? LAYOUT.SMALL_SCREEN_NAV_HEIGHT : LAYOUT.TAB_NAV_HEIGHT) + (insets.bottom || 0)
    );
  }
  const { width, height } = getWindowDimensions();
  const { isCompact: c } = classifyDevice(width, height);
  return (c ? LAYOUT.SMALL_SCREEN_NAV_HEIGHT : LAYOUT.TAB_NAV_HEIGHT) + (insets.bottom || 0);
};

export const getViewportDimensions = (
  isModal: boolean = false,
  _isHeaderFeed: boolean = false,
  insets?: { top: number; bottom: number; left: number; right: number }
) => {
  const { width, height } = getWindowDimensions();
  const effectiveInsets = insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { isCompact } = classifyDevice(width, height);
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets, isCompact);
  const useFullHeight = isModal || isCompact;
  return {
    width,
    height: useFullHeight ? height : height - bottomNavBarHeight - effectiveInsets.top,
    effectiveInsets,
    bottomNavBarHeight,
    isFullScreen: useFullHeight,
  };
};
