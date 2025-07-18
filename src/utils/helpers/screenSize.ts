import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Define screen size breakpoints
const SMALL_SCREEN_WIDTH = 375; // iPhone SE, small Android devices
const SMALL_SCREEN_HEIGHT = 667; // iPhone SE height

/**
 * Check if the current device has a small screen
 * Small screens are devices with width <= 375px or height <= 667px
 */
export const isSmallScreen = (): boolean => {
  return SCREEN_WIDTH <= SMALL_SCREEN_WIDTH || SCREEN_HEIGHT <= SMALL_SCREEN_HEIGHT;
};

/**
 * Get screen dimensions
 */
export const getScreenDimensions = () => ({
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
});

/**
 * Get the appropriate video card height based on screen size
 */
export const getVideoCardHeight = (insets: { top: number; bottom: number }): number => {
  if (isSmallScreen()) {
    // For small screens, use full screen height without safe areas
    return SCREEN_HEIGHT;
  } else {
    // For medium/large screens, use the existing logic
    const tabNavigatorHeight = 92;
    return SCREEN_HEIGHT - tabNavigatorHeight - insets.top;
  }
};

/**
 * Get the appropriate bottom navigation bar height based on screen size
 */
export const getBottomNavBarHeight = (insets: { bottom: number }): number => {
  if (isSmallScreen()) {
    // For small screens, use minimal height for transparent nav bar
    return 45;
  } else {
    // For medium/large screens, use existing logic
    return 60 + (insets.bottom || 0);
  }
}; 