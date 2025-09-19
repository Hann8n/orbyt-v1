/**
 * Consolidated Helper Utilities
 * Contains small utility functions that were previously split across multiple files
 */

import * as Device from 'expo-device';
import { Dimensions } from 'react-native';

// ============================================================================
// ERROR DEBUG UTILITIES
// ============================================================================

// Global debug flags that can be easily toggled
export const DEBUG_FLAGS = {
  FORCE_FEED_ERROR: false, // Set to true to force feed errors
  FORCE_SEARCH_ERROR: false, // Set to true to force search errors
  FORCE_PROFILE_ERROR: false, // Set to true to force profile errors
  FORCE_NETWORK_ERROR: false, // Set to true to force network errors
};

// Helper function to check if any error forcing is enabled
export const isErrorForcingEnabled = (): boolean => {
  return Object.values(DEBUG_FLAGS).some(flag => flag);
};

// Helper function to get a forced error message
export const getForcedErrorMessage = (type: string): Error => {
  return new Error(`Forced ${type} error for testing purposes`);
};

// Helper function to check if a specific error type should be forced
export const shouldForceError = (type: keyof typeof DEBUG_FLAGS): boolean => {
  return DEBUG_FLAGS[type] || false;
};

// Export individual flags for easy access
export const FORCE_FEED_ERROR = DEBUG_FLAGS.FORCE_FEED_ERROR;
export const FORCE_SEARCH_ERROR = DEBUG_FLAGS.FORCE_SEARCH_ERROR;
export const FORCE_PROFILE_ERROR = DEBUG_FLAGS.FORCE_PROFILE_ERROR;
export const FORCE_NETWORK_ERROR = DEBUG_FLAGS.FORCE_NETWORK_ERROR;

// ============================================================================
// NUMBER FORMATTING UTILITIES
// ============================================================================

// Universal number formatting utility for truncating large numbers (e.g., 1.2K, 10K, etc)
export function formatNumber(num: number): string {
  if (num >= 100000) {
    return `${Math.floor(num / 1000)}K`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

// ============================================================================
// SCREEN SIZE UTILITIES
// ============================================================================

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
 * Constants for layout calculations
 */
export const LAYOUT = {
  TAB_NAV_HEIGHT: 45,
  SMALL_SCREEN_NAV_HEIGHT: 40,
  TABLET_NAV_HEIGHT: 40
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
  if (isSmallScreen()) {
    return SCREEN_HEIGHT;
  } else {
    const navHeight = getBottomNavBarHeight(insets) + 20; // 20px additional padding
    return SCREEN_HEIGHT - navHeight - insets.top;
  }
};

/**
 * Get viewport dimensions for video snapping
 * Simplified logic with fewer branches
 */
export const getViewportDimensions = (isModal: boolean = false, isHeaderFeed: boolean = false, insets?: { top: number; bottom: number; left: number; right: number }) => {
  const { width, height } = Dimensions.get('window');
  
  // Default insets
  const effectiveInsets = insets || { top: 0, bottom: 0, left: 0, right: 0 };
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);
  
  // Use full height for modals and small screens, otherwise account for navigation
  const useFullScreen = isModal || isSmallScreen();
  const viewportHeight = useFullScreen 
    ? height 
    : height - bottomNavBarHeight - effectiveInsets.top;
  
  return {
    width,
    height: viewportHeight,
    effectiveInsets,
    bottomNavBarHeight,
    isFullScreen: useFullScreen,
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
