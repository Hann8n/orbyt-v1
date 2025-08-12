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
  Text,
  ScaledSize,
  TouchableOpacity,
  AppState,
  AppStateStatus,
} from 'react-native';
import ReAnimated, { 
  FadeIn, 
  FadeOut, 
  Layout, 
  Easing, 
  useAnimatedScrollHandler, 
  runOnJS,
  useSharedValue,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef, type FlashListProps, type ListRenderItemInfo } from '@shopify/flash-list';
import { Tabs } from 'react-native-collapsible-tab-view';

// Create Reanimated version of FlashList with proper typing for v2
const AnimatedFlashList = ReAnimated.createAnimatedComponent(FlashList);
// Create Tabs version of FlashList for collapsible header support
const TabsFlashList = Tabs.FlashList;
import EmptyFeed from './EmptyFeed';
import { MemoizedVideoItem } from './VideoItem';
import WatchHistory from '../../../services/WatchHistory';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { useClearView } from '../../../services/ClearViewContext';
import FeedDebugger from '../../../utils/helpers/FeedDebuger';
import AccountManager from '../../../services/storage/AccountManager';
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
  debugScrollInfo: { scrollY: number; scrollProgress: number; isNearEnd: boolean };
  isFeedDebugEnabled: boolean;
  appState: AppStateStatus;
};

