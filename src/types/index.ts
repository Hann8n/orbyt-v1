/**
 * UI Types - Non-API types for UI components, screens, and app-level structures
 * Organized by namespace convention
 */

import type React from 'react';
import type { SharedValue } from 'react-native-reanimated';

// ============================================================================
// UI Component Types
// ============================================================================

/**
 * @namespace UI
 * Component prop types and UI-specific types
 */

/** View mode for feed displays */
export type ViewMode = 'list' | 'grid';

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
  isError: boolean;
  onRetry?: () => void;
  isVisible?: boolean;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  isModal?: boolean;
  isProfileFeed?: boolean;
  /** When provided, list writes its scroll progress (0..1) here on the UI thread. Used by overlay fade. */
  contentScrollProgressOutput?: SharedValue<number>;
  forceError?: boolean;
  ListComponent?: React.ComponentType<unknown> | null;
  targetScrollIndex?: number | null;
  dataUpdatedAt?: number;
  /** When provided, grid item tap calls this (e.g. open feed modal); required for grid tap to do anything. */
  onGridItemPress?: (index: number) => void;
}

/**
 * Text overlay for video editing
 * @usage app/post/VideoPostScreen.tsx:30
 * @usage app/video-editor.tsx:33
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
 * @usage app/(tabs)/index.tsx:9
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
 * Consolidated definition - matches FeedService.ts
 * @usage app/(tabs)/index.tsx:9
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
 * Minimal type for end-of-feed card (only used in ListFeedView)
 * @usage src/components/features/feed/ListFeedView.tsx
 */
export interface EndCardItem {
  post: { uri: 'end-card'; cid: 'end-card' };
  endCard: true;
}

/**
 * Feed list item type - uses native ExtendedFeedViewPost directly, union with EndCardItem for end-of-feed indicator
 * @usage src/components/features/feed/ListFeedView.tsx
 */
export type FeedListItem = ExtendedFeedViewPost | EndCardItem;

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
