/**
 * UI Types - Non-API types for UI components, screens, and app-level structures
 * Organized by namespace convention
 */

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
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  feedOption: FeedOption;
  userDid?: string;
  onLoadMore: () => void;
  isFetchingNextPage: boolean;
  hasNextPage?: boolean;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onPositionChange?: (position: number) => void;
  isVisible?: boolean;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  isModal?: boolean;
  isProfileFeed?: boolean;
  isRefreshing?: boolean;
  isProfileLoading?: boolean;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  onScroll?: (event: { nativeEvent: any }) => void;
  onVerticalScroll?: (scrollY: number) => void;
  forceError?: boolean;
  ListComponent?: any;
  visibilityKey?: string;
  targetScrollIndex?: number | null;
  dataUpdatedAt?: number;
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
  isRefreshing: boolean;
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
// Feed Types (UI-specific, not API types)
// ============================================================================

/**
 * @namespace Feed
 * Feed-related UI types (different from API FeedItem which is ExtendedFeedViewPost)
 */

/**
 * Feed option type for UI navigation
 * @usage app/(tabs)/index.tsx:9
 * @usage src/components/features/feed/ListFeedView.tsx:50
 */
export type FeedOption = 'following' | 'discover' | 'profile' | 'likes' | 'reposts' | string;

/**
 * Feed item type for UI components (has endCard and UI-specific properties)
 * Different from API FeedItem (ExtendedFeedViewPost)
 * @usage src/components/features/feed/ListFeedView.tsx:50,512,521
 * @usage src/components/features/feed/GridFeedView.tsx:30,37,80,189,303
 */
export interface FeedItem {
  post: {
    embed?: {
      $type: string;
      mime?: string;
      playlist?: string | string[];
      media?: {
        $type: string;
        playlist?: string | string[];
      };
    };
    uri: string;
    cid: string;
    author?: {
      avatar?: string;
      displayName?: string;
      handle?: string;
    };
    repostedBy?: {
      avatar?: string;
      displayName?: string;
      handle?: string;
    };
  };
  uniqueKey?: string;
  reason?: {
    $type?: string;
    by?: {
      avatar?: string;
      displayName?: string;
      handle?: string;
    };
  };
  moderationDecision?: ModerationDecision;
  endCard?: boolean;
}

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
  details?: any;
}

// ============================================================================
// Re-exported Types
// ============================================================================

import type { ModerationDecision } from '../services/ModerationTypes';
export type { ModerationDecision };

export type { OrbytProfileRecord } from '../services/api/types';
