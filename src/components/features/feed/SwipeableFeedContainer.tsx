import React, { useRef, useCallback, useEffect, useState, useMemo, useLayoutEffect, memo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  TouchableOpacity,
  StatusBar,
  FlatList,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import { useVisibilityStore } from '../../../hooks/useVisibility';

import { useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../../ui/UI';
import FeedRenderer from './FeedRenderer';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
import { isSmallScreen, isTablet } from '../../../utils/helpers/screenSize';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Define the feed options type
export type FeedOption = string;

// Feed configuration - will be populated from subscribed channels
const FEED_CONFIG: { [key: string]: { label: string; order: number } } = {};

interface SwipeableFeedContainerProps {
  initialFeed?: FeedOption;
  onFeedChange?: (feed: FeedOption) => void;
  isRefreshing?: boolean;
  forceError?: boolean; // Add debug flag to force error responses
  applySafeArea?: boolean;
}

const SwipeableFeedContainer: React.FC<SwipeableFeedContainerProps> = memo(({
  initialFeed = 'yourMix',
  onFeedChange,
  isRefreshing = false,
  forceError = false, // Add debug flag to force error responses
  applySafeArea = false,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const indicatorScrollViewRef = useRef<any>(null);
  const { channels: subscribedChannels, isLoading: isLoadingChannels } = useSubscribedChannels();
  const isSmallDevice = isSmallScreen() || isTablet();
  const insets = useSafeAreaInsets();



  // Local state for tracking which feed is visible for UI purposes
  const [visibleFeedOption, setVisibleFeedOption] = useState<FeedOption | null>(null);
  const [visibleFeedIndex, setVisibleFeedIndex] = useState(0);

  // Memoized screen dimensions handling
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('window'));
  const { screenWidth, screenHeight } = useMemo(() => ({
    screenWidth: screenDims.width,
    screenHeight: screenDims.height,
  }), [screenDims.width, screenDims.height]);

  // Listen for orientation/screen size changes
  useEffect(() => {
    const onChange = ({ window }: { window: { width: number; height: number; scale: number; fontScale: number } }) => {
      setScreenDims(window);
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => {
      sub?.remove();
    };
  }, []);
  
  // State for current feed and positions
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const [savedPositions, setSavedPositions] = useState<{ [key in FeedOption]?: number }>({});
  const [feedRetries, setFeedRetries] = useState<{ [key in FeedOption]?: number }>({});

  // Animation values for feed bar visibility and transitions
  const feedBarOpacity = useRef(new Animated.Value(1)).current;
  const feedBarTranslateY = useRef(new Animated.Value(0)).current;
  const horizontalScrollOffset = useRef(new Animated.Value(0)).current;
  const [isFeedBarVisible, setIsFeedBarVisible] = useState(true);
  const [isHorizontalScrolling, setIsHorizontalScrolling] = useState(false);
  const [currentScrollProgress, setCurrentScrollProgress] = useState(0);

  // Refs to prevent re-renders on scroll
  const currentScrollProgressRef = useRef(0);
  const isHorizontalScrollingRef = useRef(false);
  const currentFeedIndexRef = useRef(0);

  // Memoized feed configuration from subscribed channels
  const feedConfig = useMemo(() => {
    const config: { [key: string]: { label: string; order: number } } = {};
    subscribedChannels.forEach(channel => {
      config[channel.uri] = {
        label: channel.displayName.toLowerCase(),
        order: channel.order,
      };
    });
    return config;
  }, [subscribedChannels]);

  // Memoized feed options in order
  const feedOptions = useMemo(() => {
    const options = Object.keys(feedConfig).sort(
      (a, b) => feedConfig[a].order - feedConfig[b].order
    ) as FeedOption[];
    return options;
  }, [feedConfig]);

  // Scroll indicator to keep active feed visible (defined early to avoid use-before-declare)
  const scrollIndicatorToActive = useCallback((index: number) => {
    if (indicatorScrollViewRef.current) {
      const indicatorWidth = 120; // Account for text width + padding
      const containerWidth = screenWidth - 32; // Account for horizontal padding
      const targetPosition = (index * indicatorWidth) - (containerWidth / 2) + (indicatorWidth / 2);
      const scrollPosition = Math.max(0, targetPosition);
      indicatorScrollViewRef.current.scrollTo({ x: scrollPosition, animated: true });
    }
  }, [screenWidth]);

  // Set initial feed index when feed options are available
  const hasAppliedInitialIndexRef = useRef(false);
  useLayoutEffect(() => {
    if (!hasAppliedInitialIndexRef.current && feedOptions.length > 0) {
      const initialIndex = feedOptions.findIndex(option => option === initialFeed);
      
      // Always set a valid index, defaulting to 0 if initialFeed is not found
      const targetIndex = initialIndex >= 0 ? initialIndex : 0;
      setCurrentFeedIndex(targetIndex);
      currentFeedIndexRef.current = targetIndex;
      setCurrentScrollProgress(targetIndex);
      currentScrollProgressRef.current = targetIndex;
      setVisibleFeedOption(feedOptions[targetIndex]);
      setVisibleFeedIndex(targetIndex);
      
      onFeedChange?.(feedOptions[targetIndex]);
      
      // Ensure the FlatList starts on the desired initial index
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      });
      
      // Keep indicator in sync
      scrollIndicatorToActive(targetIndex);
      hasAppliedInitialIndexRef.current = true;
    }
  }, [feedOptions, initialFeed, scrollIndicatorToActive, onFeedChange]);

  // Compute current feed option with no-flicker fallback to the intended initial feed
  const pendingInitialIndex = feedOptions.findIndex(option => option === initialFeed);
  const currentFeedOption = hasAppliedInitialIndexRef.current
    ? (feedOptions[currentFeedIndex] || (feedOptions[0] || 'yourMix'))
    : (pendingInitialIndex >= 0 ? feedOptions[pendingInitialIndex] : (feedOptions[0] || 'yourMix'));

  // Ensure FlatList renders the correct initial index on the first paint when items are available
  const initialIndexForFlatList = useMemo(() => {
    if (hasAppliedInitialIndexRef.current) {
      return Math.max(0, Math.min(currentFeedIndex, Math.max(0, feedOptions.length - 1)));
    }
    if (feedOptions.length > 0) {
      return pendingInitialIndex >= 0 ? pendingInitialIndex : 0;
    }
    return 0;
  }, [hasAppliedInitialIndexRef.current, currentFeedIndex, feedOptions.length, pendingInitialIndex]);

  // Animate feed bar visibility
  const animateFeedBar = useCallback((visible: boolean, immediate: boolean = false) => {
    if (visible === isFeedBarVisible) return;
    
    setIsFeedBarVisible(visible);
    
    const toValue = visible ? 1 : 0;
    const translateYValue = visible ? 0 : -50;
    
    if (immediate) {
      feedBarOpacity.setValue(toValue);
      feedBarTranslateY.setValue(translateYValue);
    } else {
      Animated.parallel([
        Animated.timing(feedBarOpacity, {
          toValue,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(feedBarTranslateY, {
          toValue: translateYValue,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isFeedBarVisible, feedBarOpacity, feedBarTranslateY]);

  // Ensure feed bar is visible when feed changes
  useEffect(() => {
    animateFeedBar(true, true);
  }, [currentFeedIndex, animateFeedBar]);

  // Handle vertical scroll from individual feeds for feed bar visibility
  const handleVerticalScroll = useCallback((scrollY: number, feedIndex: number) => {
    // No scroll tracking - feed bar visibility handled by other means
  }, []);

  // Handle feed change
  const handleFeedChange = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < feedOptions.length) {
      setCurrentFeedIndex(newIndex);
      currentFeedIndexRef.current = newIndex;
      const newFeedOption = feedOptions[newIndex];
      onFeedChange?.(newFeedOption);
    }
  }, [feedOptions, onFeedChange]);

  // Handle position saving for each feed
  const handlePositionChange = useCallback((position: number) => {
    setSavedPositions(prev => ({
      ...prev,
      [currentFeedOption]: position
    }));
  }, [currentFeedOption]);

  // Handle retry for each feed
  const handleRetryFeed = useCallback(() => {
    const currentRetries = feedRetries[currentFeedOption] || 0;
    setFeedRetries(prev => ({
      ...prev,
      [currentFeedOption]: currentRetries + 1
    }));
  }, [currentFeedOption, feedRetries]);

  // Simple viewability detection for feed pages
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    // Find the first viewable feed item
    const visibleFeedItem = viewableItems.find(item => 
      item.isViewable && 
      item.item && 
      typeof item.item === 'string'
    );
    
    if (visibleFeedItem) {
      const nextFeedOption = visibleFeedItem.item as FeedOption;
      const nextIndex = visibleFeedItem.index;
      
      if (nextFeedOption !== visibleFeedOption) {
        // Update local state for UI only
        setVisibleFeedOption(nextFeedOption);
        setVisibleFeedIndex(nextIndex);
      }
    }
  }, [visibleFeedOption]);

  // Initialize first feed when options are available
  useEffect(() => {
    if (feedOptions.length > 0 && !visibleFeedOption) {
      const firstFeedOption = feedOptions[0];
      setVisibleFeedOption(firstFeedOption);
      setVisibleFeedIndex(0);
    }
  }, [feedOptions, visibleFeedOption]);

  // Optimized horizontal scroll handler with improved responsiveness
  const scrollUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleHorizontalScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    
    // Immediate visual updates using refs to prevent re-renders
    horizontalScrollOffset.setValue(offsetX);
    const progress = offsetX / screenWidth;
    currentScrollProgressRef.current = progress;
    
    // Show feed bar during scrolling (immediate)
    if (!isHorizontalScrollingRef.current) {
      isHorizontalScrollingRef.current = true;
      setIsHorizontalScrolling(true);
      animateFeedBar(true);
    }
    
    // Debounce expensive operations with shorter timeout for better responsiveness
    if (scrollUpdateTimeoutRef.current) {
      clearTimeout(scrollUpdateTimeoutRef.current);
    }
    
    scrollUpdateTimeoutRef.current = setTimeout(() => {
      const currentIndex = Math.round(offsetX / screenWidth);
      if (currentIndex !== currentFeedIndexRef.current && currentIndex >= 0 && currentIndex < feedOptions.length) {
        currentFeedIndexRef.current = currentIndex;
        setCurrentFeedIndex(currentIndex);
        const newFeedOption = feedOptions[currentIndex];
        onFeedChange?.(newFeedOption);
        scrollIndicatorToActive(currentIndex);
      }
    }, 25); // Reduced debounce for more responsive feel
  }, [feedOptions, onFeedChange, animateFeedBar, horizontalScrollOffset, scrollIndicatorToActive, screenWidth]);

  // Handle scroll end to update current feed
  const handleScrollEnd = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / screenWidth);
    
    if (newIndex !== currentFeedIndexRef.current) {
      handleFeedChange(newIndex);
    }
    
    isHorizontalScrollingRef.current = false;
    setIsHorizontalScrolling(false);
  }, [handleFeedChange, screenWidth]);

  // Handle feed indicator tap
  const handleIndicatorTap = useCallback((feedOption: FeedOption) => {
          const targetIndex = feedOptions.findIndex(option => option === feedOption);
      if (targetIndex >= 0) {
        flatListRef.current?.scrollToIndex({
          index: targetIndex,
          animated: true,
        });
      
      // Show feed bar immediately when tapping indicator
      animateFeedBar(true, true);
    }
  }, [feedOptions, animateFeedBar]);

  // Cleanup timeouts and subscriptions
  useEffect(() => {
    return () => {
      if (scrollUpdateTimeoutRef.current) {
        clearTimeout(scrollUpdateTimeoutRef.current);
      }
    };
  }, []);

  // Scroll indicator when feed changes
  useEffect(() => {
    scrollIndicatorToActive(currentFeedIndex);
  }, [currentFeedIndex, scrollIndicatorToActive]);

  // Memoized query options for feed rendering
  const memoizedQueryOptions = useMemo(() => ({
    enabled: true, // Always enable to preload feeds
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  }), []);

  // Optimized feed page styles - consistent with ListFeedView
  const feedPageStyle = useMemo(() => ({
    ...styles.feedPage,
    width: screenWidth,
    height: '100%' as const,
  }), [screenWidth]);

  // Dynamic base font size for channel indicators based on screen size
  const indicatorBaseFontSize = useMemo(() => {
    if (isTablet()) return 20;
    if (isSmallScreen()) return 16;
    const minDimension = Math.min(screenWidth, screenHeight);
    if (minDimension >= 420) return 18; // large phones/phablets
    return 16;
  }, [screenWidth, screenHeight]);

  // Render individual feed with comprehensive memoization
  const renderFeed = useCallback(({ item: feedOption, index }: { item: FeedOption; index: number }) => {
    // Use local state to determine if this feed is visible
    const isVisible = index === visibleFeedIndex;
    
    return (
      <View style={feedPageStyle}> 
        <FeedRenderer
          feedOption={String(feedOption)}
          onRetryFeed={handleRetryFeed}
          onPositionChange={handlePositionChange}
          initialPosition={savedPositions[feedOption]}
          queryOptions={memoizedQueryOptions}
          // Pass visibility state to control video playback and fetching - consistent with ListFeedView
          isVisible={isVisible}

          isRefreshing={isRefreshing}
          forceError={forceError}
        />
      </View>
    );
  }, [
    visibleFeedIndex,
    feedPageStyle,
    handleRetryFeed,
    handlePositionChange,
    savedPositions,
    memoizedQueryOptions,
          handleVerticalScroll,
      isRefreshing,
      forceError,
  ]);

  // Get indicator style with gradual opacity based on scroll progress
  const getIndicatorStyle = useCallback((feedOption: FeedOption) => {
    const feedIndex = feedConfig[feedOption]?.order || 0;
    const isActive = feedOption === currentFeedOption;
    
    // Use intended initial index for progress until the initial index is applied to avoid flicker
    const initialIdx = feedOptions.findIndex(option => option === initialFeed);
    const baseProgress = hasAppliedInitialIndexRef.current
      ? currentScrollProgressRef.current
      : (initialIdx >= 0 ? initialIdx : 0);

    // Calculate opacity based on distance from current position
    let opacity = 0.6; // Default inactive opacity
    if (isActive) {
      opacity = 1;
    } else {
      // Gradual opacity based on scroll progress
      const distance = Math.abs(baseProgress - feedIndex);
      opacity = Math.max(0.3, 1 - distance * 0.4);
    }
    
    return {
      color: isActive ? Colors.white : 'rgba(255, 255, 255, 0.6)',
      fontSize: indicatorBaseFontSize,
      marginRight: 8,
      fontWeight: 'bold' as const,
      opacity,
      transform: [
        {
          scale: isActive ? 1.1 : 1,
        },
      ],
    };
  }, [currentFeedOption, currentScrollProgressRef.current, feedConfig, feedOptions, initialFeed, indicatorBaseFontSize]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
      
      {/* Animated Feed Indicators with horizontal scrolling */}
      <Animated.View 
        style={[
          styles.feedSwitcher, 
          { 
            top: applySafeArea ? 12 + insets.top : 12,
            opacity: feedBarOpacity,
            transform: [{ translateY: feedBarTranslateY }],
          }
        ]}
      >
        <ScrollView
          ref={indicatorScrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.indicatorContainer}
          scrollEnabled={false} // Disable manual scrolling, only programmatic
        >
          {feedOptions.map((feedOption) => (
            <TouchableOpacity
              key={feedOption}
              onPress={() => handleIndicatorTap(feedOption)}
              activeOpacity={0.7}
              style={styles.indicatorItem}
            >
              <Animated.Text style={getIndicatorStyle(feedOption)}>
                {String(feedConfig[feedOption]?.label || feedOption)}
              </Animated.Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Horizontal FlatList for feeds with optimized gesture handling - consistent with ListFeedView */}
      <FlatList
        ref={flatListRef}
        data={feedOptions}
        renderItem={renderFeed}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={handleHorizontalScroll}
        scrollEventThrottle={16}
        initialScrollIndex={initialIndexForFlatList}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        style={styles.flatList}
        // Optimized gesture handling to prevent interference with nested FlashList
        directionalLockEnabled={true}
        alwaysBounceHorizontal={false}
        alwaysBounceVertical={false}
        bounces={false}
        decelerationRate="fast"
                 scrollEnabled={true}
        // Remove nestedScrollEnabled to prevent gesture conflicts
        removeClippedSubviews={true}
        maxToRenderPerBatch={1}
        windowSize={3}
        initialNumToRender={1}
        // Add horizontal scroll indicator to prevent vertical scroll interference
        indicatorStyle="white"
        // Standard viewability detection
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
          minimumViewTime: 0,
          waitForInteraction: false,
        }}
        contentContainerStyle={{ 
          flexGrow: 1,
          backgroundColor: Colors.black,
        }}
      />
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  feedSwitcher: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    // Subtle shadow for better visibility
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4, // Android
    backgroundColor: 'transparent',
  },
  indicatorContainer: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  indicatorItem: {
    paddingHorizontal: 4, // Reduced from 8 to 4 for tighter spacing
  },
  flatList: {
    flex: 1,
  },
  feedPage: {
    // width will be set dynamically
    height: '100%',
  },
});

// Performance comparison for memo
const areEqual = (prevProps: SwipeableFeedContainerProps, nextProps: SwipeableFeedContainerProps) => {
  // Critical props that affect visibility and performance
  if (prevProps.initialFeed !== nextProps.initialFeed) return false;
  if (prevProps.isRefreshing !== nextProps.isRefreshing) return false;
  if (prevProps.forceError !== nextProps.forceError) return false;
  if (prevProps.applySafeArea !== nextProps.applySafeArea) return false;
  
  return true;
};

export default memo(SwipeableFeedContainer, areEqual); 