type FeedAction = 
  | { type: 'SET_VISIBLE_VIDEO'; payload: { video: string | null; index: number } }
  | { type: 'SET_VISIBLE_RANGE'; payload: { min: number; max: number } }
  | { type: 'SET_SCROLL_DIRECTION'; payload: 'up' | 'down' | null }
  | { type: 'SET_SCRUBBING'; payload: boolean }
  | { type: 'SET_DEBUG_SCROLL_INFO'; payload: { scrollY: number; scrollProgress: number; isNearEnd: boolean } }
  | { type: 'SET_DEBUG_ENABLED'; payload: boolean }
  | { type: 'SET_APP_STATE'; payload: AppStateStatus };

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
    case 'SET_DEBUG_SCROLL_INFO':
      return { ...state, debugScrollInfo: action.payload };
    case 'SET_DEBUG_ENABLED':
      return { ...state, isFeedDebugEnabled: action.payload };
    case 'SET_APP_STATE':
      return { ...state, appState: action.payload };
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
  debugScrollInfo: { scrollY: 0, scrollProgress: 0, isNearEnd: false },
  isFeedDebugEnabled: false,
  appState: 'active',
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
  const lastScrollInfoRef = useRef(state.debugScrollInfo);
  const debugUpdateTimeout = useRef<NodeJS.Timeout | null>(null);

  // Shared values for animations
  const scrollYShared = useSharedValue(0);
  const isScrolling = useSharedValue(false);

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

  // Scroll handling with throttling
  const handleScrollFromUI = useCallback((y: number, contentHeight: number, screenHeight: number) => {
    // Throttled scroll handling
    const now = Date.now();
    if (now - lastScrollInfoRef.current.scrollY < PERFORMANCE_CONFIG.SCROLL_THROTTLE) {
      return;
    }

    try {
      onScroll?.({ nativeEvent: { 
        contentOffset: { y }, 
        contentSize: { height: contentHeight }, 
        layoutMeasurement: { height: screenHeight } 
      }});
    } catch (e) {
      // Silently handle scroll errors
    }

    currentScrollOffset.current = y;

    // Update debug info with throttling
    const maxScrollY = Math.max(1, contentHeight - screenHeight);
    const progress = Math.min(Math.max(y / maxScrollY, 0), 1);
    const nearEnd = progress >= 0.9;
    
    const last = lastScrollInfoRef.current;
    if (Math.abs(last.scrollY - y) > 50 || Math.abs(last.scrollProgress - progress) > 0.05 || last.isNearEnd !== nearEnd) {
      lastScrollInfoRef.current = { scrollY: y, scrollProgress: progress, isNearEnd: nearEnd };
      
      // Debounce debug updates
      if (debugUpdateTimeout.current) {
        clearTimeout(debugUpdateTimeout.current);
      }
      debugUpdateTimeout.current = setTimeout(() => {
        dispatch({ type: 'SET_DEBUG_SCROLL_INFO', payload: { scrollY: y, scrollProgress: progress, isNearEnd: nearEnd } });
      }, PERFORMANCE_CONFIG.DEBUG_UPDATE_INTERVAL);
    }

    // Track scroll direction with better logic
    const delta = y - lastOffset.current;
    if (Math.abs(delta) > 20) { // Increased threshold for better direction detection
      const newDirection = delta > 0 ? 'down' : 'up';
      if (newDirection !== state.scrollDirection) {
        dispatch({ type: 'SET_SCROLL_DIRECTION', payload: newDirection });
      }
    }
    
    lastOffset.current = y;
    onVerticalScroll?.(y);
  }, [onScroll, onVerticalScroll, state.scrollDirection]);

  // Optimized animated scroll handler
  const onScrollAnimated = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        scrollYShared.value = event.contentOffset.y;
        
        const y = event.contentOffset.y;
        const contentHeight = event.contentSize?.height ?? 0;
        const screenHeight = event.layoutMeasurement?.height ?? 1;
        
        runOnJS(handleScrollFromUI)(y, contentHeight, screenHeight);
      },
      onBeginDrag: () => {
        isScrolling.value = true;
      },
      onEndDrag: () => {
        isScrolling.value = false;
      },
    },
    [handleScrollFromUI]
  );

  // Manual snapping function removed - using consistent automatic snapping for all feeds

  // Test snapping functionality (can be called via debug console)
  const testSnapping = useCallback((targetIndex: number) => {
    if (!flashListRef.current || targetIndex < 0 || targetIndex >= listData.length) return;
    
    const offset = targetIndex * cardHeight;
    flashListRef.current.scrollToOffset({
      offset,
      animated: true,
    });
    
    // Update visible video after snapping
    setTimeout(() => {
      const visibleItem = listData[targetIndex];
      if (visibleItem && !visibleItem.endCard) {
        dispatch({ 
          type: 'SET_VISIBLE_VIDEO', 
          payload: { video: visibleItem.post.uri, index: targetIndex }
        });
      }
    }, 300);
  }, [cardHeight, listData]);

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

  // Unified momentum scroll end - consistent snapping for all feeds
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const targetIndex = Math.round(offsetY / cardHeight);
    
    // Update visible video index based on snapped position for all feeds
    const visibleItem = listData[targetIndex];
    if (visibleItem && !visibleItem.endCard) {
      dispatch({ 
        type: 'SET_VISIBLE_VIDEO', 
        payload: { video: visibleItem.post.uri, index: targetIndex }
      });
    }
    
    // Debounce position saving
    if (positionSaveTimeout.current) {
      clearTimeout(positionSaveTimeout.current);
    }
    
    positionSaveTimeout.current = setTimeout(() => {
      if (onPositionChange && Math.abs(offsetY - lastOffset.current) > 50) {
        onPositionChange(offsetY);
      }
    }, PERFORMANCE_CONFIG.POSITION_SAVE_DELAY);
    
    lastOffset.current = offsetY;
    currentScrollOffset.current = offsetY;
    dispatch({ type: 'SET_SCROLL_DIRECTION', payload: null });
    
    // Trigger intelligent preloading when scroll ends
    handleScrollEndPreload();
  }, [onPositionChange, cardHeight, listData, handleScrollEndPreload]);

  // Earlier visibility update when user lifts finger (before momentum fully ends)
  const onScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const targetIndex = Math.round(offsetY / cardHeight);
    
    // Update visible video for all feeds when user lifts finger
    const visibleItem = listData[targetIndex];
    if (visibleItem && !visibleItem.endCard) {
      dispatch({
        type: 'SET_VISIBLE_VIDEO',
        payload: { video: visibleItem.post.uri, index: targetIndex }
      });
    }
  }, [cardHeight, listData]);

  // Enhanced viewability handler with better logic
  const onViewableItemsChanged = useCallback((info: { viewableItems: any[]; changed: any[] }) => {
    const { viewableItems } = info;
    if (!viewableItems?.length) return;

    // Find the most visible video item (highest visibility percentage)
    let mostVisibleItem = null;
    let highestVisibility = 0;

    for (const item of viewableItems) {
      if (!item?.item?.endCard && item?.isViewable) {
        // Use the item with highest visibility or first valid item
        const visibility = item.visiblePercentage || 100;
        if (visibility > highestVisibility || !mostVisibleItem) {
          mostVisibleItem = item;
          highestVisibility = visibility;
        }
      }
    }

    if (mostVisibleItem) {
      const newVisibleVideo = mostVisibleItem.item?.post?.uri || null;
      const newVisibleIndex = mostVisibleItem.index ?? 0;
      
      if (newVisibleVideo && newVisibleVideo !== state.visibleVideo) {
        dispatch({ 
          type: 'SET_VISIBLE_VIDEO', 
          payload: { video: newVisibleVideo, index: newVisibleIndex }
        });
        onVisibleChange?.(newVisibleIndex, newVisibleVideo);
      }
    }
  }, [state.visibleVideo, onVisibleChange]);

  // Simple video preloading for immediate playback
  useEffect(() => {
    if (displayFeed.length > 0) {
      // Preload first few videos only
      preloadVideoData(displayFeed.map(item => item.post));
    }
  }, [displayFeed]);

  // Header overlay height measurement for content padding (non-collapsible)
  const [overlayHeaderHeight, setOverlayHeaderHeight] = useState(0);

  // Optimized render item with better memoization and proper typing
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

    // Improved video state management with better visibility logic
    const isActiveVideo = item.post.uri === state.visibleVideo;
    const isVideoVisible = isActiveVideo && isVisible && !state.isScrubbing;
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

  // App state handling for video optimization
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      dispatch({ type: 'SET_APP_STATE', payload: nextAppState });
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  // Debug settings polling with cleanup
  useEffect(() => {
    let mounted = true;
    
    const updateDebugSettings = async () => {
      try {
        const globalVal = (global as any)?.__ORBYT_FEED_DEBUG_OVERLAY__;
        const debugEnabled = typeof globalVal === 'boolean' ? globalVal : await AccountManager.getFeedDebugOverlayEnabled();
        
        if (mounted && debugEnabled !== state.isFeedDebugEnabled) {
          dispatch({ type: 'SET_DEBUG_ENABLED', payload: debugEnabled });
        }
      } catch (e) {
        // Silently handle errors
      }
    };

    updateDebugSettings();
    const interval = setInterval(updateDebugSettings, 2000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [state.isFeedDebugEnabled]);

  // Initial scroll to index/URI
  useEffect(() => {
    if (!flashListRef.current || listData.length === 0) return;

    let targetIndex = initialIndex;
    if (initialUri) {
      const foundIndex = displayFeed.findIndex(item => item?.post?.uri === initialUri);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }

    if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex < displayFeed.length) {
      dispatch({ 
        type: 'SET_VISIBLE_VIDEO', 
        payload: { 
          video: displayFeed[targetIndex]?.post?.uri || null, 
          index: targetIndex 
        }
      });
      
      setTimeout(() => {
        flashListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      }, 100);
    }
  }, [initialIndex, initialUri, displayFeed.length]);

  // Orientation change handling
  useEffect(() => {
    const handleOrientationChange = ({ window }: { window: ScaledSize }) => {
      setTimeout(() => {
        if (flashListRef.current && displayFeed.length > 0) {
          flashListRef.current.scrollToIndex({
            index: state.visibleIndex,
            animated: false,
            viewPosition: 0,
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
      if (debugUpdateTimeout.current) {
        clearTimeout(debugUpdateTimeout.current);
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

  // Determine which FlashList component to use - simplified and optimized
  const FlashListComponent = useMemo(() => {
    // When using collapsible header, always use the provided ListComponent (Tabs.FlashList)
    if (ListComponent) {
      return ListComponent;
    }
    // Use animated version for better performance when not in collapsible mode
    return useAnimatedScroll ? AnimatedFlashList : FlashList;
  }, [ListComponent, useAnimatedScroll]);

  // Main render - unified approach for both collapsible and non-collapsible headers
  return (
    <View style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]}> 
      {/* Header overlay for non-collapsible headers */}
      {headerComponent && !ListComponent && (
        <View
          style={styles.absoluteHeader}
          pointerEvents="box-none"
        >
          <View onLayout={(e) => setOverlayHeaderHeight(e.nativeEvent.layout.height)} pointerEvents="box-none">
            {headerComponent}
          </View>
        </View>
      )}
      
      {/* Debug overlay */}
      {(typeof window !== 'undefined' && (window as any).__LIST_FEED_DEBUG__ === true) && (
        <View style={styles.debugOverlay}>
          <Text style={styles.debugText}>scrollY: {Math.round(currentScrollOffset.current)}</Text>
          <Text style={styles.debugText}>isHeaderFeed: {String(isHeaderFeed)}</Text>
          <Text style={styles.debugText}>visibleIndex: {state.visibleIndex}</Text>
          <Text style={styles.debugText}>visibleVideo: {state.visibleVideo}</Text>
          <Text style={styles.debugText}>cardHeight: {cardHeight}</Text>
          <Text style={styles.debugText}>viewportHeight: {viewportDimensions.height}</Text>
          <Text style={styles.debugText}>isSmallDevice: {String(isSmallDevice)}</Text>
          <Text style={styles.debugText}>appState: {state.appState}</Text>
          <Text style={styles.debugText}>pagingEnabled: true</Text>
          <Text style={styles.debugText}>snapToInterval: {cardHeight}</Text>
          <Text style={styles.debugText}>drawDistance: {cardHeight * PERFORMANCE_CONFIG.DRAW_DISTANCE_MULTIPLIER}</Text>
          <Text style={styles.debugText}>totalItems: {listData.length}</Text>
          <Text style={styles.debugText}>visibilityThreshold: {isHeaderFeed ? 30 : 50}%</Text>
          <Text style={styles.debugText}>activeThreshold: {isHeaderFeed ? 50 : 75}%</Text>
          <Text style={styles.debugText}>testSnapping: __TEST_FLASH_LIST_SNAPPING__(index)</Text>
          <Text style={styles.debugText}>forceError: {String(forceError)}</Text>
          <Text style={styles.debugText}>usingTabsFlashList: {String(!!ListComponent)}</Text>
        </View>
      )}

      {/* 
        FlashList Implementation with Optimized Video Snapping and Collapsible Header Support
        ===================================================================================
        
        Key Optimizations:
        1. ✅ Removed key props from components to enable FlashList view recycling
        2. ✅ Uses pagingEnabled={!isHeaderFeed} for automatic snapping on non-header feeds
        3. ✅ Uses snapToAlignment="center" to center videos on screen
        4. ✅ Uses snapToInterval={cardHeight} for consistent snap distances
        5. ✅ Manual snapping fallback for header feeds via performManualSnap()
        6. ✅ Optimized viewability system with percentage-based visibility detection
        7. ✅ Enhanced momentum scroll handling for precise video selection
        8. ✅ Increased drawDistance for smoother scrolling performance
        9. ✅ Intelligent visible video detection based on highest visibility percentage
        10. ✅ Dynamic FlashList component selection (AnimatedFlashList or Tabs.FlashList)
        11. ✅ Proper estimatedItemSize for optimal FlashList performance
        12. ✅ Memoized renderItem to prevent unnecessary re-renders
        
        Performance Features:
        - View recycling enabled (no key props on rendered components)
        - Optimized estimatedItemSize for better memory usage
        - Directional lock and reduced bouncing for video-focused UX
        - Intelligent viewability detection with percentage-based visibility
        - Reduced state updates via threshold-based range calculations
        - Fast viewability updates (50ms minimum time) for responsive snapping
        - Collapsible header integration with react-native-collapsible-tab-view
        - Simplified component structure to reduce render overhead
        
        Snapping Behavior:
        - All feeds: Consistent automatic snapping via pagingEnabled + snapToInterval
        - Center alignment ensures videos are properly centered across all feed types
        - Uniform user experience regardless of feed context
      */}
      <FlashListComponent
        ref={flashListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        
        // CRITICAL: Provide accurate estimatedItemSize for optimal performance
        estimatedItemSize={cardHeight}
        
        // FlashList v2 feature: Maintain visible content position for better video feed UX
        maintainVisibleContentPosition={{
          autoscrollToTopThreshold: cardHeight * 2,
        }}
        
        // FlashList optimizations for video performance
        drawDistance={cardHeight * PERFORMANCE_CONFIG.DRAW_DISTANCE_MULTIPLIER}
        removeClippedSubviews={false} // Critical: Disable for video to prevent pausing
        
        // Snapping configuration - FlashList inherits ScrollView props
        // Consistent snapping across all feeds for uniform UX
        pagingEnabled={true}
        snapToAlignment="center"
        snapToInterval={cardHeight}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
        
        // Event handlers - only use animated scroll when not using Tabs.FlashList
        onScroll={useAnimatedScroll && !ListComponent ? onScrollAnimated : undefined}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50, // Item must be 50% visible to be considered viewable
          minimumViewTime: 100, // Minimum time in ms that an item must be visible
        }}
        viewabilityConfigCallbackPairs={undefined} // Use single viewability config
        
        // Scrolling behavior optimized for video
        scrollEnabled={!state.isScrubbing}
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
              viewableAreaHeight={viewableAreaHeight}
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
              viewableAreaHeight={viewableAreaHeight}
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
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
            />
          )
        }
        
        // FlashList only supports padding and backgroundColor in contentContainerStyle
        contentContainerStyle={{
          backgroundColor: backgroundColor || Colors.black,
          paddingTop: headerComponent && !ListComponent ? overlayHeaderHeight : 0,
          paddingBottom: displayFeed.length === 0 ? 0 : viewportDimensions.bottomNavBarHeight,
        }}
      />

      {/* Feed debugger */}
      {state.isFeedDebugEnabled && (
        <FeedDebugger
          feedOption={feedOption}
          userDid={userDid}
          isVisible={true}
          scrollInfo={state.debugScrollInfo}
        />
      )}
      
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
      {/* Feed debugger */}
      {state.isFeedDebugEnabled && (
        <FeedDebugger
          feedOption={feedOption}
          userDid={userDid}
          isVisible={true}
          scrollInfo={state.debugScrollInfo}
        />
      )}
      
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
  absoluteHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  // Removed cellContainer styles since we're using FlashList's internal cell rendering
  debugOverlay: {
    position: 'absolute',
    top: 40,
    left: 10,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 12,
    borderRadius: 8,
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  debugText: {
    color: Colors.white,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
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