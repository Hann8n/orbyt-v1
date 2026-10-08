/**
 * UI Types - Non-API types for UI components, screens, and app-level structures
 * Organized by namespace convention
 */

import type React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type {
  FeedModalSearchParams,
  GridFeedModalZoomConfig,
} from '@/utils/navigation/feedModalRoute';

// ============================================================================
// UI Component Types
// ============================================================================

/**
 * @namespace UI
 * Component prop types and UI-specific types
 */

/** View mode for feed displays */
export type ViewMode = 'list' | 'grid';

export type { FeedModalSearchParams, GridFeedModalZoomConfig };

/** Pull-to-refresh wiring for FlashList-based feeds (e.g. profile/channel). */
export interface ListFeedPullToRefresh {
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
}

/**
 * Component props for ListFeedView
 * @usage src/components/features/feed/ListFeedView.tsx:144
 */
export interface ListFeedViewProps {
  feed: FeedListItem[];
  headerComponent?: React.ReactNode;
  backgroundColor?: string;
  secondaryColor?: string;
  feedOption: FeedOption;
  userDid?: string;
  onLoadMore: () => void;
  isFetchingNextPage: boolean;
  hasNextPage?: boolean;
  isLoading: boolean;
  /** The feed failed with no rows to show. */
  isError: boolean;
  /** False when retrying cannot help (a 4xx): the error shows without Retry. */
  isErrorRetryable?: boolean;
  onRetry?: () => void;
  isVisible?: boolean;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  /** When set, overrides tab-bar inset behavior for list height / liquid-glass snap. */
  hasTabBar?: boolean;
  isProfileFeed?: boolean;
  /** When provided, list writes its scroll progress (0..1) here on the UI thread. Used by overlay fade. */
  contentScrollProgressOutput?: SharedValue<number>;
  forceError?: boolean;
  ListComponent?: React.ComponentType<unknown> | null;
  dataUpdatedAt?: number;
  /** When provided, grid item tap calls this (e.g. open feed modal); required for grid tap to do anything. */
  onGridItemPress?: (index: number) => void;
  /** Post URI to align with `Link.AppleZoomTarget` when opening the feed modal from grid (iOS 18+ zoom). */
  zoomTargetPostUri?: string | null;
  /** When set on iOS, grid uses `Link` + `Link.AppleZoom` per Expo Router zoom transition docs. */
  gridFeedModalZoomConfig?: GridFeedModalZoomConfig | null;
  /** Native pull-to-refresh on list and grid FlashList. */
  pullToRefresh?: ListFeedPullToRefresh;
  /** Navigate to a hashtag feed. */
  onHashtagPress?: (hashtag: string) => void;
  /** When true, show offline state in empty component instead of loading spinner. */
  isPaused?: boolean;
}

/**
 * Text overlay for video editing
 * @usage app/post/VideoPostScreen.tsx:30
 */
export interface TextOverlay {
  id: string;
  text: string;
  position: { x: number; y: number };
  scale?: number;
  color?: string;
  fontFamily?: string;
  style?: {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
  };
}

// ============================================================================
// Screen Ref Types
// ============================================================================

/**
 * @namespace ScreenRefs
 * Ref interfaces for screen components
 */

/**
 * Ref interface for HomeScreen
 * @usage app/(tabs)/home/index.tsx:9
 */
export interface HomeScreenRef {
  refresh: () => void;
}

/**
 * Ref interface for ListFeedView
 * @usage src/components/features/feed/ListFeedView.tsx:144
 * @usage src/components/features/feed/FeedPager.tsx:20
 * @usage src/components/features/feed/SwipeableFeedContainer.tsx:22
 * @usage src/components/features/feed/FeedRenderer.tsx:19
 * @usage src/components/features/feed/GridFeedView.tsx:17
 */
export interface ListFeedViewRef {
  scrollToTop: () => void;
}

// ============================================================================
// Feed Types
// ============================================================================

/**
 * @namespace Feed
 * Feed-related UI types - uses native @atproto/api types directly
 */

import type { ExtendedFeedViewPost } from '../services/api/types';

/**
 * Feed option type for UI navigation
 * Consolidated definition — matches `src/services/FeedService.ts` (app feed), not `AtprotoFeedService`
 * @usage app/(tabs)/home/index.tsx:9
 * @usage src/components/features/feed/ListFeedView.tsx:50
 */
export type FeedOption =
  | 'profile'
  | 'following'
  | 'likes'
  | 'reposts'
  | 'search'
  | 'hashtag'
  | string;

/**
 * Header item type for feed lists - tracked by FlashList viewability
 */
export interface FeedHeaderItem {
  type: 'header';
  component: React.ReactNode;
}

/**
 * Type guard to check if a feed item is a header item
 */
export function isFeedHeaderItem(item: FeedListItem): item is FeedHeaderItem {
  return (item as FeedHeaderItem).type === 'header';
}

/**
 * Feed list items for FlashList / feed views
 * @usage src/components/features/feed/ListFeedView.tsx
 */
export type FeedListItem = ExtendedFeedViewPost | FeedHeaderItem;

// ============================================================================
// Error Types
// ============================================================================

/**
 * @namespace Error
 * Error types for app-level error handling
 */

/**
 * Application error structure
 * @usage src/utils/errorHandler.ts:2
 */
export interface AppError {
  message: string;
  code?: string;
  details?: unknown;
}

// ============================================================================
// Re-exported Types
// ============================================================================

export type { OrbytProfileRecord, ExtendedFeedViewPost } from '../services/api/types';
