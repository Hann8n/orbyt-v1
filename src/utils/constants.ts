// App Constants
export const APP_CONSTANTS = {
  REFRESH_DELAY: 2000,
  SCROLL_THROTTLE: 16,
  POSITION_SAVE_DELAY: 300,
  VISIBILITY_DEBOUNCE: 16, // Reduced from 100ms to 16ms for instant video detection
  ORIENTATION_CHANGE_DELAY: 100,
  INITIAL_SCROLL_DELAY: 50,
  GRID_TO_LIST_DELAY: 100,
} as const;

// Border Radius Constants
export const BORDER_RADIUS = {
  SMALL: 8,
  MEDIUM: 15,
  LARGE: 20,
  FULL: 100,
} as const;

// Query Constants
export const QUERY_CONSTANTS = {
  RETRY_COUNT: 1,
  STALE_TIME: 5 * 60 * 1000, // 5 minutes - default for most queries
  GC_TIME: 30 * 60 * 1000, // 30 minutes
  END_REACHED_THRESHOLD: 3, // In viewport heights: trigger when end is within 3 screens away
  // Granular stale times for different data types
  STALE_TIME_SHORT: 10 * 1000, // 10 seconds - for frequently changing data (chat, notifications)
  STALE_TIME_MEDIUM: 60 * 1000, // 1 minute - for moderately changing data (unread counts)
  STALE_TIME_LONG: 10 * 60 * 1000, // 10 minutes - for slowly changing data (feeds, profiles)
  STALE_TIME_VERY_LONG: 60 * 60 * 1000, // 1 hour - for rarely changing data (static content)
} as const;

// Viewability Constants - unified strategy using viewport coverage
export const VIEWABILITY_CONSTANTS = {
  VIEW_AREA_COVERAGE_PERCENT_THRESHOLD: 50, // 50% of viewport must be covered by video
  MINIMUM_VIEW_TIME: 0, // No minimum view time for instant playback
  WAIT_FOR_INTERACTION: false, // Don't wait for interaction
} as const;

// Scroll Constants
export const SCROLL_CONSTANTS = {
  POSITION_CHANGE_THRESHOLD: 30,
  DECELERATION_RATE_IOS: 'fast' as const,
  DECELERATION_RATE_ANDROID: 0.98,
} as const;

// Feed Types
export const FEED_TYPES = {
  FOLLOWING: 'following',
  DISCOVER: 'discover',
  PROFILE: 'profile',
  LIKES: 'likes',
  REPOSTS: 'reposts',
} as const;

// View Modes
export const VIEW_MODES = {
  LIST: 'list',
  GRID: 'grid',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  LOGIN_ERROR: 'Login failed. Please try again.',
  LOGOUT_ERROR: 'Logout failed. Please try again.',
  ACCOUNT_SWITCH_ERROR: 'Account switch failed. Please try again.',
  FONT_LOAD_ERROR: 'Error loading fonts',
  SESSION_VERIFY_ERROR: 'Error verifying session',
  FEED_RESET_ERROR: 'Error resetting feeds',
  SCROLL_ERROR: 'Error during scroll operation',
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  SESSION: 'session',
  APP_STORE: 'app-store',
} as const;

// Animation Constants
export const ANIMATION_CONSTANTS = {
  DURATION: {
    FAST: 200,
    NORMAL: 300,
    SLOW: 500,
  },
  EASING: {
    EASE_IN_OUT: 'ease-in-out',
    EASE_OUT: 'ease-out',
    EASE_IN: 'ease-in',
  },
  DRAG_SCALE_FACTOR: 1.02,
} as const;

// Icon Size Constants
export const ICON_SIZES = {
  SMALL: 16,
  MEDIUM: 20,
  LARGE: 24,
  XLARGE: 32,
} as const;

// Video Editor Messages
export const VIDEO_EDITOR_MESSAGES = {
  TRIM_NOT_AVAILABLE:
    'Trim functionality is coming in a future update! You can currently:\n\n• Reorder clips by long pressing and dragging\n• Delete unwanted clips\n• Preview the final video\n\nFor now, consider re-recording shorter clips or editing the video after posting.',
} as const;
