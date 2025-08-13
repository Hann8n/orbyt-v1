declare let window: any;
import React, { useState, useEffect, useCallback, useRef, useMemo, useReducer } from 'react';
import {
  View,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScaledSize,
  TouchableOpacity,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';

// Use plain FlashList (animated wrapper removed)
import EmptyFeed from './EmptyFeed';
import { MemoizedVideoItem } from './VideoItem';
import WatchHistory from '../../../services/WatchHistory';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { useClearView } from '@stores/uiStore';
import { usePlaybackStore } from '@stores/playbackStore';
import { Colors } from '../../ui/UI';
import { preloadVideoData } from '../../../utils/helpers/video';

// FlashList v2 immediate playback configuration
const PERFORMANCE_CONFIG = {
  // FlashList v2 enhanced settings for immediate playback
  DRAW_DISTANCE_MULTIPLIER: 4.0, // Increased for more aggressive preloading
  CACHE_BUFFER: 5, // Expanded buffer for aggressive preloading
  PRELOAD_DISTANCE: 8, // Aggressive preloading distance
  WARM_BUFFER_DISTANCE: 3, // Distance to start warming buffers
  
  // Video-specific optimizations for immediate playback
  SCROLL_THROTTLE: 16, // 60fps scroll events
  POSITION_SAVE_DELAY: 500,
  DEBUG_UPDATE_INTERVAL: 1000,
  
  // Snapping optimizations
  SNAP_THRESHOLD: 0.5, // 50% of screen for snapping trigger
  MOMENTUM_THRESHOLD: 100, // Minimum velocity for momentum snapping
} as const;

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

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
  shouldCache?: boolean;
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

interface ListFeedViewProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  feedOption: 'yourMix' | 'following' | 'discover' | 'profile' | 'likes' | 'reposts' | string;
  userDid?: string;
  onLoadMore: () => void;
  isFetchingNextPage: boolean;
  hasNextPage?: boolean;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onPositionChange?: (position: number) => void;
  initialPosition?: number;
  initialIndex?: number;
  initialUri?: string;
  isVisible?: boolean;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  isModal?: boolean;
  onVerticalScroll?: (scrollY: number) => void;
  isRefreshing?: boolean;
  isProfileLoading?: boolean;
  onVisibleChange?: (index: number, video: string | null) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  onScroll?: (event: { nativeEvent: any }) => void;
  forceError?: boolean;
  ListComponent?: any; // When provided, indicates we're inside a Tabs.Container (e.g., Tabs.FlashList)
  useAnimatedScroll?: boolean;
}

// State management using useReducer for better performance
type FeedState = {
  visibleVideo: string | null;
  visibleIndex: number;
  visibleRange: { min: number; max: number };
  scrollDirection: 'up' | 'down' | null;
  isScrubbing: boolean;
};

type FeedAction = 
  | { type: 'SET_VISIBLE_VIDEO'; payload: { video: string | null; index: number } }
  | { type: 'SET_VISIBLE_RANGE'; payload: { min: number; max: number } }
  | { type: 'SET_SCROLL_DIRECTION'; payload: 'up' | 'down' | null }
  | { type: 'SET_SCRUBBING'; payload: boolean }
  ;

const feedReducer = (state: FeedState, action: FeedAction): FeedState => {
  switch (action.type) {
    case 'SET_VISIBLE_VIDEO':
      return {
        ...state,
        visibleVideo: action.payload.video,
        visibleIndex: action.payload.index,
      };
    case 'SET_VISIBLE_RANGE':
      return { ...state, visibleRange: action.payload };
    case 'SET_SCROLL_DIRECTION':
      return { ...state, scrollDirection: action.payload };
    case 'SET_SCRUBBING':
      return { ...state, isScrubbing: action.payload };
    default:
      return state;
  }
};

const initialState: FeedState = {
  visibleVideo: null,
  visibleIndex: 0,
  visibleRange: { min: 0, max: 2 },
  scrollDirection: null,
  isScrubbing: false,
  
};

// CellRenderer removed - FlashList handles cell rendering internally for optimal performance

