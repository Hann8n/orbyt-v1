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
  Image,
  ViewToken,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../../ui/UI';
import { Icon, Avatar } from '../../ui/UI';
import FeedRenderer from './FeedRenderer';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
import { isSmallScreen, isTablet } from '../../../utils/helpers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BORDER_RADIUS } from '../../../utils/constants';
import { useRouter } from 'expo-router';

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
  // Optional override for indicator text size (used by Home screen)
  indicatorFontSize?: number;
  isRouteFocused?: boolean;
}

const SwipeableFeedContainer: React.FC<SwipeableFeedContainerProps> = memo(({
  initialFeed = 'yourMix',
  onFeedChange,
  isRefreshing = false,
  forceError = false, // Add debug flag to force error responses
  applySafeArea = false,
  indicatorFontSize,
  isRouteFocused = true,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const indicatorScrollViewRef = useRef<any>(null);
  const { subscribedChannels, getAvailableDefaultChannels, restoreDefaultChannel } = useSubscribedChannels();
  const isSmallDevice = isSmallScreen() || isTablet();
  const insets = useSafeAreaInsets();
  const navigation = useRouter();



  
  // State for available default channels
  const [availableDefaultChannels, setAvailableDefaultChannels] = useState<any[]>([]);

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

  const feedViewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 80,
    minimumViewTime: 120,
  }).current;

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

  // Handle feed change
  const handleFeedChange = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < feedOptions.length) {
      setCurrentFeedIndex(newIndex);
      currentFeedIndexRef.current = newIndex;
      currentScrollProgressRef.current = newIndex;
      setCurrentScrollProgress(newIndex);
      const newFeedOption = feedOptions[newIndex];
      onFeedChange?.(newFeedOption);
      scrollIndicatorToActive(newIndex);
    }
  }, [feedOptions, onFeedChange, scrollIndicatorToActive]);

  const handleFeedChangeRef = useRef(handleFeedChange);
  useEffect(() => {
    handleFeedChangeRef.current = handleFeedChange;
  }, [handleFeedChange]);

  const onViewableFeedsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    if (!hasAppliedInitialIndexRef.current) return;

    const firstVisible = viewableItems.find(item => item.isViewable && typeof item.index === 'number');
    if (!firstVisible || typeof firstVisible.index !== 'number') {
      return;
    }

    const nextIndex = firstVisible.index;
    if (nextIndex === currentFeedIndexRef.current) {
      return;
    }

    handleFeedChangeRef.current(nextIndex);
  }).current;

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

  // Handle restoring default channel
  const handleRestoreDefaultChannel = useCallback(async (channelUri: string) => {
    try {
      await restoreDefaultChannel(channelUri);
      // Refresh available defaults
      const defaults = await getAvailableDefaultChannels();
      setAvailableDefaultChannels(defaults);
    } catch (error) {
    }
  }, [restoreDefaultChannel, getAvailableDefaultChannels]);

  // Handle explore button press
  const handleExplorePress = useCallback(() => {
    navigation.push('/explore');
  }, [navigation]);

  // Ensure current feed index stays in range when options change
  useEffect(() => {
    if (feedOptions.length === 0) return;
    if (currentFeedIndex >= feedOptions.length) {
      const lastIndex = Math.max(0, feedOptions.length - 1);
      setCurrentFeedIndex(lastIndex);
      currentFeedIndexRef.current = lastIndex;
    }
  }, [feedOptions, currentFeedIndex]);

  // Load available default channels when no channels are subscribed
  useEffect(() => {
    const loadAvailableDefaults = async () => {
      if (subscribedChannels.length === 0) {
        try {
          const defaults = await getAvailableDefaultChannels();
          setAvailableDefaultChannels(defaults);
        } catch (error) {
        }
      } else {
        setAvailableDefaultChannels([]);
      }
    };
    loadAvailableDefaults();
  }, [subscribedChannels.length, getAvailableDefaultChannels]);

  // Optimized horizontal scroll handler with improved responsiveness
  const scrollUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Debounce progress updates so indicator responds smoothly without spamming renders
    if (scrollUpdateTimeoutRef.current) {
      clearTimeout(scrollUpdateTimeoutRef.current);
    }

    scrollUpdateTimeoutRef.current = setTimeout(() => {
      setCurrentScrollProgress(progress);
    }, 16);
  }, [animateFeedBar, horizontalScrollOffset, screenWidth]);

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
  const renderFeed = useCallback(({ item: feedOption, index }: { item: FeedOption; index: number }) => {
    const isVisible = isRouteFocused && index === currentFeedIndex;
    const isNeighbor = isRouteFocused && Math.abs(currentFeedIndex - index) === 1;
    
    return (
      <View style={feedPageStyle}> 
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
          visibilityKey={`feed:${String(feedOption)}`}
        />
      </View>
    );
  }, [
    currentFeedIndex,
    feedPageStyle,
    handleRetryFeed,
    handlePositionChange,
    savedPositions,
    baseQueryOptions,
    isRouteFocused,
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

  // Render empty state when no channels are subscribed
  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Image 
        source={require('../../../assets/tv_static.gif')} 
        style={styles.tvStaticGif}
        resizeMode="contain"
      />
      <Text style={styles.emptyTitle}>No channels yet</Text>
      <Text style={styles.emptySubtitle}>Explore channels to subscribe to them</Text>
      <TouchableOpacity
        style={styles.exploreButton}
        onPress={handleExplorePress}
        activeOpacity={0.7}
      >
        <Text style={styles.exploreButtonText}>Explore Channels</Text>
      </TouchableOpacity>
      
      {availableDefaultChannels.length > 0 && (
        <View style={styles.defaultChannelsContainer}>
          <Text style={styles.defaultChannelsTitle}>Default Channels</Text>
          {availableDefaultChannels.map((channel) => (
            <TouchableOpacity
              key={channel.uri}
              style={styles.defaultChannelItem}
              onPress={() => handleRestoreDefaultChannel(channel.uri)}
              activeOpacity={0.7}
            >
              <Avatar 
                uri={channel.avatar} 
                type="channel" 
                size={40} 
                ringColor="transparent" 
                style={styles.defaultChannelAvatar}
                fallbackIcon={channel.uri === 'following' ? 'users' : channel.uri === 'yourMix' ? 'shuffle' : 'tv'}
                fallbackIconSize={24}
                fallbackIconColor={channel.uri === 'following' ? '#FFFFFF' : channel.uri === 'yourMix' ? '#FFFFFF' : Colors.lightGray}
                profileColors={channel.uri === 'following' ? { backgroundColor: '#3B82F6', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' } : channel.uri === 'yourMix' ? { backgroundColor: '#10B981', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' } : undefined}
              />
              <View style={styles.defaultChannelContent}>
                <Text style={styles.defaultChannelName}>{channel.displayName}</Text>
              </View>
              <View style={styles.defaultChannelActionButtons}>
                <TouchableOpacity
                  style={styles.defaultChannelRestoreButton}
                  onPress={() => handleRestoreDefaultChannel(channel.uri)}
                  activeOpacity={0.7}
                >
                  <Icon name="plus" size={16} color={Colors.green} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  ), [availableDefaultChannels, handleRestoreDefaultChannel, handleExplorePress]);

  // Show empty state if no channels are subscribed
  if (feedOptions.length === 0) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
        {renderEmptyState()}
      </GestureHandlerRootView>
    );
  }

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
        onViewableItemsChanged={onViewableFeedsChanged}
        viewabilityConfig={feedViewabilityConfig}
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 20,
  },
  tvStaticGif: {
    width: 120,
    height: 120,
    marginBottom: 24,
    opacity: 0.8,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontFamily: 'Firma-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  exploreButton: {
    backgroundColor: Colors.white,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  exploreButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
  defaultChannelsContainer: {
    width: '100%',
    maxWidth: 400,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  defaultChannelsTitle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  defaultChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.MEDIUM,
    width: '100%',
    justifyContent: 'center',
  },
  defaultChannelAvatar: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  defaultChannelContent: {
    flex: 1,
    justifyContent: 'center',
  },
  defaultChannelName: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  defaultChannelActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  defaultChannelRestoreButton: {
    padding: 8,
    backgroundColor: Colors.darkGreen,
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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