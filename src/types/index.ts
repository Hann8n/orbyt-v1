// Navigation Types
export interface NavigationState {
  index: number;
  routes: Array<{
    name: string;
    params?: any;
  }>;
}

// Feed Types
export type FeedOption = 'following' | 'discover' | 'profile' | 'likes' | 'reposts' | string;

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

// User Types
export interface User {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

// Authentication Types
export interface LoginCredentials {
  handle: string;
  password: string;
}

export interface Session {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

// UI Types
export type ViewMode = 'list' | 'grid';

export interface ProfileColors {
  backgroundColor: string;
  textColor: string;
}

// Component Props Types
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

// Screen Ref Types
export interface HomeScreenRef {
  refresh: () => void;
  isRefreshing: boolean;
}

export interface ListFeedViewRef {
  scrollToTop: () => void;
}

// Error Types
export interface AppError {
  message: string;
  code?: string;
  details?: any;
}

// API Types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

// Cache Types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Text Overlay Types
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

// Import existing types
import type { ModerationDecision } from '../services/ModerationTypes';
export type { OrbytProfileRecord } from './profile';

// Re-export for convenience
export type { ModerationDecision };
