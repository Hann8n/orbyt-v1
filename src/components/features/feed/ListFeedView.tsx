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

// Create Reanimated version of FlashList with proper typing
const AnimatedFlashList = ReAnimated.createAnimatedComponent(FlashList);

import EmptyFeed from './EmptyFeed';
import { MemoizedVideoItem } from './VideoItem';
import WatchHistory from '../../../services/WatchHistory';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { useClearView } from '@stores/uiStore';
import { useHeaderScrollTracker } from '@stores/visibilityStore';
import FeedDebugger from '../../../utils/helpers/FeedDebuger';
import AccountManager from '../../../services/storage/AccountManager';
import { Colors } from '../../ui/UI';
import { preloadVideoData } from '../../../utils/helpers/video';

// FlashList optimized configuration
const PERFORMANCE_CONFIG = {
  DRAW_DISTANCE_MULTIPLIER: 3.0,
  CACHE_BUFFER: 4,
  PRELOAD_DISTANCE: 6,
  SCROLL_THROTTLE: 16,
  POSITION_SAVE_DELAY: 300,
  DEBUG_UPDATE_INTERVAL: 500,
  SNAP_THRESHOLD: 0.6,
  MOMENTUM_THRESHOLD: 50,
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
  ListComponent?: any; // Tabs.FlashList component
  useAnimatedScroll?: boolean;
}

// Optimized state management
type FeedState = {
  visibleVideo: string | null;
  visibleIndex: number;
  isScrubbing: boolean;
  scrollDirection: 'up' | 'down' | null;
  debugScrollInfo: { scrollY: number; scrollProgress: number; isNearEnd: boolean };
  isFeedDebugEnabled: boolean;
  appState: AppStateStatus;
};

