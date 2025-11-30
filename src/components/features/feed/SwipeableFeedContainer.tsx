import React, { useRef, useCallback, useEffect, useState, useMemo, useLayoutEffect, memo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  TouchableOpacity,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../../ui/UI';
import FeedRenderer from './FeedRenderer';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
import { isSmallScreen, isTablet } from '../../../utils/helpers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVisibilityTabIsActive } from '../../../core/visibility';

// Define the feed options type
export type FeedOption = string;

// Hardcoded feed options - only 'following' and 'your-mix'
const FEED_LABELS: { [key: string]: string } = {
  'following': 'following',
  'your-mix': 'your mix',
};

interface SwipeableFeedContainerProps {
  initialFeed?: FeedOption;
  onFeedChange?: (feed: FeedOption) => void;
  isRefreshing?: boolean;
  forceError?: boolean; // Add debug flag to force error responses
  applySafeArea?: boolean;
  // Optional override for indicator text size (used by Home screen)
  indicatorFontSize?: number;
}

const SwipeableFeedContainer: React.FC<SwipeableFeedContainerProps> = memo(({
  initialFeed = 'following',
  onFeedChange,
  isRefreshing = false,
  forceError = false, // Add debug flag to force error responses
  applySafeArea = false,
  indicatorFontSize,
}) => {
  const pagerViewRef = useRef<PagerView>(null);
  const { subscribedChannels } = useSubscribedChannels();
  const insets = useSafeAreaInsets();
  const isTabActive = useVisibilityTabIsActive('index');

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
  const [isFeedBarVisible, setIsFeedBarVisible] = useState(true);

  // Use PagerView's page tracking directly - updated via onPageSelected
  const currentPageRef = useRef(0);
  // Track scroll progress from PagerView's onPageScroll for indicator animation
  const pageScrollProgress = useRef(0);
  // State to trigger indicator re-renders during scroll (doesn't affect feeds)
  const [indicatorScrollProgress, setIndicatorScrollProgress] = useState(0);

  // Always show 'following' first, then 'your-mix'
  const feedOptions = useMemo(() => {
    return ['following', 'your-mix'] as FeedOption[];
  }, []);

  // Set initial feed index when feed options are available
  const hasAppliedInitialIndexRef = useRef(false);
  useLayoutEffect(() => {
    if (!hasAppliedInitialIndexRef.current && feedOptions.length > 0) {
      const initialIndex = feedOptions.findIndex(option => option === initialFeed);
      
      // Always set a valid index, defaulting to 0 if initialFeed is not found
      const targetIndex = initialIndex >= 0 ? initialIndex : 0;
      
      // Update both ref and state
      currentPageRef.current = targetIndex;
      setCurrentFeedIndex(targetIndex);
      pageScrollProgress.current = targetIndex;
      setIndicatorScrollProgress(targetIndex);
      
      onFeedChange?.(feedOptions[targetIndex]);
      
      // Ensure the PagerView starts on the desired initial index
      requestAnimationFrame(() => {
        pagerViewRef.current?.setPage(targetIndex);
      });
      
      hasAppliedInitialIndexRef.current = true;
    }
  }, [feedOptions, initialFeed, onFeedChange]);

  // Compute current feed option using PagerView's tracked page
  const pendingInitialIndex = feedOptions.findIndex(option => option === initialFeed);
  const activePageIndex = hasAppliedInitialIndexRef.current ? currentPageRef.current : (pendingInitialIndex >= 0 ? pendingInitialIndex : 0);
  const currentFeedOption = feedOptions[activePageIndex] || (feedOptions[0] || 'following');

  // Ensure PagerView renders the correct initial index on the first paint when items are available
  const initialPageIndex = useMemo(() => {
    if (hasAppliedInitialIndexRef.current) {
      return Math.max(0, Math.min(currentPageRef.current, Math.max(0, feedOptions.length - 1)));
    }
    if (feedOptions.length > 0) {
      return pendingInitialIndex >= 0 ? pendingInitialIndex : 0;
    }
    return 0;
  }, [hasAppliedInitialIndexRef.current, feedOptions.length, pendingInitialIndex]);

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


  // Handle page change from PagerView - final confirmation after transition completes
  const handlePageSelected = useCallback((event: any) => {
    if (!hasAppliedInitialIndexRef.current) return;
    
    const nextIndex = event.nativeEvent.position;
    const prevIndex = currentPageRef.current;
    
    // Ensure refs are in sync (should already be updated by onPageScroll, but confirm)
    if (nextIndex !== prevIndex) {
      currentPageRef.current = nextIndex;
      pageScrollProgress.current = nextIndex;
      setCurrentFeedIndex(nextIndex);
      setIndicatorScrollProgress(nextIndex);
    }
    
    // Notify parent of feed change (only on final selection, not during scroll)
    const newFeedOption = feedOptions[nextIndex];
    if (newFeedOption && nextIndex !== prevIndex) {
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

  // Ensure current page stays in range when options change
  useEffect(() => {
    if (feedOptions.length === 0) return;
    if (currentPageRef.current >= feedOptions.length) {
      const lastIndex = Math.max(0, feedOptions.length - 1);
      currentPageRef.current = lastIndex;
      setCurrentFeedIndex(lastIndex);
    }
  }, [feedOptions]);

  // Handle page scroll from PagerView - update visibility and indicator immediately during scroll
  const handlePageScroll = useCallback((event: any) => {
    const { position, offset } = event.nativeEvent;
    const progress = position + offset;
    const roundedPosition = Math.round(progress);
    
    // Update refs immediately for calculations
    pageScrollProgress.current = progress;
    
    // Update visibility immediately during scroll (not waiting for onPageSelected)
    // This makes feeds visible/hidden in real-time as user swipes
    if (roundedPosition !== currentPageRef.current && roundedPosition >= 0 && roundedPosition < feedOptions.length) {
      currentPageRef.current = roundedPosition;
      setCurrentFeedIndex(roundedPosition);
    }
    
    // Update indicator progress for smooth animation
    setIndicatorScrollProgress(progress);
    
    // Show feed bar during scrolling
    animateFeedBar(true);
  }, [animateFeedBar, feedOptions.length]);

  // Handle scroll state changes from PagerView
  const handlePageScrollStateChanged = useCallback((event: any) => {
    const state = event.nativeEvent.pageScrollState;
    // Feed bar stays visible, no special handling needed
  }, []);

  // Handle feed indicator tap
  const handleIndicatorTap = useCallback((feedOption: FeedOption) => {
    const targetIndex = feedOptions.findIndex(option => option === feedOption);
    if (targetIndex >= 0) {
      pagerViewRef.current?.setPage(targetIndex);
      // Show feed bar immediately when tapping indicator
      animateFeedBar(true, true);
    }
  }, [feedOptions, animateFeedBar]);



  // Memoized query options for feed rendering
  const baseQueryOptions = useMemo(() => ({
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
    if (typeof indicatorFontSize === 'number' && indicatorFontSize > 0) return indicatorFontSize;
    if (isTablet()) return 20;
    if (isSmallScreen()) return 16;
    const minDimension = Math.min(screenWidth, screenHeight);
    if (minDimension >= 420) return 18; // large phones/phablets
    return 16;
  }, [screenWidth, screenHeight, indicatorFontSize]);

  // Render individual feed with comprehensive memoization
  // Visibility uses currentFeedIndex state (synced with PagerView's page tracking)
  const renderFeed = useCallback(({ item: feedOption, index }: { item: FeedOption; index: number }) => {
    // Use state for visibility - triggers re-render when page changes (synced with PagerView via handlePageSelected)
    const isVisible = isTabActive && index === currentFeedIndex;
    const isNeighbor = isTabActive && Math.abs(currentFeedIndex - index) === 1;
    
    return (
      <FeedRenderer
        feedOption={String(feedOption)}
        onRetryFeed={handleRetryFeed}
        onPositionChange={handlePositionChange}
        initialPosition={savedPositions[feedOption]}
        queryOptions={baseQueryOptions}
        // Pass visibility state to control video playback and fetching - consistent with ListFeedView
        isVisible={isVisible}
        isRefreshing={isRefreshing}
        forceError={forceError}
        shouldPrefetch={isNeighbor}
        visibilityKey={feedOption}
      />
    );
  }, [
    currentFeedIndex,
    handleRetryFeed,
    handlePositionChange,
    savedPositions,
    baseQueryOptions,
    isTabActive,
    isRefreshing,
    forceError,
  ]);


  // Get indicator style using PagerView's scroll progress directly from SDK
  const getIndicatorStyle = useCallback((feedOption: FeedOption) => {
    const feedIndex = feedOptions.findIndex(option => option === feedOption);
    const isActive = feedOption === currentFeedOption;
    
    // Use state directly for smooth real-time updates during scroll (not ref)
    const baseProgress = hasAppliedInitialIndexRef.current
      ? indicatorScrollProgress
      : (feedOptions.findIndex(option => option === initialFeed) >= 0 
          ? feedOptions.findIndex(option => option === initialFeed) 
          : 0);

    // Calculate opacity based on distance from current position
    let opacity = 0.75; // Default inactive opacity
    if (isActive) {
      opacity = 1;
    } else {
      // Gradual opacity based on PagerView's scroll progress (real-time from state)
      const distance = Math.abs(baseProgress - feedIndex);
      opacity = Math.max(0.3, 1 - distance * 0.4);
    }
    
    return {
      color: isActive ? Colors.white : 'rgba(255, 255, 255, 0.75)',
      fontSize: indicatorBaseFontSize,
      marginRight: 8,
      fontFamily: 'Firma-Black',
      opacity,
    };
  }, [currentFeedOption, feedOptions, initialFeed, indicatorBaseFontSize, indicatorScrollProgress]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
      
      {/* Feed Indicators - animated using PagerView's scroll progress */}
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
        <View style={styles.indicatorContainer}>
          {feedOptions.map((feedOption) => (
            <TouchableOpacity
              key={feedOption}
              onPress={() => handleIndicatorTap(feedOption)}
              activeOpacity={0.7}
              style={styles.indicatorItem}
            >
              <Animated.Text style={getIndicatorStyle(feedOption)}>
                {FEED_LABELS[feedOption] || feedOption}
              </Animated.Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* PagerView for feeds with optimized gesture handling */}
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
        onPageScrollStateChanged={handlePageScrollStateChanged}
        scrollEnabled={true}
        overdrag={false}
        pageMargin={0}
      >
        {feedOptions.map((feedOption, index) => (
          <View key={feedOption} style={feedPageStyle}>
            {renderFeed({ item: feedOption, index })}
          </View>
        ))}
      </PagerView>
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
    flexDirection: 'row',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  indicatorItem: {
    paddingHorizontal: 4, // Reduced from 8 to 4 for tighter spacing
  },
  pagerView: {
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
  if (prevProps.indicatorFontSize !== nextProps.indicatorFontSize) return false;
  
  return true;
};

export default memo(SwipeableFeedContainer, areEqual); 