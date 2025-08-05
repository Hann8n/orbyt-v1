import React, { useRef, useCallback, useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { BRAND } from '../../../utils/formatting/Colors';
import FeedRenderer from './FeedRenderer';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
import { isSmallScreen, isTablet } from '../../../utils/helpers/screenSize';

// Remove static SCREEN_WIDTH
// const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Define the feed options type
export type FeedOption = string;

// Feed configuration - will be populated from subscribed channels
const FEED_CONFIG: { [key: string]: { label: string; order: number } } = {};

interface SwipeableFeedContainerProps {
  initialFeed?: FeedOption;
  onFeedChange?: (feed: FeedOption) => void;
  isRefreshing?: boolean;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  forceError?: boolean; // Add debug flag to force error responses
}

const SwipeableFeedContainer: React.FC<SwipeableFeedContainerProps> = ({
  initialFeed = 'yourMix',
  onFeedChange,
  isRefreshing = false,
  onScrubbingChange,
  forceError = false, // Add debug flag to force error responses
}) => {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const indicatorScrollViewRef = useRef<ScrollView>(null);
  const { channels: subscribedChannels, isLoading: isLoadingChannels } = useSubscribedChannels();
  const isSmallDevice = isSmallScreen() || isTablet();

  // Scrubbing lock state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const handleScrubbingChange = (scrubbing: boolean) => {
    setIsScrubbing(scrubbing);
    onScrubbingChange?.(scrubbing);
  };

  // Add state for screen dimensions
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('window'));
  const screenWidth = screenDims.width;
  const screenHeight = screenDims.height;

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
  const [currentFeedIndex, setCurrentFeedIndex] = useState(
    FEED_CONFIG[initialFeed]?.order ?? 1
  );
  const [savedPositions, setSavedPositions] = useState<{ [key in FeedOption]?: number }>({});
  const [feedRetries, setFeedRetries] = useState<{ [key in FeedOption]?: number }>({});

  // Animation values for feed bar visibility and transitions
  const feedBarOpacity = useRef(new Animated.Value(1)).current;
  const feedBarTranslateY = useRef(new Animated.Value(0)).current;
  const horizontalScrollOffset = useRef(new Animated.Value(0)).current;
  
  // Initialize feed bar as visible on mount
  useEffect(() => {
    feedBarOpacity.setValue(1);
    feedBarTranslateY.setValue(0);
  }, [feedBarOpacity, feedBarTranslateY]);
  
  // State for tracking scroll direction and feed bar visibility
  const [isFeedBarVisible, setIsFeedBarVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isHorizontalScrolling, setIsHorizontalScrolling] = useState(false);
  const [currentScrollProgress, setCurrentScrollProgress] = useState(0);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  // Build feed configuration from subscribed channels
  const buildFeedConfig = () => {
    const config: { [key: string]: { label: string; order: number } } = {};
    subscribedChannels.forEach(channel => {
      config[channel.uri] = {
        label: channel.displayName.toLowerCase(),
        order: channel.order,
      };
    });
    return config;
  };

  const feedConfig = buildFeedConfig();

  // Get all feed options in order
  const feedOptions = Object.keys(feedConfig).sort(
    (a, b) => feedConfig[a].order - feedConfig[b].order
  ) as FeedOption[];

  // Get current feed option from index
  const currentFeedOption = feedOptions[currentFeedIndex] || (feedOptions[0] || 'yourMix');

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

  // Ensure feed bar is visible on initial load
  useEffect(() => {
    if (!hasUserScrolled) {
      animateFeedBar(true, true);
    }
  }, [hasUserScrolled, animateFeedBar]);

  // Handle vertical scroll from individual feeds
  const handleVerticalScroll = useCallback((scrollY: number, feedIndex: number) => {
    if (feedIndex !== currentFeedIndex) return; // Only handle current feed
    
    const scrollDelta = scrollY - lastScrollY;
    const scrollThreshold = 10; // Minimum scroll distance to trigger visibility change
    
    if (Math.abs(scrollDelta) > scrollThreshold) {
      setHasUserScrolled(true); // Mark that user has scrolled
      
      if (scrollDelta > 0) {
        // Scrolling down - hide feed bar
        animateFeedBar(false);
      } else {
        // Scrolling up - show feed bar
        animateFeedBar(true);
      }
      setLastScrollY(scrollY);
    }
  }, [currentFeedIndex, lastScrollY, animateFeedBar]);

  // Handle feed change
  const handleFeedChange = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < feedOptions.length) {
      setCurrentFeedIndex(newIndex);
      const newFeedOption = feedOptions[newIndex];
      onFeedChange?.(newFeedOption);
      
      // Show feed bar when changing feeds
      animateFeedBar(true, true);
            
      // Reset scroll state for new feed
      setLastScrollY(0);
    }
  }, [feedOptions, onFeedChange, animateFeedBar]);

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

  // Scroll indicator to keep active feed visible
  const scrollIndicatorToActive = useCallback((index: number) => {
    if (indicatorScrollViewRef.current) {
      // Calculate the approximate width of each indicator including padding
      const indicatorWidth = 120; // Account for text width + padding
      const containerWidth = screenWidth - 32; // Account for horizontal padding
      
      // Calculate the center position for the active indicator
      const targetPosition = (index * indicatorWidth) - (containerWidth / 2) + (indicatorWidth / 2);
      
      // Ensure we don't scroll past the beginning
      const scrollPosition = Math.max(0, targetPosition);
      
      indicatorScrollViewRef.current.scrollTo({
        x: scrollPosition,
        animated: true,
      });
    }
  }, [screenWidth]);

  // Handle horizontal scroll for gradual transitions
  const handleHorizontalScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    horizontalScrollOffset.setValue(offsetX);
    
    // Calculate scroll progress for gradual transitions
    const progress = offsetX / screenWidth;
    setCurrentScrollProgress(progress);
    
    // Mark that user has interacted
    setHasUserScrolled(true);
    
    // Show feed bar during horizontal scrolling
    if (!isHorizontalScrolling) {
      setIsHorizontalScrolling(true);
      animateFeedBar(true);
    }
    
    // Update current feed index during scroll for smoother transitions
    const currentIndex = Math.round(offsetX / screenWidth);
    if (currentIndex !== currentFeedIndex && currentIndex >= 0 && currentIndex < feedOptions.length) {
      setCurrentFeedIndex(currentIndex);
      const newFeedOption = feedOptions[currentIndex];
      onFeedChange?.(newFeedOption);
      
      
      // Scroll indicator to follow the feed change
      scrollIndicatorToActive(currentIndex);
    }
  }, [currentFeedIndex, feedOptions, onFeedChange, isHorizontalScrolling, animateFeedBar, horizontalScrollOffset, scrollIndicatorToActive, screenWidth]);

  // Handle scroll end to update current feed and hide feed bar
  const handleScrollEnd = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / screenWidth);
    
    if (newIndex !== currentFeedIndex) {
      handleFeedChange(newIndex);
    }
    
    // Hide feed bar after horizontal scroll ends, but only if user has scrolled
    setIsHorizontalScrolling(false);
    if (hasUserScrolled) {
      setTimeout(() => {
        if (!isHorizontalScrolling) {
          animateFeedBar(false);
        }
      }, 1000); // Delay to allow user to see the feed change
    }
  }, [currentFeedIndex, handleFeedChange, isHorizontalScrolling, animateFeedBar, hasUserScrolled, screenWidth]);

  // Handle feed indicator tap
  const handleIndicatorTap = useCallback((feedOption: FeedOption) => {
    const targetIndex = feedOptions.findIndex(option => option === feedOption);
    if (targetIndex >= 0) {
      flatListRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
      });
      
      // Mark that user has interacted
      setHasUserScrolled(true);
      
      // Show feed bar immediately when tapping indicator
      animateFeedBar(true, true);
    }
  }, [feedOptions, animateFeedBar]);

  // Scroll indicator when feed changes
  useEffect(() => {
    scrollIndicatorToActive(currentFeedIndex);
  }, [currentFeedIndex, scrollIndicatorToActive]);

  // Render individual feed
  const renderFeed = useCallback(({ item: feedOption, index }: { item: FeedOption; index: number }) => {
    const isVisible = index === currentFeedIndex;
    
    return (
      <View style={[styles.feedPage, { width: screenWidth, height: '100%' }]}> 
        {/* width is set dynamically above; removed inline comment to avoid text node error */}
        <FeedRenderer
          feedOption={String(feedOption)}
          onRetryFeed={handleRetryFeed}
          onPositionChange={handlePositionChange}
          initialPosition={savedPositions[feedOption]}
          queryOptions={{
            enabled: true, // Always enable to preload feeds
            staleTime: 5 * 60 * 1000, // 5 minutes
            refetchOnMount: false,
            refetchOnWindowFocus: false,
          }}
          // Pass visibility state to control video playback
          isVisible={isVisible}
          // Pass scroll handler for feed bar visibility
          onVerticalScroll={(scrollY) => handleVerticalScroll(scrollY, index)}
          isRefreshing={isRefreshing}
          onScrubbingChange={handleScrubbingChange}
          forceError={forceError} // Pass the forceError prop to FeedFetcher
        />
      </View>
    );
  }, [currentFeedIndex, handleRetryFeed, handlePositionChange, savedPositions, handleVerticalScroll, isRefreshing, screenWidth, handleScrubbingChange, forceError]);

  // Get indicator style with gradual opacity based on scroll progress
  const getIndicatorStyle = useCallback((feedOption: FeedOption) => {
    const feedIndex = feedConfig[feedOption]?.order || 0;
    const isActive = feedOption === currentFeedOption;
    
    // Calculate opacity based on distance from current position
    let opacity = 0.6; // Default inactive opacity
    if (isActive) {
      opacity = 1;
    } else {
      // Gradual opacity based on scroll progress
      const distance = Math.abs(currentScrollProgress - feedIndex);
      opacity = Math.max(0.3, 1 - distance * 0.4);
    }
    
    return {
      color: isActive ? BRAND.SECONDARY : 'rgba(255, 255, 255, 0.6)',
      fontSize: 16,
      marginRight: 8,
      fontWeight: 'bold' as const,
      opacity,
      transform: [
        {
          scale: isActive ? 1.1 : 1,
        },
      ],
    };
  }, [currentFeedOption, currentScrollProgress, feedConfig]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND.PRIMARY} />
      
      {/* Animated Feed Indicators with horizontal scrolling */}
      <Animated.View 
        style={[
          styles.feedSwitcher, 
          { 
            top: isSmallDevice ? insets.top + 12 : insets.top + 12,
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

      {/* Horizontal FlatList for feeds with proper gesture handling */}
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
        initialScrollIndex={currentFeedIndex}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        style={styles.flatList}
        // Optimized gesture handling properties
        directionalLockEnabled={true}
        alwaysBounceHorizontal={false}
        alwaysBounceVertical={false}
        bounces={false}
        decelerationRate="fast"
        // Ensure proper gesture recognition
        scrollEnabled={!isScrubbing}
        nestedScrollEnabled={true}
      />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.PRIMARY,
  },
  feedSwitcher: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    // Subtle shadow for better visibility
    shadowColor: '#000',
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

export default SwipeableFeedContainer; 