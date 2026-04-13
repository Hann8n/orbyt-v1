// App Constants
export const APP_CONSTANTS = {
  REFRESH_DELAY: 2000,
  SCROLL_THROTTLE: 32,
  POSITION_SAVE_DELAY: 300,
  VISIBILITY_DEBOUNCE: 16, // Reduced from 100ms to 16ms for instant video detection
  ORIENTATION_CHANGE_DELAY: 100,
  INITIAL_SCROLL_DELAY: 50,
  GRID_TO_LIST_DELAY: 100,
  IDLE_CALLBACK_TIMEOUT: 100, // Timeout for requestIdleCallback (replaces InteractionManager)
} as const;

// Layout insets - minimum distance from screen edge for interactive content
export const LAYOUT_INSETS = {
  SCREEN: 24, // Standard screen edge padding
  SHEET_CONTENT: 20, // Sheet body content
  SHEET_FOOTER: 24, // Sheet footer (Cancel, actions)
  /** Profile/channel `DetailScreenOverlay` + feed-modal `TabFullScreenBackButton` leading inset. */
  DETAIL_OVERLAY_HORIZONTAL: 16,
  /** Pixels below safe-area top for detail overlay row (profile, channel, image viewer close). */
  DETAIL_OVERLAY_TOP_OFFSET: 5,
} as const;

// Border Radius Constants
export const BORDER_RADIUS = {
  SMALL: 10,
  MEDIUM: 17,
  LARGE: 22,
  FULL: 102,
} as const;

/** expo-blur intensity (0–100). */
export const BLUR_INTENSITY = {
  ACCOUNT_CARD: 40,
} as const;

/** Passed to `react-native-resquircle` (`SquircleView` / pressables). 0 = circular, 1 = max superellipse. */
export const CORNER_SMOOTHING = 0.8 as const;

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
  /** Default page size for feed/search fetches (app FeedService, infinite scroll). */
  FEED_PAGE_DEFAULT: 50,
  /** Upper bound for single `getFeed` / author-feed requests when batching. */
  FEED_PAGE_MAX_SINGLE: 100,
} as const;

// Scroll Constants
export const SCROLL_CONSTANTS = {
  POSITION_CHANGE_THRESHOLD: 30,
  DECELERATION_RATE_IOS: 'fast' as const,
  DECELERATION_RATE_ANDROID: 0.98,
  /** Scroll distance (px) over which header content fade goes 0→1. Used for contentScrollProgressSV. */
  HEADER_FADE_DISTANCE: 400,
} as const;

export const SCROLL_INDICATOR_CONSTANTS = {
  // Full-height feed cards are large; indicator is useful with fewer items.
  FEED_LIST_MIN_ITEMS: 3,
  // Grid thumbnails are compact and usually need a longer list before indicator helps.
  FEED_GRID_MIN_ITEMS: 12,
  COMMENTS_MIN_ITEMS: 8,
  CHAT_MESSAGES_MIN_ITEMS: 10,
  ACTIVITY_LIST_MIN_ITEMS: 6,
  SEARCH_RESULTS_MIN_ITEMS: 6,
  EXPLORE_SUGGESTIONS_MIN_ITEMS: 6,
  GENERIC_LIST_MIN_ITEMS: 6,
  LOGIN_ACCOUNTS_MIN_ITEMS: 5,
  SETTINGS_CHANNELS_MIN_ITEMS: 5,
  HIDDEN_POSTS_MIN_ITEMS: 5,
  SEND_TO_PICKER_MIN_ITEMS: 7,
  GIF_PICKER_GRID_MIN_ITEMS: 15,
  HEADER_CAROUSEL_MIN_ITEMS: 2,
  SEGMENTED_CHIPS_MIN_ITEMS: 5,
  COMPOSER_ATTACHMENTS_MIN_ITEMS: 5,
  SHARE_ACTIONS_ROW_HORIZONTAL_MIN_ITEMS: 5,
  SHARE_ACTIONS_ROW_VERTICAL_MIN_ITEMS: 8,
} as const;

// Feed Types
export const FEED_TYPES = {
  FOLLOWING: 'following',
  DISCOVER: 'discover',
  PROFILE: 'profile',
  LIKES: 'likes',
  REPOSTS: 'reposts',
} as const;

export const HOME_FEED_PAGER_OPTIONS: ReadonlySet<string> = new Set(['following', 'your-mix']);

// Algorithmic feed provider URIs (display names/descriptions fetched from API)
export const ALGORITHMIC_FEED_PROVIDERS = {
  BLUESKY_VIDEO: {
    uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids',
  },
  VIDEOS_FOR_YOU: {
    uri: 'at://did:plc:3guzzweuqraryl3rdkimjamk/app.bsky.feed.generator/videos-for-you',
  },
} as const;

export const DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI = ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri;

// Error messages: use i18n.t('errors.*') - see src/i18n/locales/en.json

/** iOS press dim for `NativePressable` (`TouchableOpacity`); higher = subtler (RN default is 0.2). */
export const NATIVE_PRESSABLE_ACTIVE_OPACITY = 0.76;

// Icon Size Constants
export const ICON_SIZES = {
  SMALL: 16,
  MEDIUM: 20,
  LARGE: 24,
  XLARGE: 32,
} as const;

// Video editor messages: use i18n.t('video.trimNotAvailable') - see src/i18n/locales/en.json

// Discourse community (Ideas and Feature Requests)
export const DISCOURSE = {
  COMMUNITY_URL: 'https://community.getorbyt.com',
  IDEAS_CATEGORY_ID: 11,
  IDEAS_CATEGORY_SLUG: 'ideas-and-feature-requests',
} as const;
