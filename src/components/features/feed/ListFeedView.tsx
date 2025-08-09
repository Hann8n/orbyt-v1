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
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCollapsibleStyle } from 'react-native-collapsible-tab-view';
import { useSharedValue, SharedValue, runOnJS } from 'react-native-reanimated';
import EmptyFeed from './EmptyFeed';
import { MemoizedVideoItem } from './VideoItem';

import WatchHistory from '../../../services/WatchHistory';
import { extractVideoUrl } from '../../../utils/helpers/video';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';

import Icon from '../../ui/Icon';
import { useClearView } from '../../../services/ClearViewContext';
import { updateHeaderVisibility, generateFeedKey } from '../../../hooks/useHeaderVisibility';
import FeedDebugger from '../../../utils/helpers/FeedDebuger';
import AccountManager from '../../../services/storage/AccountManager';

// Header visibility system for medium/large screens

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
}

interface ListFeedViewProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  headerMode?: 'embedded' | 'external';
  externalHeaderHeight?: number;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  feedOption: 'yourMix' | 'following' | 'discover' | 'profile' | 'likes' | 'reposts' | string;
  userDid?: string;
  onLoadMore: () => void; // Simplified callback for loading more content
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
  onScroll?: (event: { nativeEvent: any }) => void; // Infinite scroll handler
  forceError?: boolean; // Add debug flag to force error responses
}

