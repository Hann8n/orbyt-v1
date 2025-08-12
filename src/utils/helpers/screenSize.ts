import * as Device from 'expo-device';
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  return (
    SCREEN_WIDTH <= SMALL_SCREEN_WIDTH ||
    SCREEN_HEIGHT <= SMALL_SCREEN_HEIGHT
  );
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
  return Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) >= TABLET_MIN_SIZE;
};

/**
 * Check if the device has a tall screen (high aspect ratio)
 * Useful for devices like iPhone 14 Pro Max, Samsung Galaxy S23 Ultra, etc.
 */
export const isTallScreen = (): boolean => {
  const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
  return aspectRatio > 2.1; // Tall devices have aspect ratio > 2.1
};

/**
 * Get screen dimensions
 */
export const getScreenDimensions = () => ({
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
});

/**
 * Get the appropriate video card height based on screen size and context
 * Restored original 9:16 design with uniform spacing
 */
export const getVideoCardHeight = (insets: { top: number; bottom: number }): number => {
  if (isSmallScreen()) {
    // For small screens, use full screen height without safe areas
    return SCREEN_HEIGHT;
  } else {
    // For medium/large screens, use the original logic that allows seeing previous/next videos
    const tabNavigatorHeight = 92;
    return SCREEN_HEIGHT - tabNavigatorHeight - insets.top;
  }
};

/**
 * Get the appropriate bottom navigation bar height based on screen size
 * Updated for unified snapping system
 */
export const getBottomNavBarHeight = (insets: { bottom: number }): number => {
  if (isSmallScreen()) {
    // For small screens, use a compact height and include safe area
    return 40 + (insets.bottom || 0);
  } else if (isTablet()) {
    // For tablets, use a compact height
    return 40 + (insets.bottom || 0);
  } else {
    // For medium/large screens, use a standard height
    return 45 + (insets.bottom || 0);
  }
};

/**
 * Get viewport dimensions for video snapping
 * Returns the available area for videos based on device type and context
 * Restored original 9:16 design with uniform spacing and proper safe area handling
 */
export const getViewportDimensions = (isModal: boolean = false, isHeaderFeed: boolean = false, insets?: { top: number; bottom: number; left: number; right: number }) => {
  const { width, height } = Dimensions.get('window');
  
  // Calculate effective insets - All feeds need safe areas
  const effectiveInsets = insets || { top: 0, bottom: 0, left: 0, right: 0 };
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);
  
  // Calculate viewport height based on device type
  let viewportHeight: number;
  
  if (isModal) {
    // Modal: use full screen height
    viewportHeight = height;
  } else if (isSmallScreen()) {
    // Small devices: use full screen height
    viewportHeight = height;
  } else {
    // Large devices: account for navigation and safe areas
    viewportHeight = height - bottomNavBarHeight - effectiveInsets.top;
  }
  
  return {
    width,
    height: viewportHeight,
    effectiveInsets,
    bottomNavBarHeight,
    isFullScreen: isModal || isSmallScreen(),
  };
};

/**
 * Get device info for debugging and optimization
 */
export const getDeviceInfo = async () => {
  return {
    deviceType: await Device.getDeviceTypeAsync(),
    modelName: Device.modelName,
    osName: Device.osName,
    osVersion: Device.osVersion,
    screen: getScreenDimensions(),
    isSmall: isSmallScreen(),
    isTablet: isTablet(),
    isTall: isTallScreen(),
  };
}; 