type FeedAction = 
  | { type: 'SET_VISIBLE_VIDEO'; payload: { video: string | null; index: number } }
  | { type: 'SET_SCRUBBING'; payload: boolean }
  | { type: 'SET_SCROLL_DIRECTION'; payload: 'up' | 'down' | null }
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
    case 'SET_SCRUBBING':
      return { ...state, isScrubbing: action.payload };
    case 'SET_SCROLL_DIRECTION':
      return { ...state, scrollDirection: action.payload };
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
  isScrubbing: false,
  scrollDirection: null,
  debugScrollInfo: { scrollY: 0, scrollProgress: 0, isNearEnd: false },
  isFeedDebugEnabled: false,
  appState: 'active',
};

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
  isVisible = true,
  viewMode = 'list',
  onViewModeChange,
  isModal = false,
  onVerticalScroll,
  isRefreshing = false,
  isProfileLoading = false,
  onVisibleChange,
  onScrubbingChange,
  onScroll,
  forceError = false,
  ListComponent,
  useAnimatedScroll = true,
}) => {
  // Hooks
  const { isClearViewMode, toggleClearViewMode } = useClearView();
  const insets = useSafeAreaInsets();
  
  // State management
  const [state, dispatch] = useReducer(feedReducer, initialState);
  const [headerHeight, setHeaderHeight] = useState(0);
  
  // Device detection
  const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
  const isUsingCollapsibleHeader = useMemo(() => !!ListComponent, [ListComponent]);
  const isHeaderFeed = useMemo(() => (
    feedOption === 'profile' ||
    feedOption === 'likes' ||
    feedOption === 'reposts' ||
    feedOption.startsWith('at://')
  ), [feedOption]);

  // Refs
  const flashListRef = useRef<FlashListRef<FeedItem>>(null);
  const lastScrollY = useRef(0);
  const scrollYRef = useRef(0);
  const positionSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const isScrollingRef = useRef(false);
  
  // Shared values
  const scrollYShared = useSharedValue(0);

  // Viewport calculations
  const viewportDimensions = useMemo(() => {
    const { width, height } = Dimensions.get('window');
    const bottomNavBarHeight = getBottomNavBarHeight(insets);
    
    const viewportHeight = isSmallDevice 
      ? height 
      : height - bottomNavBarHeight - insets.top;
    
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
  const processedFeed = useMemo(() => {
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
    const base = processedFeed;
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
  }, [processedFeed, isLoading, isError, isFetchingNextPage, hasNextPage]);

  // Error handling
  const effectiveError = forceError ? new Error('Forced error for testing') : error;
  const effectiveIsError = forceError || isError;

  // Index calculation helper
  const calculateIndexFromOffset = useCallback((scrollY: number) => {
    if (listData.length === 0) return 0;
    
    const adjustedY = Math.max(0, scrollY - (headerComponent ? headerHeight : 0));
    const targetIndex = Math.min(
      Math.max(0, Math.round(adjustedY / cardHeight)),
      listData.length - 1
    );
    
    return targetIndex;
  }, [listData.length, headerHeight, headerComponent, cardHeight]);

  // Scroll handling
  const handleScrollEvent = useCallback((scrollY: number, contentHeight: number, layoutHeight: number) => {
    const now = Date.now();
    scrollYRef.current = scrollY;
    scrollYShared.value = scrollY;
    
    // Calculate current visible index
    const currentIndex = calculateIndexFromOffset(scrollY);
    const currentItem = listData[currentIndex];
    const currentUri = currentItem?.endCard ? null : currentItem?.post?.uri;
    
    // Update visible video if changed
    if (currentUri && (currentIndex !== state.visibleIndex || currentUri !== state.visibleVideo)) {
      dispatch({ 
        type: 'SET_VISIBLE_VIDEO', 
        payload: { video: currentUri, index: currentIndex }
      });
      onVisibleChange?.(currentIndex, currentUri);
    }

    // Track scroll direction
    const delta = scrollY - lastScrollY.current;
    if (Math.abs(delta) > 20) {
      const direction = delta > 0 ? 'down' : 'up';
      if (direction !== state.scrollDirection) {
        dispatch({ type: 'SET_SCROLL_DIRECTION', payload: direction });
      }
    }
    lastScrollY.current = scrollY;

    // Call external handlers
    onVerticalScroll?.(scrollY);
    onScroll?.({ nativeEvent: { 
      contentOffset: { y: scrollY }, 
      contentSize: { height: contentHeight }, 
      layoutMeasurement: { height: layoutHeight } 
    }});

    // Update debug info
    const progress = Math.min(Math.max(scrollY / Math.max(1, contentHeight - layoutHeight), 0), 1);
    const nearEnd = progress >= 0.9;
    
    dispatch({ 
      type: 'SET_DEBUG_SCROLL_INFO', 
      payload: { scrollY, scrollProgress: progress, isNearEnd: nearEnd }
    });
  }, [calculateIndexFromOffset, listData, state.visibleIndex, state.visibleVideo, state.scrollDirection, onVisibleChange, onVerticalScroll, onScroll]);

  // Native scroll handler
  const onScrollNative = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    handleScrollEvent(contentOffset.y, contentSize.height, layoutMeasurement.height);
  }, [handleScrollEvent]);

  // Animated scroll handler for collapsible headers
  const onScrollAnimated = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      const contentHeight = event.contentSize.height;
      const layoutHeight = event.layoutMeasurement.height;
      runOnJS(handleScrollEvent)(y, contentHeight, layoutHeight);
    },
  });

  // Momentum scroll end handler
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    isScrollingRef.current = false;
    
    // Save position with debounce
    if (positionSaveTimeout.current) {
      clearTimeout(positionSaveTimeout.current);
    }
    positionSaveTimeout.current = setTimeout(() => {
      onPositionChange?.(offsetY);
    }, PERFORMANCE_CONFIG.POSITION_SAVE_DELAY);

    dispatch({ type: 'SET_SCROLL_DIRECTION', payload: null });
  }, [onPositionChange]);

  const onScrollBeginDrag = useCallback(() => {
    isScrollingRef.current = true;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    isScrollingRef.current = false;
  }, []);

  // Callbacks
  const handleScrubbingChange = useCallback((isScrubbing: boolean) => {
    dispatch({ type: 'SET_SCRUBBING', payload: isScrubbing });
    onScrubbingChange?.(isScrubbing);
  }, [onScrubbingChange]);

  const handleVideoStatus = useCallback((uri: string, status: string) => {
    // Handle video status changes
  }, []);

  // Render item with proper memoization
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
    isVisible,
    secondaryColor,
    backgroundColor,
    feedOption,
    scrollYShared,
    handleVideoStatus,
    handleScrubbingChange,
    isModal,
  ]);

  // FlashList optimizations
  const getItemType = useCallback((item: FeedItem) => (item.endCard ? 'endCard' : 'video'), []);
  
  const keyExtractor = useCallback((item: FeedItem, index: number) => {
    return item.endCard ? 'end-card' : `${item.post.uri}_${index}`;
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
  }, [feed, viewMode, onViewModeChange]);

  // Watch history effect
  useEffect(() => {
    if (state.visibleVideo && feedOption === 'yourMix') {
      WatchHistory.addToWatchHistory(state.visibleVideo);
    }
  }, [state.visibleVideo, feedOption]);

  // App state handling
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      dispatch({ type: 'SET_APP_STATE', payload: nextAppState });
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  // Debug settings
  useEffect(() => {
    let mounted = true;
    
    const updateDebugSettings = async () => {
      try {
        const globalVal = (global as any)?.__ORBYT_FEED_DEBUG_OVERLAY__;
        const debugEnabled = typeof globalVal === 'boolean' ? globalVal : await AccountManager.getFeedDebugOverlayEnabled();
        
        if (mounted && debugEnabled !== state.isFeedDebugEnabled) {
          dispatch({ type: 'SET_DEBUG_ENABLED', payload: debugEnabled });
        }
      } catch {}
    };

    updateDebugSettings();
    const interval = setInterval(updateDebugSettings, 2000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [state.isFeedDebugEnabled]);

  // Initial position setup
  useEffect(() => {
    if (!flashListRef.current || listData.length === 0) return;

    let targetIndex = initialIndex ?? 0;
    if (initialUri) {
      const foundIndex = processedFeed.findIndex(item => item?.post?.uri === initialUri);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }
    
    targetIndex = Math.max(0, Math.min(targetIndex, processedFeed.length - 1));

    const targetUri = processedFeed[targetIndex]?.post?.uri;
    if (targetUri) {
      dispatch({ type: 'SET_VISIBLE_VIDEO', payload: { video: targetUri, index: targetIndex } });
    }

    // Use requestAnimationFrame for smoother initialization
    requestAnimationFrame(() => {
      flashListRef.current?.scrollToIndex({ 
        index: targetIndex, 
        animated: false,
        viewPosition: 0
      });
    });
  }, [initialIndex, initialUri, processedFeed, listData.length]);

  // Orientation change handling
  useEffect(() => {
    const handleOrientationChange = () => {
      setTimeout(() => {
        if (flashListRef.current && processedFeed.length > 0) {
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
  }, [processedFeed.length, state.visibleIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (positionSaveTimeout.current) {
        clearTimeout(positionSaveTimeout.current);
      }
    };
  }, []);

  // Grid view
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

  // FlashList component selection
  const FlashListComponent = ListComponent || (useAnimatedScroll ? AnimatedFlashList : FlashList);

  // Snap configuration
  const snapOffsets = useMemo(() => {
    if (!headerComponent || !headerHeight) return undefined;
    
    const offsets = [];
    for (let i = 0; i < listData.length; i++) {
      offsets.push(headerHeight + (i * cardHeight));
    }
    return offsets;
  }, [headerComponent, headerHeight, listData.length, cardHeight]);

  const emptyComponentHeight = Math.max(0, viewportDimensions.height - (ListComponent ? 280 : 0));

  return (
    <View style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]}>
      {/* Debug overlay */}
      {__DEV__ && (typeof window !== 'undefined' && (window as any).__LIST_FEED_DEBUG__ === true) && (
        <View style={styles.debugOverlay}>
          <Text style={styles.debugText}>scrollY: {Math.round(scrollYRef.current)}</Text>
          <Text style={styles.debugText}>visibleIndex: {state.visibleIndex}</Text>
          <Text style={styles.debugText}>visibleVideo: {state.visibleVideo?.slice(-8)}</Text>
          <Text style={styles.debugText}>cardHeight: {cardHeight}</Text>
          <Text style={styles.debugText}>headerHeight: {headerHeight}</Text>
          <Text style={styles.debugText}>listData.length: {listData.length}</Text>
          <Text style={styles.debugText}>collapsibleHeader: {String(isUsingCollapsibleHeader)}</Text>
          <Text style={styles.debugText}>isHeaderFeed: {String(isHeaderFeed)}</Text>
          <Text style={styles.debugText}>appState: {state.appState}</Text>
        </View>
      )}

      {/* FlashList with optimized configuration */}
      <FlashListComponent
        ref={flashListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        
        // Header component with layout tracking
        ListHeaderComponent={headerComponent ? (
          <View onLayout={(e) => {
            const height = e.nativeEvent.layout.height;
            if (height > 0 && height !== headerHeight) {
              setHeaderHeight(height);
            }
          }}>
            {headerComponent}
          </View>
        ) : null}
        
        // FlashList optimizations
        estimatedItemSize={cardHeight}
        drawDistance={cardHeight * PERFORMANCE_CONFIG.DRAW_DISTANCE_MULTIPLIER}
        removeClippedSubviews={false}
        
        // Snapping configuration
        pagingEnabled={!isUsingCollapsibleHeader}
        snapToAlignment={snapOffsets ? 'start' : 'center'}
        snapToInterval={snapOffsets ? undefined : cardHeight}
        snapToOffsets={snapOffsets}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
        
        // Scroll handlers
        onScroll={isUsingCollapsibleHeader ? onScrollAnimated : onScrollNative}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        
        // Scroll properties
        scrollEnabled={!state.isScrubbing && listData.length > 0}
        showsVerticalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled={true}
        
        // Empty state
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
        
        // Content container style
        contentContainerStyle={{
          backgroundColor: backgroundColor || Colors.black,
          paddingBottom: processedFeed.length === 0 ? 0 : viewportDimensions.bottomNavBarHeight,
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  debugOverlay: {
    position: 'absolute',
    top: 60,
    right: 10,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 8,
    borderRadius: 6,
    maxWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  debugText: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 14,
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