// Constants for video preloading - balanced for performance and preloading
const PREPARE_BUFFER = 1; // Keep some buffer for smooth scrolling
const CACHE_BUFFER = 2; // Sufficient buffer for effective preloading
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
  headerMode = 'embedded',
  externalHeaderHeight,
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
  forceError = false, // Add debug flag to force error responses
}) => {
  const { isClearViewMode, toggleClearViewMode, setClearViewMode } = useClearView();
  const isSmallDevice = isSmallScreen() || isTablet();
  const insets = useSafeAreaInsets();
  const {
    contentContainerStyle: collapsibleContentContainerStyle,
    progressViewOffset: collapsibleProgressViewOffset,
    style: collapsibleStyle,
  } = useCollapsibleStyle();
  const [isFeedDebugEnabled, setIsFeedDebugEnabled] = useState<boolean>(false);
  const effectiveRefreshControl = useMemo(() => {
    if (!refreshControl) return undefined;
    try {
      return React.cloneElement(refreshControl as any, {
        progressViewOffset: collapsibleProgressViewOffset,
      });
    } catch {
      return refreshControl;
    }
  }, [refreshControl, collapsibleProgressViewOffset]);
  
  // Clear feed when refreshing and ensure no duplicates
  const displayFeed = useMemo(() => {
    if (isRefreshing) return [];
    
    // Final deduplication to ensure no duplicates are rendered
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

  // Force error state if forceError flag is enabled
  const forcedError = forceError ? new Error('Forced error for testing purposes') : null;
  const forcedIsError = forceError || isError;
  const forcedErrorState = forceError ? forcedError : error;

  // Lock vertical scroll while scrubbing
  const [isScrubbing, _setIsScrubbing] = useState(false);
  const setIsScrubbing = useCallback((val: boolean) => _setIsScrubbing(val), []);

  // Propagate scrubbing state up if handler provided
  useEffect(() => {
    if (onScrubbingChange) onScrubbingChange(isScrubbing);
  }, [isScrubbing, onScrubbingChange]);

  // State for tracking video visibility - optimized with refs to reduce re-renders
  const [visibleVideo, setVisibleVideo] = useState<string | null>(null);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [visibleRange, setVisibleRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: 2, // Initialize with reasonable defaults for preloading
  });
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [isSnappedToTop, setIsSnappedToTop] = useState<boolean>(false);

  // Refs for scroll handling - optimized to reduce state updates
  const flatListRef = useRef<Animated.FlatList>(null);
  const userScrolled = useRef<boolean>(false);
  const lastOffset = useRef(0);
  const currentScrollOffset = useRef<number>(0);
  const lastSavedPosition = useRef<number>(0);
  const positionSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollYShared = useSharedValue(0);
  const lastScrollInfoRef = useRef({ scrollY: 0, progress: 0, nearEnd: false });
  const [debugScrollInfo, setDebugScrollInfo] = useState<{ scrollY: number; scrollProgress: number; isNearEnd: boolean }>({ scrollY: 0, scrollProgress: 0, isNearEnd: false });
  
  // Performance optimization: Use refs to avoid unnecessary re-renders
  const visibleVideoRef = useRef<string | null>(null);
  const visibleIndexRef = useRef<number>(0);
  const isSnappedToTopRef = useRef<boolean>(false);

  // Use infinite scroll handler from props (provided by parent FeedRenderer)
  const infiniteScrollHandler = onScroll || (() => {});

  // Define common dimension logic
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
    feedOption === 'profile' ||
    feedOption === 'likes' ||
    feedOption === 'reposts' ||
    feedOption.startsWith('at://')
  );

  // Disable clear view mode when snapped to top on header feeds
  useEffect(() => {
    if (isHeaderFeed && isSnappedToTop && isClearViewMode) {
      setClearViewMode(false);
    }
  }, [isHeaderFeed, isSnappedToTop, isClearViewMode, setClearViewMode]);

  // Memoize video status handler to prevent recreation
  const handleVideoStatus = useCallback((uri: string, status: string) => {
    // Handle video status changes - optimized to avoid blocking scroll
    if (status === 'ready' && uri === visibleVideoRef.current) {
      // Only update if this is the currently visible video
      // This prevents unnecessary re-renders during scroll
    }
  }, []);

  // Function to determine if a video should show its overlay - optimized
  const shouldShowOverlay = useCallback((index: number) => {
    if (!memoizedScrollDirection) {
      // If no scroll direction, only show overlay for current video
      return index === visibleIndexRef.current;
    }
    
    if (memoizedScrollDirection === 'down') {
      // Scrolling down: show overlays for videos ahead (higher indices)
      return index >= visibleIndexRef.current;
    } else {
      // Scrolling up: show overlays for videos ahead (lower indices)
      return index <= visibleIndexRef.current;
    }
  }, [memoizedScrollDirection]);

  // Optimized viewable items changed handler - debounced to reduce frequency
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length === 0) return;

    // For fast scrolling, use the first visible item immediately
    const firstVisibleItem = viewableItems[0];
    const newVisibleVideo = firstVisibleItem?.item?.post?.uri || null;
    const newVisibleIndex = firstVisibleItem?.index || 0;
    
    // Only update if values actually changed to prevent unnecessary re-renders
    if (newVisibleVideo !== visibleVideoRef.current || newVisibleIndex !== visibleIndexRef.current) {
      visibleVideoRef.current = newVisibleVideo;
      visibleIndexRef.current = newVisibleIndex;
      
      // Batch state updates to reduce re-renders
      setVisibleVideo(newVisibleVideo);
      setVisibleIndex(newVisibleIndex);

      // Notify parent if needed
      if (typeof onVisibleChange === 'function') {
        onVisibleChange(newVisibleIndex, newVisibleVideo);
      }
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
    
    // Report header height for header visibility tracking
    if (isHeaderFeed) {
      // Use consistent feed key format based on feed type
      let feedKey: string;
      if (feedOption.startsWith('at://')) {
        // For channel feeds, use the same format as ChannelScreen
        feedKey = `channel-${feedOption}`;
      } else {
        // For other feeds, use the standard format
        feedKey = generateFeedKey(feedOption, userDid);
      }
      updateHeaderVisibility(feedKey, { headerHeight: height });
    }
  }, [isHeaderFeed, feedOption, userDid]);

  // When using external header, propagate its measured height to the header visibility system
  useEffect(() => {
    if (headerMode === 'external' && typeof externalHeaderHeight === 'number' && isHeaderFeed) {
      let feedKey: string;
      if (feedOption.startsWith('at://')) {
        feedKey = `channel-${feedOption}`;
      } else {
        feedKey = generateFeedKey(feedOption, userDid);
      }
      updateHeaderVisibility(feedKey, { headerHeight: externalHeaderHeight });
    }
  }, [headerMode, externalHeaderHeight, isHeaderFeed, feedOption, userDid]);

  // Optimized scroll handler - debounced and batched
  const handleScroll = useCallback((event: any) => {
    // Performance monitoring removed for simplification
    
    // Call infinite scroll handler first for loading more content
    infiniteScrollHandler(event);
    
    const y = event.nativeEvent.contentOffset.y;
    scrollYShared.value = y;
    currentScrollOffset.current = y;
    
    // Update debug scroll info (throttled)
    try {
      const { contentSize, layoutMeasurement } = event.nativeEvent;
      const contentHeight = contentSize?.height || 0;
      const screenHeight = layoutMeasurement?.height || 1;
      const maxScrollY = Math.max(1, contentHeight - screenHeight);
      const progress = Math.min(Math.max(y / maxScrollY, 0), 1);
      const nearEnd = progress >= 0.9;
      const last = lastScrollInfoRef.current;
      if (Math.abs(last.scrollY - y) > 50 || Math.abs(last.progress - progress) > 0.05 || last.nearEnd !== nearEnd) {
        lastScrollInfoRef.current = { scrollY: y, progress, nearEnd } as any;
        setDebugScrollInfo({ scrollY: y, scrollProgress: progress, isNearEnd: nearEnd });
      }
    } catch {}
    
    // Track scroll direction with reduced frequency
    const delta = y - lastOffset.current;
    if (Math.abs(delta) > 10) { // Increased threshold to reduce noise
      const newDirection = delta > 0 ? 'down' : 'up';
      if (newDirection !== scrollDirection) {
        setScrollDirection(newDirection);
      }
    }
    lastOffset.current = y;
    
    // Check if snapped to top for header feeds - optimized
    if (isHeaderFeed && headerHeight > 0) {
      const threshold = Math.max(64, headerHeight - insets.top);
      const isAtTop = y <= threshold;
      if (isAtTop !== isSnappedToTopRef.current) {
        isSnappedToTopRef.current = isAtTop;
        setIsSnappedToTop(isAtTop);
        
        // Report header visibility state
        let feedKey: string;
        if (feedOption.startsWith('at://')) {
          // For channel feeds, use the same format as ChannelScreen
          feedKey = `channel-${feedOption}`;
        } else {
          // For other feeds, use the standard format
          feedKey = generateFeedKey(feedOption, userDid);
        }
        updateHeaderVisibility(feedKey, { 
          isSnappedToTop: isAtTop,
          scrollY: y,
          isShadowVisible: !isAtTop
        });
      }
    }
    
    // Report vertical scroll position for feed bar visibility
    onVerticalScroll?.(y);
    
    // Report scroll position for header visibility
    if (isHeaderFeed) {
      let feedKey: string;
      if (feedOption.startsWith('at://')) {
        // For channel feeds, use the same format as ChannelScreen
        feedKey = `channel-${feedOption}`;
      } else {
        // For other feeds, use the standard format
        feedKey = generateFeedKey(feedOption, userDid);
      }
      updateHeaderVisibility(feedKey, { scrollY: y });
    }
    
    // Simplified user scroll detection for fast scrolling
    if (!userScrolled.current) {
      userScrolled.current = true;
    }
    
    // Performance monitoring removed for simplification
  }, [infiniteScrollHandler, scrollYShared, onVerticalScroll, isHeaderFeed, headerHeight, scrollDirection]);

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

  // Debug: poll the toggle value occasionally to reflect changes from Settings without remounts
  useEffect(() => {
    let mounted = true;
    const apply = async () => {
      try {
        const globalVal = (global as any)?.__ORBYT_FEED_DEBUG_OVERLAY__;
        if (typeof globalVal === 'boolean') {
          if (mounted) setIsFeedDebugEnabled(globalVal);
        } else {
          const stored = await AccountManager.getFeedDebugOverlayEnabled();
          if (mounted) setIsFeedDebugEnabled(stored);
        }
      } catch {}
    };
    apply();
    const id = setInterval(apply, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /**
   * Optimized renderItem with minimal dependencies and memoization
   */
  const renderItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    // Performance monitoring removed for simplification
    
    const isActive = item.post.uri === visibleVideoRef.current;
    const shouldPreload = index >= visibleRange.min - CACHE_BUFFER && index <= visibleRange.max + CACHE_BUFFER;
    const shouldShowVideoOverlay = shouldShowOverlay(index);
    // Fix: When isSnappedToTop is true, no video should be visible
    const isItemVisible = !isSnappedToTopRef.current && (index === visibleIndexRef.current) && memoizedIsVisible;
    
    const result = (
      <MemoizedVideoItem
        key={`${item.post.uri}-${index}`}
        post={item.post}
        feedItem={item}
        isPlaying={isActive && isItemVisible}
        handleVideoStatus={handleVideoStatus}
        height={memoizedCardHeight}
        shouldPreload={shouldPreload}
        scrollY={memoizedScrollYShared}
        feedOption={memoizedFeedOption}
        isVisible={isItemVisible}
        moderationDecision={item.moderationDecision}
        isModal={isModal}
        onScrubbingChange={setIsScrubbing}
      />
    );
    
    // Track performance with video visibility info
    // Performance monitoring removed for simplification
    
    return result;
  }, [
    memoizedCardHeight, 
    visibleRange.min, 
    visibleRange.max, 
    memoizedFeedOption, 
    memoizedScrollYShared, 
    memoizedIsVisible, 
    handleVideoStatus,
    shouldShowOverlay,
    isModal,
    setIsScrubbing
  ]);



  /**
   * Watch-history logic
   */
  useEffect(() => {
    if (visibleVideoRef.current && feedOption === 'yourMix') {
      WatchHistory.addToWatchHistory(visibleVideoRef.current);
    }
  }, [visibleVideoRef.current, feedOption]);

  // Compute snap offsets only when dependencies change to avoid recalculating on every render
  const computedSnapToOffsets = useMemo(() => {
    if (isHeaderFeed && headerHeight <= 0) return undefined;
    if (feed.length === 0) return undefined;
    
    // Move offset calculations to background if this becomes heavy
    try {
      if (isHeaderFeed) {
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
                  visibleVideoRef.current = targetVideo;
                  visibleIndexRef.current = index;
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
  if (feed[visibleIndexRef.current]) {
    debugShouldDisablePlayback = (isHeaderFeed && isSnappedToTopRef.current) || (feed[visibleIndexRef.current].moderationDecision?.blur === true);
  }

  // On mount and whenever isHeaderFeed or headerHeight changes, check if the initial scroll position is at the top. If so, set isSnappedToTop to true. This ensures that the snapped-to-top state is correct on first render, preventing the first video from playing when the header is visible.
  useEffect(() => {
    // On mount or when header changes, if the initial scroll position is at the top, set isSnappedToTop to true
    if (isHeaderFeed && headerHeight > 0) {
      const threshold = Math.max(64, headerHeight - insets.top);
      if (currentScrollOffset.current <= threshold) {
        isSnappedToTopRef.current = true;
        setIsSnappedToTop(true);
        
        // Report initial header visibility state
        let feedKey: string;
        if (feedOption.startsWith('at://')) {
          // For channel feeds, use the same format as ChannelScreen
          feedKey = `channel-${feedOption}`;
        } else {
          // For other feeds, use the standard format
          feedKey = generateFeedKey(feedOption, userDid);
        }
        updateHeaderVisibility(feedKey, { 
          isSnappedToTop: true,
          isShadowVisible: false
        });
      }
    }
  }, [isHeaderFeed, headerHeight, insets.top, feedOption, userDid]);

  // Reset header visibility when feed changes to ensure header is visible on feed switch
  useEffect(() => {
    if (isHeaderFeed) {
      isSnappedToTopRef.current = true;
      setIsSnappedToTop(true);
      // Report that header should be visible
      let feedKey: string;
      if (feedOption.startsWith('at://')) {
        // For channel feeds, use the same format as ChannelScreen
        feedKey = `channel-${feedOption}`;
      } else {
        // For other feeds, use the standard format
        feedKey = generateFeedKey(feedOption, userDid);
      }
      updateHeaderVisibility(feedKey, { 
        isSnappedToTop: true,
        isShadowVisible: false
      });
    }
  }, [feedOption, userDid, isHeaderFeed]); // Reset when feed option changes

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
      visibleIndexRef.current = targetIndex;
      visibleVideoRef.current = displayFeed[targetIndex]?.post?.uri || null;
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
            index: visibleIndexRef.current,
            animated: false,
            viewPosition: 0,
          });
        }
      }, 50);
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => { sub?.remove(); };
  }, [displayFeed.length]);

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
        onLoadMore={onLoadMore}
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
          <Text style={{ color: '#fff', fontSize: 12 }}>isSnappedToTop: {String(isSnappedToTopRef.current)}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>visibleIndex: {visibleIndexRef.current}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>visibleVideo: {visibleVideoRef.current}</Text>
          {/* Improved bug warning: Only show if isSnappedToTop is true AND the logic would render any video as visible */}
          {isSnappedToTopRef.current && (
            <Text style={{ color: 'red', fontSize: 12, fontWeight: 'bold' }}>
              {(() => {
                // Simulate the logic used in renderItem for all indices
                let anyVisible = false;
                for (let i = 0; i < feed.length; i++) {
                  const isItemVisible = !isSnappedToTopRef.current && (i === visibleIndexRef.current) && memoizedIsVisible;
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
          <Text style={{ color: '#fff', fontSize: 12 }}>forceError: {String(forceError)}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>forcedIsError: {String(forcedIsError)}</Text>
        </View>
      )}
      <Animated.FlatList
        ref={flatListRef}
        key={`${feedOption}-${userDid || 'default'}`}
        data={displayFeed}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.post.uri}_${item.post.cid}_${index}`}
        pagingEnabled={!isHeaderFeed}
        snapToInterval={isHeaderFeed ? undefined : memoizedCardHeight}
        snapToOffsets={computedSnapToOffsets}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.85}
        removeClippedSubviews={true} // Enable for better memory management
        windowSize={5} // Optimal window size for video recycling
        maxToRenderPerBatch={2} // Conservative batch size to prevent jank
        updateCellsBatchingPeriod={50} // Standard React Native default
        initialNumToRender={2} // Minimal initial render for faster load
        showsVerticalScrollIndicator={false}
        // Removing maintainVisibleContentPosition to avoid initial mount offsets with headers
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true, listener: handleScroll }
        )}
        directionalLockEnabled={true}
        alwaysBounceVertical={false}
        scrollEnabled={!isScrubbing}
        nestedScrollEnabled={true}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={1} // Reduced for maximum responsiveness during fast scrolling

        CellRendererComponent={CellRenderer}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50, // Require 50% of video to be visible
          minimumViewTime: 0, // No delay for instant detection
        }}
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          // Force suggested accounts for timeline feed testing
          isLoading ? (
            <View style={styles.centeredLoadingContainer}>
              <ActivityIndicator size="large" color={secondaryColor || "#FFFFFF"} />
            </View>
          ) : forcedIsError ? ( // Use forced error state
            <EmptyFeed 
              type="error"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
              feedKey={`${feedOption}-${userDid || 'default'}`}
              onRetry={onRetry}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
              headerHeight={isHeaderFeed ? headerHeight : 0}
            />
          ) : feedOption === 'following' ? (
            // Force suggested accounts for timeline feed
            <EmptyFeed 
              type="no-following"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
              feedKey={`${feedOption}-${userDid || 'default'}`}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
              headerHeight={isHeaderFeed ? headerHeight : 0}
            />
          ) : (
            <EmptyFeed 
              type="no-videos"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
              feedKey={`${feedOption}-${userDid || 'default'}`}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
              headerHeight={isHeaderFeed ? headerHeight : 0}
            />
          )
        }
        ListHeaderComponent={
          headerMode === 'embedded' && headerComponent ? (
            <View 
              onLayout={isHeaderFeed ? onHeaderLayout : undefined}
              style={isSmallDevice ? { paddingTop: insets.top } : undefined}
            >
              {headerComponent}
            </View>
          ) : headerMode === 'external' && typeof externalHeaderHeight === 'number' ? (
            <View style={{ height: Math.max(0, externalHeaderHeight - (isSmallDevice ? insets.top : 0)) }} />
          ) : null
        }
        refreshControl={effectiveRefreshControl as any}
        style={[
          styles.flatList,
          {
            paddingTop: isSmallDevice ? 0 : insets.top,
            backgroundColor: backgroundColor || '#000',
          },
          collapsibleStyle,
        ]}
        contentContainerStyle={[
          styles.contentContainer,
          displayFeed.length === 0 && styles.emptyContentContainer,
          displayFeed.length === 0 ? { flex: 1, paddingBottom: 0 } : { paddingBottom: bottomNavBarHeight }, // Remove padding when empty to allow full height
          collapsibleContentContainerStyle,
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
              headerHeight={isHeaderFeed ? headerHeight : 0}
            />
          ) : null
        }
      />
      {isFeedDebugEnabled && (
        <FeedDebugger
          feedOption={feedOption}
          userDid={userDid}
          isVisible={true}
          scrollInfo={{
            scrollY: debugScrollInfo.scrollY,
            scrollProgress: debugScrollInfo.scrollProgress,
            isNearEnd: debugScrollInfo.isNearEnd,
          }}
        />
      )}
      
      {/* Clear View Exit Button - positioned at screen level */}
      {isSmallDevice && isClearViewMode && (
        <TouchableOpacity 
          style={styles.clearViewExitButton}
          onPress={toggleClearViewMode}
          activeOpacity={0.7}
        >
          <Icon 
            name="section-x" 
            size={24} 
            color="#fff" 
          />
        </TouchableOpacity>
      )}
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
    backgroundColor: '#000',
  },
  feedLoadingContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearViewExitButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ListFeedView; 