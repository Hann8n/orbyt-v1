declare let window: any;
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Animated,
  View,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Text,
  ScaledSize,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, SharedValue } from 'react-native-reanimated';
import EmptyFeed from './EmptyFeed';
import MemoizedVideoItem from './MemoizedVideoItem';
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import WatchHistory from '../../../services/WatchHistory';
import { extractVideoUrl } from '../../../utils/helpers/video';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import PerformanceMonitor from '../../../utils/helpers/performance';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
}

interface ListFeedViewProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  feedOption: 'yourMix' | 'following' | 'discover' | 'profile' | 'author' | 'likes' | 'reposts' | string;
  userDid?: string;
  onEndReached?: () => void; // Make optional
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
}

// Constants for video preloading - optimized for faster visibility
const PREPARE_BUFFER = 0; // Reduced from 1 for faster loading
const CACHE_BUFFER = 1; // Reduced from 2 for faster loading
const STREAMING_ENABLED = true;

// Pure function component for CellRenderer with performance optimization
const CellRenderer = React.memo(({ children, style }: { children: React.ReactNode; style?: any }) => {
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      {children}
    </View>
  );
});

const ListFeedView: React.FC<ListFeedViewProps> = ({
  feed,
  headerComponent,
  refreshControl,
  backgroundColor,
  secondaryColor,
  feedOption,
  userDid,
  onEndReached,
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
}) => {
  const insets = useSafeAreaInsets();
  
  // Clear feed when refreshing
  const displayFeed = isRefreshing ? [] : feed;

  // State for tracking video visibility
  const [visibleVideo, setVisibleVideo] = useState<string | null>(null);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [visibleRange, setVisibleRange] = useState<{ min: number; max: number }>({
    min: Number.MAX_VALUE,
    max: -1,
  });
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [isSnappedToTop, setIsSnappedToTop] = useState<boolean>(false);

  // Refs for scroll handling
  const flatListRef = useRef<Animated.FlatList>(null);
  const userScrolled = useRef<boolean>(false);
  const lastOffset = useRef(0);
  const currentScrollOffset = useRef<number>(0);
  const lastSavedPosition = useRef<number>(0);
  const positionSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollYShared = useSharedValue(0);

  // Define common dimension logic
  const isSmallDevice = isSmallScreen() || isTablet();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const viewableAreaHeight = Dimensions.get('window').height - insets.top - bottomNavBarHeight;
  const cardHeight = isSmallDevice ? Dimensions.get('window').height : getVideoCardHeight(insets);
  
  // Memoize expensive calculations to prevent recreation
  const memoizedCardHeight = useMemo(() => cardHeight, [cardHeight]);
  const memoizedFeedOption = useMemo(() => feedOption as 'yourMix' | 'following' | 'discover', [feedOption]);
  const memoizedIsVisible = useMemo(() => isVisible, [isVisible]);
  const memoizedScrollYShared = useMemo(() => scrollYShared, [scrollYShared]);
  const memoizedScrollDirection = useMemo(() => scrollDirection, [scrollDirection]);

  // Determine if this is a header feed (profile, channel, etc.)
  // Channel feeds (at:// URIs) should use header feed behavior only if they have a headerComponent
  const isHeaderFeed = (
    (feedOption === 'profile' ||
     feedOption === 'author' ||
     feedOption === 'likes' ||
     feedOption === 'reposts' ||
     feedOption.startsWith('at://'))
    && !!headerComponent
  );

  // Memoize video status handler to prevent recreation
  const handleVideoStatus = useCallback((uri: string, status: string) => {
    // Handle video status changes
  }, []);

  // Function to determine if a video should show its overlay
  const shouldShowOverlay = useCallback((index: number) => {
    if (!memoizedScrollDirection) {
      // If no scroll direction, only show overlay for current video
      return index === visibleIndex;
    }
    
    if (memoizedScrollDirection === 'down') {
      // Scrolling down: show overlays for videos ahead (higher indices)
      return index >= visibleIndex;
    } else {
      // Scrolling up: show overlays for videos ahead (lower indices)
      return index <= visibleIndex;
    }
  }, [memoizedScrollDirection, visibleIndex]);

  // Memoize viewable items changed handler - optimized for fast scrolling
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length === 0) return;

    // For fast scrolling, use the first visible item immediately
    const firstVisibleItem = viewableItems[0];
    const newVisibleVideo = firstVisibleItem?.item?.post?.uri || null;
    const newVisibleIndex = firstVisibleItem?.index || 0;
    
    // Update visible video immediately without complex checks
    setVisibleVideo(newVisibleVideo);
    setVisibleIndex(newVisibleIndex);

    // Notify parent if needed
    if (typeof onVisibleChange === 'function') {
      onVisibleChange(newVisibleIndex, newVisibleVideo);
    }

    // Update visible range for preloading - keep it simple for fast scrolling
    const minIndex = Math.min(...viewableItems.map(item => item.index));
    const maxIndex = Math.max(...viewableItems.map(item => item.index));
    
    setVisibleRange({ min: minIndex, max: maxIndex });
  }, [onVisibleChange]);

  // Memoize header layout handler
  const onHeaderLayout = useCallback((event: any) => {
    const { height } = event.nativeEvent.layout;
    setHeaderHeight(height);
  }, []);

  // Memoize scroll handler - optimized for fast scrolling
  const handleScroll = useCallback((event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollYShared.value = y;
    currentScrollOffset.current = y;
    
    // Track scroll direction
    const delta = y - lastOffset.current;
    if (Math.abs(delta) > 5) { // Threshold to avoid noise
      setScrollDirection(delta > 0 ? 'down' : 'up');
    }
    lastOffset.current = y;
    
    // Check if snapped to top for header feeds
    if (isHeaderFeed && headerHeight > 0) {
      const isAtTop = y <= 64; // Larger target area for snapped to top
      setIsSnappedToTop(isAtTop);
    }
    
    // Report vertical scroll position for feed bar visibility
    onVerticalScroll?.(y);
    
    // Simplified user scroll detection for fast scrolling
    if (!userScrolled.current) {
      userScrolled.current = true;
    }
  }, [scrollYShared, onVerticalScroll, isHeaderFeed, headerHeight]);

  // Memoize momentum scroll end handler
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    
    // Save position immediately when scrolling stops
    if (onPositionChange) {
      if (Math.abs(offsetY - lastSavedPosition.current) > 50) {
        onPositionChange(offsetY);
        lastSavedPosition.current = offsetY;
      }
    }
    
    lastOffset.current = offsetY;
    currentScrollOffset.current = offsetY;
    
    // Reset scroll direction when scrolling stops
    setScrollDirection(null);
  }, [onPositionChange]);

  /**
   * Optimized renderItem with minimal dependencies and memoization
   */
  const renderItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    const startTime = PerformanceMonitor.startTimer();
    
    const isActive = item.post.uri === visibleVideo;
    const shouldPreload = index >= visibleRange.min - CACHE_BUFFER && index <= visibleRange.max + CACHE_BUFFER;
    const shouldShowVideoOverlay = shouldShowOverlay(index);
    // Fix: When isSnappedToTop is true, no video should be visible
    const isItemVisible = !isSnappedToTop && (index === visibleIndex) && memoizedIsVisible;
    
    const result = (
      <MemoizedVideoItem
        key={`${item.post.uri}-${index}`}
        post={item.post}
        isPlaying={isActive && isItemVisible}
        handleVideoStatus={handleVideoStatus}
        height={memoizedCardHeight}
        shouldPreload={shouldPreload}
        feedOption={memoizedFeedOption}
        scrollY={memoizedScrollYShared}
        isVisible={isItemVisible}
        moderationDecision={item.moderationDecision}
        isModal={isModal}
      />
    );
    
    // Track performance
    PerformanceMonitor.endTimer(startTime, 1, feedOption);
    
    return result;
  }, [
    visibleVideo, 
    memoizedCardHeight, 
    visibleRange.min, 
    visibleRange.max, 
    memoizedFeedOption, 
    memoizedScrollYShared, 
    memoizedIsVisible, 
    handleVideoStatus,
    shouldShowOverlay,
    isHeaderFeed,
    isSnappedToTop,
    visibleIndex,
    isModal
  ]);

  /**
   * Global video preloading: prioritize the next N videos after the visible one
   */
  useEffect(() => {
    if (feed.length === 0 || visibleIndex < 0 || visibleIndex >= feed.length) return;
    // Build a list of all video URIs in order
    const allUris = feed.map(item => item.post.uri);
    const currentUri = feed[visibleIndex]?.post?.uri;
    if (currentUri) {
      VideoPreloadManager.prioritizeNextVideos(currentUri, allUris, 3);
    }
  }, [feed, visibleIndex]);

  /**
   * Watch-history logic
   */
  useEffect(() => {
    if (visibleVideo && feedOption === 'yourMix') {
      WatchHistory.addToWatchHistory(visibleVideo);
    }
  }, [visibleVideo, feedOption]);

  // Compute snap offsets only when dependencies change to avoid recalculating on every render
  const computedSnapToOffsets = useMemo(() => {
    if (isHeaderFeed && headerHeight <= 0) return undefined;
    if (feed.length === 0) return undefined;
    
    // Move offset calculations to background if this becomes heavy
    try {
      if (isHeaderFeed) {
        if (feedOption === 'author') {
          // For author pages, calculate offsets that center each card in the viewport
          const centerOffset = (Dimensions.get('window').height - memoizedCardHeight) / 2 - insets.top;
          return feed.map((_, i) => Math.max(headerHeight, headerHeight + (i * memoizedCardHeight) - centerOffset));
        }
        
        // Original behavior for other profile pages and custom feeds
        return feed.map((_, i) => Math.max(headerHeight, headerHeight + i * memoizedCardHeight));
      }
      
      // For regular feeds, use snapToInterval instead of snapToOffsets
      return undefined;
    } catch (error) {
      console.warn('Failed to calculate snap offsets:', error);
      return undefined;
    }
  }, [headerHeight, memoizedCardHeight, feed.length, feedOption, insets.top, isHeaderFeed]);

  // Memoized getItemLayout function to prevent recreation on every render
  const getItemLayout = useCallback((_: any, index: number) => {
    try {
      const safeIndex = Math.max(0, index || 0);
      
      // For header feeds, adjust the layout to account for header height
      if (isHeaderFeed && headerHeight > 0) {
        if (feedOption === 'author') {
          // For author pages, adjust the layout to account for card centering
          const centerOffset = (Dimensions.get('window').height - memoizedCardHeight) / 2 - insets.top;
          return {
            length: memoizedCardHeight,
            offset: Math.max(headerHeight, headerHeight + (memoizedCardHeight * safeIndex) - centerOffset),
            index: safeIndex,
          };
        }
        
        // Original behavior for other header page types
        return {
          length: memoizedCardHeight,
          offset: Math.max(headerHeight, headerHeight + memoizedCardHeight * safeIndex),
          index: safeIndex,
        };
      }
      
      // For modals, each item takes full screen height
      if (isModal) {
        return {
          length: memoizedCardHeight,
          offset: memoizedCardHeight * safeIndex,
          index: safeIndex,
        };
      }
      
      // Regular feed behavior
      return {
        length: memoizedCardHeight,
        offset: memoizedCardHeight * safeIndex,
        index: safeIndex,
      };
    } catch (error) {
      console.warn('Error calculating item layout:', error);
      return {
        length: memoizedCardHeight,
        offset: memoizedCardHeight * (index || 0),
        index: index || 0,
      };
    }
  }, [isHeaderFeed, headerHeight, feedOption, memoizedCardHeight, insets.top, isModal]);

  // Handle grid item press to navigate to the selected video
  const handleGridItemPress = useCallback((index: number) => {
    if (viewMode === 'grid' && onViewModeChange && index >= 0 && index < feed.length) {
      try {
        // First, switch to list view
        onViewModeChange('list');
        
        // Then scroll to the item in list view after a short delay
        setTimeout(() => {
          if (flatListRef.current) {
            try {
              const targetOffset = isHeaderFeed ? 
                headerHeight + (memoizedCardHeight * index) : 
                memoizedCardHeight * index;
              
              // Scroll to the target position
              flatListRef.current.scrollToOffset({ offset: targetOffset, animated: true });
              
              // Set this video as the visible one after scrolling completes
              setTimeout(() => {
                const targetVideo = feed[index]?.post?.uri;
                if (targetVideo) {
                  setVisibleVideo(targetVideo);
                  setVisibleIndex(index);
                }
              }, 500);
              
            } catch (error) {
              console.warn('Error scrolling to grid item:', error);
            }
          }
        }, 100);
      } catch (error) {
        console.warn('Error handling grid item press:', error);
      }
    }
  }, [feed.length, memoizedCardHeight, headerHeight, viewMode, onViewModeChange, isHeaderFeed]);

  // Find shouldDisablePlayback for the visible video
  let debugShouldDisablePlayback = false;
  if (feed[visibleIndex]) {
    debugShouldDisablePlayback = (isHeaderFeed && isSnappedToTop) || (feed[visibleIndex].moderationDecision?.blur === true);
  }

  // On mount and whenever isHeaderFeed or headerHeight changes, check if the initial scroll position is at the top (currentScrollOffset.current <= 24). If so, set isSnappedToTop to true. This ensures that the snapped-to-top state is correct on first render, preventing the first video from playing when the header is visible.
  useEffect(() => {
    // On mount or when header changes, if the initial scroll position is at the top, set isSnappedToTop to true
    if (isHeaderFeed && headerHeight > 0 && currentScrollOffset.current <= 24) {
      setIsSnappedToTop(true);
    }
  }, [isHeaderFeed, headerHeight]);

  // Set initial visible index and video on mount (for modal)
  useEffect(() => {
    let targetIndex = initialIndex;
    if (isModal && initialUri && Array.isArray(displayFeed)) {
      const foundIndex = displayFeed.findIndex((item: any) => item?.post?.uri === initialUri);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }
    if (isModal && typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex < displayFeed.length) {
      setVisibleIndex(targetIndex);
      setVisibleVideo(displayFeed[targetIndex]?.post?.uri || null);
      // Scroll to the correct index
      if (flatListRef.current) {
        flatListRef.current.scrollToIndex({ index: targetIndex, animated: false });
      }
    }
  }, [isModal, initialIndex, initialUri, displayFeed.length]);

  // Listen for orientation/screen size changes and snap to visibleIndex
  useEffect(() => {
    const onChange = ({ window }: { window: ScaledSize }) => {
      // Wait for layout to update, then scroll to visibleIndex
      setTimeout(() => {
        if (flatListRef.current && displayFeed.length > 0) {
          flatListRef.current.scrollToIndex({
            index: visibleIndex,
            animated: false,
            viewPosition: 0,
          });
        }
      }, 50);
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => { sub?.remove(); };
  }, [visibleIndex, displayFeed.length]);

  // Render grid view if viewMode is 'grid'
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
        onEndReached={onEndReached}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        onGridItemPress={undefined}
        isError={isError}
        error={error}
        onRetry={onRetry}
      />
    );
  }

  // Render list view (default)
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor || '#000' }}>
      {(typeof window !== 'undefined' && (window as any).__LIST_FEED_DEBUG__ === true) && (
        <View style={{
          position: 'absolute',
          top: 40,
          left: 10,
          zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: 10,
          borderRadius: 8,
          maxWidth: 320,
        }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>scrollY: {Math.round(currentScrollOffset.current)}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>isHeaderFeed: {String(isHeaderFeed)}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>headerHeight: {headerHeight}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>isSnappedToTop: {String(isSnappedToTop)}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>visibleIndex: {visibleIndex}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>visibleVideo: {visibleVideo}</Text>
          {/* Improved bug warning: Only show if isSnappedToTop is true AND the logic would render any video as visible */}
          {isSnappedToTop && (
            <Text style={{ color: 'red', fontSize: 12, fontWeight: 'bold' }}>
              {(() => {
                // Simulate the logic used in renderItem for all indices
                let anyVisible = false;
                for (let i = 0; i < feed.length; i++) {
                  const isItemVisible = !isSnappedToTop && (i === visibleIndex) && memoizedIsVisible;
                  if (isItemVisible) {
                    anyVisible = true;
                    break;
                  }
                }
                return anyVisible ? 'BUG: isSnappedToTop && isVisible === true' : '';
              })()}
            </Text>
          )}
          <Text style={{ color: '#fff', fontSize: 12 }}>shouldDisablePlayback: {String(debugShouldDisablePlayback)}</Text>
        </View>
      )}
      <Animated.FlatList
        ref={flatListRef}
        key={`${feedOption}-${userDid || 'default'}-${isRefreshing ? 'refreshing' : 'normal'}`}
        data={displayFeed}
        renderItem={renderItem}
        keyExtractor={(item) => item.post.uri}
        pagingEnabled={!isHeaderFeed}
        snapToInterval={isHeaderFeed ? undefined : memoizedCardHeight}
        snapToOffsets={computedSnapToOffsets}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.85}
        removeClippedSubviews={true}
        windowSize={2} // Reduced for faster scrolling
        maxToRenderPerBatch={1} // Reduced for faster scrolling
        updateCellsBatchingPeriod={16} // Reduced from 50 for faster updates
        initialNumToRender={1}
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: null,
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true, listener: handleScroll }
        )}
        directionalLockEnabled={true}
        alwaysBounceVertical={false}
        scrollEnabled={true}
        nestedScrollEnabled={true}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={1} // Reduced for maximum responsiveness during fast scrolling
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        CellRendererComponent={CellRenderer}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50, // Require 50% of video to be visible
          minimumViewTime: 0, // No delay for instant detection
        }}
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centeredLoadingContainer}>
              <ActivityIndicator size="large" color={secondaryColor || "#FFFFFF"} />
            </View>
          ) : isError ? (
            <EmptyFeed 
              type="error"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
              feedKey={`${feedOption}-${userDid || 'default'}`}
              onRetry={onRetry}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
            />
          ) : (
            <EmptyFeed 
              type={feedOption === 'following' ? 'no-following' : 'no-videos'}
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
              feedKey={`${feedOption}-${userDid || 'default'}`}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
            />
          )
        }
        ListHeaderComponent={
          headerComponent ? (
            <View 
              onLayout={isHeaderFeed ? onHeaderLayout : undefined}
              style={isSmallDevice ? { paddingTop: insets.top } : undefined}
            >
              {headerComponent}
            </View>
          ) : null
        }
        refreshControl={refreshControl as any}
        style={[
          styles.flatList,
          {
            paddingTop: isSmallDevice ? 0 : insets.top,
            backgroundColor: backgroundColor || '#000',
          },
        ]}
        contentContainerStyle={[
          styles.contentContainer,
          displayFeed.length === 0 && styles.emptyContentContainer,
          { paddingBottom: bottomNavBarHeight }, // Add safe area for nav bar
        ]}
        ListFooterComponent={
          !isLoading && !isError && !isFetchingNextPage && !hasNextPage && displayFeed.length > 0 ? (
            <EmptyFeed
              type="end"
              secondaryColor={secondaryColor}
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
              feedKey={`end-of-feed-${feedOption}-${userDid || 'default'}`}
              viewableAreaHeight={120}
              feedOption={feedOption}
            />
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flatList: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    flexGrow: 1,
    padding: 0,
    margin: 0,
  },
  emptyContentContainer: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: Dimensions.get('window').height,
  },
  feedLoadingContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ListFeedView; 