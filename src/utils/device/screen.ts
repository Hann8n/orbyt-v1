/**
 * Layout calculation utilities
 */

import * as Device from 'expo-device';
import { Dimensions } from 'react-native';

const TABLET_MIN_SIZE = 600;
const SMALL_SCREEN_WIDTH = 375;
const SMALL_SCREEN_HEIGHT = 667;

// Helper to check if device needs compact layout (for stores/module-level code)
const isCompactDevice = (): boolean => {
  const { width, height } = Dimensions.get('window');
  const isTablet =
    Device.deviceType === Device.DeviceType.TABLET || Math.min(width, height) >= TABLET_MIN_SIZE;
  const isSmallScreen = width <= SMALL_SCREEN_WIDTH || height <= SMALL_SCREEN_HEIGHT;
  return isTablet || isSmallScreen;
};

/**
 * Constants for layout calculations
 */
export const LAYOUT = {
  TAB_NAV_HEIGHT: 45,
  SMALL_SCREEN_NAV_HEIGHT: 40,
  TABLET_NAV_HEIGHT: 40,
};

/**
 * Get the appropriate bottom navigation bar height based on screen size
 */
export const getBottomNavBarHeight = (insets: { bottom: number }): number => {
  const safeAreaBottom = insets.bottom || 0;

  if (isCompactDevice()) {
    return LAYOUT.SMALL_SCREEN_NAV_HEIGHT + safeAreaBottom;
  } else {
    return LAYOUT.TAB_NAV_HEIGHT + safeAreaBottom;
  }
};

/**
 * Get the appropriate video card height based on screen size and context
 */
export const getVideoCardHeight = (insets: { top: number; bottom: number }): number => {
  const { height } = Dimensions.get('window');
  if (isCompactDevice()) {
    return height;
  } else {
    const navHeight = getBottomNavBarHeight(insets) + 20;
    return height - navHeight - insets.top;
  }
};

/**
 * Get viewport dimensions for video snapping
 */
export const getViewportDimensions = (
  isModal: boolean = false,
  _isHeaderFeed: boolean = false,
  insets?: { top: number; bottom: number; left: number; right: number }
) => {
  const { width, height } = Dimensions.get('window');

  const effectiveInsets = insets || { top: 0, bottom: 0, left: 0, right: 0 };
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);

  const useFullHeight = isModal || isCompactDevice();
  const viewportHeight = useFullHeight ? height : height - bottomNavBarHeight - effectiveInsets.top;

  return {
    width,
    height: viewportHeight,
    effectiveInsets,
    bottomNavBarHeight,
    isFullScreen: useFullHeight,
  };
};
