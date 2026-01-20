/**
 * Device and Screen Size Utilities
 */

import * as Device from 'expo-device';
import { Dimensions } from 'react-native';

// Define screen size breakpoints for unified snapping
const SMALL_SCREEN_WIDTH = 375; // iPhone SE, small Android devices
const SMALL_SCREEN_HEIGHT = 667; // iPhone SE height
const TABLET_MIN_SIZE = 600; // Minimum size to be considered a tablet

/**
 * Check if the current device has a small screen
 * Small screens are devices with width <= 375px or height <= 667px
 * Uses expo-device for more accurate device info if available
 */
export const isSmallScreen = (): boolean => {
  const { width, height } = Dimensions.get('window');
  return width <= SMALL_SCREEN_WIDTH || height <= SMALL_SCREEN_HEIGHT;
};

/**
 * Check if the current device is a tablet
 * Uses expo-device for accurate detection, falls back to screen size
 */
export const isTablet = (): boolean => {
  // Device.deviceType is available synchronously
  if (Device.deviceType === Device.DeviceType.TABLET) {
    return true;
  }
  // Fallback to screen size heuristic
  const { width, height } = Dimensions.get('window');
  return Math.min(width, height) >= TABLET_MIN_SIZE;
};

/**
 * Check if the device has a tall screen (high aspect ratio)
 * Useful for devices like iPhone 14 Pro Max, Samsung Galaxy S23 Ultra, etc.
 */
export const isTallScreen = (): boolean => {
  const { width, height } = Dimensions.get('window');
  const aspectRatio = height / width;
  return aspectRatio > 2.1; // Tall devices have aspect ratio > 2.1
};

/**
 * Get screen dimensions
 */
export const getScreenDimensions = () => {
  const { width, height } = Dimensions.get('window');
  return { width, height };
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
 * Consolidated for better consistency
 */
export const getBottomNavBarHeight = (insets: { bottom: number }): number => {
  const safeAreaBottom = insets.bottom || 0;

  if (isSmallScreen() || isTablet()) {
    return LAYOUT.SMALL_SCREEN_NAV_HEIGHT + safeAreaBottom;
  } else {
    return LAYOUT.TAB_NAV_HEIGHT + safeAreaBottom;
  }
};

/**
 * Get the appropriate video card height based on screen size and context
 * Uses the bottomNavBarHeight calculation for consistency
 */
export const getVideoCardHeight = (insets: { top: number; bottom: number }): number => {
  const { height } = Dimensions.get('window');
  if (isSmallScreen()) {
    return height;
  } else {
    const navHeight = getBottomNavBarHeight(insets) + 20; // 20px additional padding
    return height - navHeight - insets.top;
  }
};

/**
 * Get viewport dimensions for video snapping
 * Simplified logic with fewer branches
 */
export const getViewportDimensions = (
  isModal: boolean = false,
  _isHeaderFeed: boolean = false,
  insets?: { top: number; bottom: number; left: number; right: number }
) => {
  const { width, height } = Dimensions.get('window');

  // Default insets
  const effectiveInsets = insets || { top: 0, bottom: 0, left: 0, right: 0 };
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);

  // Use full height for modals and small screens, otherwise account for navigation
  const useFullScreen = isModal || isSmallScreen();
  const viewportHeight = useFullScreen ? height : height - bottomNavBarHeight - effectiveInsets.top;

  return {
    width,
    height: viewportHeight,
    effectiveInsets,
    bottomNavBarHeight,
    isFullScreen: useFullScreen,
  };
};