const ListFeedView: React.FC<ListFeedViewProps> = ({
  feed,
  headerComponent,
  refreshControl,
  backgroundColor,
  secondaryColor,
  feedOption,
  userDid,
  onLoadMore,
  isFetchingNextPage,
  hasNextPage,
  isLoading,
  isError,
  error,
  onRetry,
  onPositionChange,
  initialPosition,
  initialIndex,
  initialUri,
  isVisible,
  viewMode,
  onViewModeChange,
  isModal = false,
  onVerticalScroll,
  isRefreshing = false,
  isProfileLoading = false,
  onVisibleChange,
  onScrubbingChange,
  onScroll,
  forceError = false,
  ListComponent, // When provided, indicates we're inside a Tabs.Container (e.g., Tabs.FlashList)
  useAnimatedScroll = true,
}) => {
  // Hooks
  const { isClearViewMode, toggleClearViewMode } = useClearView();
  const insets = useSafeAreaInsets();
  
  // State management with useReducer
  const [state, dispatch] = useReducer(feedReducer, initialState);
  
  // Note: header visibility tracking removed from this component for simplicity
  
  // Device detection
  const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
  const isHeaderFeed = useMemo(() => (
    feedOption === 'profile' ||
    feedOption === 'likes' ||
    feedOption === 'reposts' ||
    feedOption.startsWith('at://')
  ), [feedOption]);

  // Refs for performance
  const flashListRef = useRef<FlashListRef<FeedItem>>(null);
  const lastOffset = useRef(0);
  const currentScrollOffset = useRef(0);
  const positionSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTsRef = useRef(0);

  // Shared values for animations
  const scrollYShared = useSharedValue(0);

  // Playback control
  const pauseAllVideos = usePlaybackStore(state => state.pauseAllVideos);
  const pauseAllVideosRef = useRef(pauseAllVideos);
  useEffect(() => { pauseAllVideosRef.current = pauseAllVideos; }, [pauseAllVideos]);

  // Viewport calculations with memoization
  const viewportDimensions = useMemo(() => {
    const { width, height } = Dimensions.get('window');
    const bottomNavBarHeight = getBottomNavBarHeight(insets);
    
    let viewportHeight: number;
    if (isSmallDevice) {
      viewportHeight = height;
    } else {
      viewportHeight = height - bottomNavBarHeight - insets.top;
    }
    
    return {
      width,
      height: viewportHeight,
      effectiveInsets: insets,
      bottomNavBarHeight,
      isFullScreen: isSmallDevice,
    };
  }, [isSmallDevice, insets]);

  // Card height calculation
  const cardHeight = useMemo(() => {
    if (isSmallDevice) {
      return viewportDimensions.height;
    }
    return getVideoCardHeight(viewportDimensions.effectiveInsets);
  }, [viewportDimensions.height, viewportDimensions.effectiveInsets, isSmallDevice]);

  // Header height tracking and presence flag (used for index calculations)
  const [headerListHeight, setHeaderListHeight] = useState(0);
  const hasHeader = !!headerComponent;
  const [listLayoutHeight, setListLayoutHeight] = useState<number>(viewportDimensions.height);

  // Stable refs for scroll-time reads to avoid heavy dependencies
  const hasHeaderRef = useRef(hasHeader);
  const headerListHeightRef = useRef(headerListHeight);
  const cardHeightRef = useRef(cardHeight);
  const centerCorrectionRef = useRef(0);
  // No need for centerCorrection with FlashList 2 snapToInterval + snapToAlignment='center'
  const listDataRef = useRef<FeedItem[]>([]);
  const visibleIndexRef = useRef(state.visibleIndex);
  const visibleVideoRef = useRef(state.visibleVideo);
  const lastVisibilityUpdateTsRef = useRef(0);
  const onVisibleChangeRef = useRef(onVisibleChange);
  const onPositionChangeRef = useRef(onPositionChange);
  const onScrollPropRef = useRef(onScroll);
  const onVerticalScrollRef = useRef(onVerticalScroll);

  useEffect(() => { hasHeaderRef.current = hasHeader; }, [hasHeader]);
  useEffect(() => { headerListHeightRef.current = headerListHeight; }, [headerListHeight]);
  useEffect(() => { cardHeightRef.current = cardHeight; }, [cardHeight]);
  useEffect(() => {
    // Center correction ensures items snap to the viewport center accounting for header
    const correction = Math.max(0, Math.round((listLayoutHeight - cardHeight) / 2));
    centerCorrectionRef.current = correction;
  }, [listLayoutHeight, cardHeight]);
  // listDataRef is updated after listData is computed below
  useEffect(() => { visibleIndexRef.current = state.visibleIndex; }, [state.visibleIndex]);
  useEffect(() => { visibleVideoRef.current = state.visibleVideo; }, [state.visibleVideo]);
  useEffect(() => { onVisibleChangeRef.current = onVisibleChange; }, [onVisibleChange]);
  useEffect(() => { onPositionChangeRef.current = onPositionChange; }, [onPositionChange]);
  useEffect(() => { onScrollPropRef.current = onScroll; }, [onScroll]);
  useEffect(() => { onVerticalScrollRef.current = onVerticalScroll; }, [onVerticalScroll]);

  // (moved earlier)

  // Optimized feed data processing
  const displayFeed = useMemo(() => {
    if (isRefreshing) return [];
    
    const seenUris = new Set<string>();
    const seenCids = new Set<string>();
    
    return feed.filter((item) => {
      const uri = item.post.uri;
      const cid = item.post.cid;
      
      if (!uri || !cid) return false;
      
      const uniqueId = `${uri}_${cid}`;
      
      if (seenUris.has(uri) || seenCids.has(cid) || seenUris.has(uniqueId)) {
        return false;
      }
      
      seenUris.add(uri);
      seenCids.add(cid);
      seenUris.add(uniqueId);
      return true;
    });
  }, [feed, isRefreshing]);

  // List data with end card
  const listData = useMemo(() => {
    const base = displayFeed;
    const shouldAppendEndCard = !isLoading && !isError && !isFetchingNextPage && !hasNextPage && base.length > 0;
    
    if (shouldAppendEndCard) {
      return [
        ...base,
        {
          post: { uri: 'end-card', cid: 'end-card' } as any,
          endCard: true,
        } as FeedItem,
      ];
    }
    return base;
  }, [displayFeed, isLoading, isError, isFetchingNextPage, hasNextPage]);

  // Keep listData ref in sync post-compute
  useEffect(() => {
    listDataRef.current = listData;
  }, [listData]);

  // Error handling
  const effectiveError = forceError ? new Error('Forced error for testing') : error;
  const effectiveIsError = forceError || isError;

  // Callbacks
  const handleScrubbingChange = useCallback((isScrubbing: boolean) => {
    dispatch({ type: 'SET_SCRUBBING', payload: isScrubbing });
    onScrubbingChange?.(isScrubbing);
  }, [onScrubbingChange]);

  const handleVideoStatus = useCallback((uri: string, status: string) => {
    // Simple status handling - no logging needed
  }, []);

  // Simplified scroll handling - let FlashList handle visibility via onViewableItemsChanged  
  const handleScrollFromUI = useCallback((y: number, contentHeight: number, screenHeight: number) => {
    // Throttled scroll handling
    const now = Date.now();
    if (now - lastScrollTsRef.current < PERFORMANCE_CONFIG.SCROLL_THROTTLE) {
      return;
    }
    lastScrollTsRef.current = now;

    try {
      onScrollPropRef.current?.({ nativeEvent: { 
        contentOffset: { y }, 
        contentSize: { height: contentHeight }, 
        layoutMeasurement: { height: screenHeight } 
      }});
    } catch (e) {
      // Silently handle scroll errors
    }

    currentScrollOffset.current = y;
    // Keep shared value in sync for any consumers
    try { scrollYShared.value = y; } catch {}

    // Track scroll direction with better logic
    const delta = y - lastOffset.current;
    if (Math.abs(delta) > 20) { // Increased threshold for better direction detection
      const newDirection = delta > 0 ? 'down' : 'up';
      if (newDirection !== state.scrollDirection) {
        dispatch({ type: 'SET_SCROLL_DIRECTION', payload: newDirection });
      }
    }
    
    lastOffset.current = y;
    onVerticalScrollRef.current?.(y);
  }, []);

  // Lightweight native onScroll handler for FlashList
  const onScrollNative = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    try {
      if (__DEV__) {
        // Lightweight scroll debug (throttled higher up)
        if (Math.random() < 0.001) {
          // 0.1% of events
          // eslint-disable-next-line no-console
          console.log('[FeedScroll]', Math.round(contentOffset?.y || 0), listDataRef.current?.length || 0);
        }
      }
    } catch {}
    const offsetY = contentOffset?.y || 0;
    handleScrollFromUI(offsetY, contentSize?.height || 0, layoutMeasurement?.height || 0);

    // If snapped at top on a header feed, pause all playback (simple rule)
    if (hasHeaderRef.current) {
      const TOP_SNAP_TOLERANCE = 50; // pixels
      if (offsetY <= TOP_SNAP_TOLERANCE) {
        try { pauseAllVideosRef.current?.(); } catch {}
        if (visibleVideoRef.current !== null) {
          dispatch({ type: 'SET_VISIBLE_VIDEO', payload: { video: null, index: 0 } });
          onVisibleChangeRef.current?.(0, null);
          visibleVideoRef.current = null;
          visibleIndexRef.current = 0;
        }
      }
    }
  }, [handleScrollFromUI]);

  // Removed adapter/Tabs-specific animated onScroll logic

  // Manual snapping function removed - using consistent automatic snapping for all feeds

  // Simplified test snapping functionality for FlashList 2 center snapping
  const testSnapping = useCallback((targetIndex: number) => {
    if (!flashListRef.current || targetIndex < 0 || targetIndex >= listData.length) return;
    
    // Use FlashList's scrollToIndex which respects the snapToInterval and center alignment
    flashListRef.current.scrollToIndex({ 
      index: targetIndex, 
      animated: true,
      viewPosition: 0.5 // Center the item in the viewport
    });
    
    setTimeout(() => {
      const visibleItem = listData[targetIndex];
      if (visibleItem && !visibleItem.endCard) {
        dispatch({ type: 'SET_VISIBLE_VIDEO', payload: { video: visibleItem.post.uri, index: targetIndex } });
      }
    }, 300);
  }, [listData]);

  // Expose test function globally for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__TEST_FLASH_LIST_SNAPPING__ = testSnapping;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__TEST_FLASH_LIST_SNAPPING__;
      }
    };
  }, [testSnapping]);

  // Preload on scroll end for upcoming videos
  const handleScrollEndPreload = useCallback(() => {
    if (displayFeed.length > 0) {
      // Simple preloading for visible videos
      preloadVideoData(displayFeed.map(item => item.post));
    }
  }, [displayFeed]);

  // Momentum end: rely on FlashList's viewability for visibility; only do bookkeeping/preload
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    // Debounce position saving
    if (positionSaveTimeout.current) {
      clearTimeout(positionSaveTimeout.current);
    }
    positionSaveTimeout.current = setTimeout(() => {
      if (onPositionChangeRef.current && Math.abs(offsetY - lastOffset.current) > 50) {
        onPositionChangeRef.current(offsetY);
      }
    }, PERFORMANCE_CONFIG.POSITION_SAVE_DELAY);
    lastOffset.current = offsetY;
    currentScrollOffset.current = offsetY;
    dispatch({ type: 'SET_SCROLL_DIRECTION', payload: null });
    handleScrollEndPreload();

    // If snapped to top on a header feed, pause all playback and clear active video
    if (hasHeaderRef.current) {
      const TOP_SNAP_TOLERANCE = 2; // pixels
      if (offsetY <= TOP_SNAP_TOLERANCE) {
        try { pauseAllVideosRef.current?.(); } catch {}
        if (visibleVideoRef.current !== null) {
          dispatch({ type: 'SET_VISIBLE_VIDEO', payload: { video: null, index: 0 } });
          onVisibleChangeRef.current?.(0, null);
          visibleVideoRef.current = null;
          visibleIndexRef.current = 0;
        }
      }
    }
  }, [handleScrollEndPreload]);

  // No need to update visibility on end-drag; handled continuously during scroll
  const onScrollEndDrag = useCallback((_e: NativeSyntheticEvent<NativeScrollEvent>) => {}, []);

  // Use FlashList v2's native viewability detection instead of manual calculations
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    const now = Date.now();
    // Light debounce to reduce flicker but keep fast starts
    if (now - lastVisibilityUpdateTsRef.current < 40) {
      return;
    }
    if (viewableItems.length === 0) return;
    // Compute base offset for header, but do not block playback while header is partially visible
    let base = 0;
    if (hasHeaderRef.current && headerListHeightRef.current > 0) {
      base = Math.max(0, headerListHeightRef.current - (centerCorrectionRef.current || 0));
    }

    // Pick the viewable item closest to the visual center for stability
    const localCardH = cardHeightRef.current || 1;
    const adjustedOffset = Math.max(0, (currentScrollOffset.current || 0) - base);
    const centerIndex = Math.round(adjustedOffset / localCardH);
    let candidate: any = null;
    let smallestDistance = Number.POSITIVE_INFINITY;
    for (const v of viewableItems) {
      if (v?.isViewable && v?.item && !v.item.endCard && v.item.post?.uri) {
        const d = Math.abs((v.index ?? 0) - centerIndex);
        if (d < smallestDistance) {
          smallestDistance = d;
          candidate = v;
        }
      }
    }

    if (!candidate) {
      // E.g., end card centered: clear active video
      if (visibleVideoRef.current !== null) {
        dispatch({ type: 'SET_VISIBLE_VIDEO', payload: { video: null, index: 0 } });
        onVisibleChangeRef.current?.(0, null);
        visibleVideoRef.current = null;
        visibleIndexRef.current = 0;
        lastVisibilityUpdateTsRef.current = now;
      }
      return;
    }

    const nextUri = candidate.item.post.uri;
    const nextIndex = candidate.index;
    if (nextUri !== visibleVideoRef.current || nextIndex !== visibleIndexRef.current) {
      dispatch({ type: 'SET_VISIBLE_VIDEO', payload: { video: nextUri, index: nextIndex } });
      onVisibleChangeRef.current?.(nextIndex, nextUri);
      visibleVideoRef.current = nextUri;
      visibleIndexRef.current = nextIndex;
      lastVisibilityUpdateTsRef.current = now;
    }
  }, []);

  // Simple video preloading for immediate playback
  useEffect(() => {
    if (displayFeed.length > 0) {
      // Preload first few videos only
      preloadVideoData(displayFeed.map(item => item.post));
    }
  }, [displayFeed]);

  // No overlay header; header is rendered as ListHeaderComponent to avoid stickiness

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<FeedItem>) => {
    if (item.endCard) {
      return (
        <View style={{ height: cardHeight, width: '100%' }}>
          <EmptyFeed
            type="end"
            secondaryColor={secondaryColor}
            profileColors={secondaryColor ? { 
              backgroundColor: backgroundColor || '#000', 
              textColor: secondaryColor 
            } : undefined}
            viewableAreaHeight={cardHeight}
            feedOption={feedOption}
          />
        </View>
      );
    }

    // Simplified video state management for FlashList 2 center snapping
    const isActiveVideo = item.post.uri === state.visibleVideo;
    const isVideoVisible = isActiveVideo && isVisible && !state.isScrubbing;
    
    // With center snapping, if a video is the active (centered) video, it should play
    // This works for both header and non-header feeds since FlashList handles centering
    const shouldPlayVideo = isVideoVisible;
    
    return (
      <View style={{ height: cardHeight, width: '100%' }}>
        <MemoizedVideoItem
          post={item.post}
          feedItem={item}
          isPlaying={shouldPlayVideo}
          handleVideoStatus={handleVideoStatus}
          height={cardHeight}
          scrollY={scrollYShared}
          feedOption={feedOption as 'yourMix' | 'following' | 'discover'}
          isVisible={isVideoVisible}
          moderationDecision={item.moderationDecision}
          onScrubbingChange={handleScrubbingChange}
          isModal={isModal}
          index={index}
        />
      </View>
    );
  }, [
    cardHeight,
    state.visibleVideo,
    state.isScrubbing,
    feedOption,
    scrollYShared,
    isVisible,
    backgroundColor,
    secondaryColor,
    handleVideoStatus,
    handleScrubbingChange,
    isModal,
  ]);

  // FlashList v2 automatically handles layout - getItemLayout removed

  // Item type for FlashList recycling
  const getItemType = useCallback((item: FeedItem) => (item.endCard ? 'endCard' : 'row'), []);

  // Key extractor with better performance
  const keyExtractor = useCallback((item: FeedItem) => {
    // Stable keys prevent unnecessary item re-mounts which can reset video state
    return item.endCard ? 'end-card' : `${item.post.uri}_${item.post.cid}`;
  }, []);

  // Grid item press handler
  const handleGridItemPress = useCallback((index: number) => {
    if (viewMode === 'grid' && onViewModeChange && index >= 0 && index < feed.length) {
      onViewModeChange('list');
      
      setTimeout(() => {
        flashListRef.current?.scrollToIndex({ index, animated: true });
        
        setTimeout(() => {
          const targetVideo = feed[index]?.post?.uri;
          if (targetVideo) {
            dispatch({ 
              type: 'SET_VISIBLE_VIDEO', 
              payload: { video: targetVideo, index }
            });
          }
        }, 200);
      }, 100);
    }
  }, [feed.length, viewMode, onViewModeChange]);

  // Watch history effect
  useEffect(() => {
    if (state.visibleVideo && feedOption === 'yourMix') {
      WatchHistory.addToWatchHistory(state.visibleVideo);
    }
  }, [state.visibleVideo, feedOption]);

  // Removed app state tracking for simplified logic

  // Removed debug overlay polling

  // Proper initial positioning that respects header feeds  
  useEffect(() => {
    if (!flashListRef.current || listData.length === 0) return;

    const hasExplicitTarget = typeof initialIndex === 'number' || !!initialUri;

    // Compute target index when explicitly provided
    let targetIndex = initialIndex;
    if (initialUri) {
      const foundIndex = displayFeed.findIndex(item => item?.post?.uri === initialUri);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }
    
    if (hasExplicitTarget && typeof targetIndex === 'number') {
      // Only scroll to specific items when explicitly requested
      targetIndex = Math.max(0, Math.min(targetIndex, displayFeed.length - 1));
      const targetUri = displayFeed[targetIndex]?.endCard ? null : displayFeed[targetIndex]?.post?.uri || null;
      if (targetUri) {
        dispatch({ type: 'SET_VISIBLE_VIDEO', payload: { video: targetUri, index: targetIndex } });
      }
      
      setTimeout(() => {
        try {
          flashListRef.current?.scrollToIndex({ 
            index: targetIndex!, 
            animated: false,
            viewPosition: 0.5 // Center the item in viewport
          });
        } catch {}
      }, 50);
    } else {
      // For header feeds without explicit target, start at top (header visible)
      // FlashList will handle snapping when user scrolls
      if (hasHeader) {
        setTimeout(() => {
          try {
            flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
          } catch {}
        }, 50);
      }
    }
    
    // Simplified initial positioning for FlashList v2 center snapping
    // Let FlashList handle everything - no special header logic needed
    setTimeout(() => {
      try {
        // Always use scrollToIndex with center positioning - FlashList v2 handles headers automatically
        flashListRef.current?.scrollToIndex({ 
          index: targetIndex!, 
          animated: false,
          viewPosition: 0.5 // Center the item in viewport
        });
      } catch {}
    }, 50);
  }, [initialIndex, initialUri, displayFeed.length, hasHeader, listData.length, displayFeed]);

  // Improved orientation change handling for FlashList 2 center snapping
  useEffect(() => {
    const handleOrientationChange = ({ window }: { window: ScaledSize }) => {
      setTimeout(() => {
        if (flashListRef.current && displayFeed.length > 0) {
          flashListRef.current.scrollToIndex({
            index: state.visibleIndex,
            animated: false,
            viewPosition: 0.5, // Center the item in viewport
          });
        }
      }, 100);
    };

    const subscription = Dimensions.addEventListener('change', handleOrientationChange);
    return () => subscription?.remove();
  }, [displayFeed.length, state.visibleIndex]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (positionSaveTimeout.current) {
        clearTimeout(positionSaveTimeout.current);
      }
    };
  }, []);

  // Grid view rendering
  if (viewMode === 'grid') {
    return (
      <GridFeedView
        feed={feed}
        headerComponent={headerComponent}
        refreshControl={refreshControl}
        backgroundColor={backgroundColor}
        secondaryColor={secondaryColor}
        isProfileLoading={isProfileLoading}
        isProfileFeed={isHeaderFeed}
        feedOption={feedOption}
        userDid={userDid}
        onLoadMore={onLoadMore}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        onGridItemPress={handleGridItemPress}
        isError={effectiveIsError}
        error={effectiveError}
        onRetry={onRetry}
        ListComponent={ListComponent}
      />
    );
  }

  const viewableAreaHeight = viewportDimensions.height;
  // When using Tabs.FlashList (collapsible header), subtract the header height so
  // ListEmptyComponent fills the visible area beneath the header.
  const headerHeightForTabs = useMemo(() => (ListComponent ? 280 : 0), [ListComponent]);
  const emptyComponentHeight = Math.max(0, viewableAreaHeight - headerHeightForTabs);

  // Determine which FlashList component to use
  const FlashListComponent: any = useMemo(() => FlashList, []);

  // Simplified snapping: use snapToInterval for consistent center snapping
  const snapToIntervalValue = cardHeight;

  const isPagingEnabled = false;

  // Custom snap offsets for header feeds: first snap centers first video, then standard intervals
  const snapToOffsets = useMemo(() => {
    if (!hasHeader || headerListHeight <= 0 || cardHeight <= 0) return null;
    const offsets: number[] = [];
    // Allow resting at the very top (header fully visible)
    offsets.push(0);
    // Base offset that centers the first item
    const centerCorrection = Math.max(0, Math.round((listLayoutHeight - cardHeight) / 2));
    const base = Math.max(0, headerListHeight - centerCorrection);
    const itemCount = listData.length;
    for (let i = 0; i < itemCount; i++) {
      offsets.push(base + i * cardHeight);
    }
    return offsets;
  }, [hasHeader, headerListHeight, cardHeight, listLayoutHeight, listData.length]);

  // Main render - unified approach for feeds with or without headers
  return (
    <View 
      style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]} 
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== listLayoutHeight) setListLayoutHeight(h);
      }}
    > 
      {/* Header rendered in list via ListHeaderComponent so it scrolls away (non-sticky) */}
      
      {/* Debug overlay removed for simplicity */}

      {/* FlashList implementation with center snapping */}
      <FlashListComponent
        ref={flashListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ListHeaderComponent={headerComponent ? (
          <View onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== headerListHeight) setHeaderListHeight(h);
          }}>
            {headerComponent}
          </View>
        ) : null}
        
        // CRITICAL: Provide accurate estimatedItemSize for optimal performance
        estimatedItemSize={cardHeight}
        
        // FlashList optimizations for video performance
        drawDistance={cardHeight * PERFORMANCE_CONFIG.DRAW_DISTANCE_MULTIPLIER}
        removeClippedSubviews={true}
        
        // FlashList 2 snapping configuration
        pagingEnabled={false}
        {...(snapToOffsets
          ? { snapToOffsets }
          : { snapToInterval: snapToIntervalValue, snapToAlignment: 'center' as const }
        )}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
  scrollEventThrottle={16}
        
        onScroll={onScrollNative as any}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 60, // balance speed and stability
          minimumViewTime: 50, // faster start without excessive flicker
          waitForInteraction: false,
        }}
        viewabilityConfigCallbackPairs={undefined} // Use single viewability config
        
        // Disable scrolling when empty; otherwise respect scrubbing lock
        scrollEnabled={!state.isScrubbing && listData.length > 0}
        showsVerticalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled={true}
        initialScrollIndex={typeof initialIndex === 'number' ? initialIndex : undefined}
        
        // Components
        ListEmptyComponent={
          isLoading ? (
            <View style={[styles.centeredLoadingContainer, { backgroundColor: backgroundColor || Colors.black }]}>
              <ActivityIndicator size="large" color={secondaryColor || Colors.white} />
            </View>
          ) : effectiveIsError ? (
            <EmptyFeed 
              type="error"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { 
                backgroundColor: backgroundColor || '#000', 
                textColor: secondaryColor 
              } : undefined}
              onRetry={onRetry}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          ) : feedOption === 'following' ? (
            <EmptyFeed 
              type="no-following"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { 
                backgroundColor: backgroundColor || '#000', 
                textColor: secondaryColor 
              } : undefined}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          ) : (
            <EmptyFeed 
              type="no-videos"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { 
                backgroundColor: backgroundColor || '#000', 
                textColor: secondaryColor 
              } : undefined}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          )
        }
        
        // FlashList only supports padding and backgroundColor in contentContainerStyle
        contentContainerStyle={{
          backgroundColor: backgroundColor || Colors.black,
          paddingBottom: displayFeed.length === 0 ? 0 : viewportDimensions.bottomNavBarHeight,
        }}
      />

      {/* Feed debugger removed */}
      
      {/* Clear view exit button */}
      {isClearViewMode && (
        <TouchableOpacity 
          style={styles.clearViewExitButton}
          onPress={toggleClearViewMode}
          activeOpacity={0.7}
        >
          <Icon 
            name="zen" 
            size={24} 
            color={Colors.white} 
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Removed debug/absolute header styles for simplicity
  centeredLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: SCREEN_HEIGHT,
  },
  clearViewExitButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default ListFeedView;