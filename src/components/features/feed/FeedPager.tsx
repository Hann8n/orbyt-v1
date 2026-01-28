import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
  useLayoutEffect,
  memo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { Colors } from '../../ui/UI';
import FeedRenderer from './FeedRenderer';
import { useWindowDimensions } from 'react-native';
import * as Device from 'expo-device';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListFeedViewRef } from '../../../types';
import type { ScrollToTopRef } from '../../../utils/navigation/tabRefs';
import { useFeedSettings } from '../../../stores/userStore';
import {
  useSetTabBarVisibility,
  useTabBarVisibility,
  useSetOverlayVisibility,
} from '../../../context/FeedIndicatorContext';

// Define the feed options type
export type FeedOption = string;

// Hardcoded feed options - only 'following' and 'your-mix'
const FEED_LABELS: { [key: string]: string } = {
  following: 'following',
  'your-mix': 'your mix',
};

const CAMERA_2_FILL_ICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='2 2 20 20'><g fill='none'><path fill='#f3f5fe' d='M14.793 3a1.5 1.5 0 0 1 .95.34l.11.1L17.415 5H20a2 2 0 0 1 1.995 1.85L22 7v12a2 2 0 0 1-1.85 1.995L20 21H4a2 2 0 0 1-1.995-1.85L2 19V7a2 2 0 0 1 1.85-1.995L4 5h2.586l1.56-1.56a1.5 1.5 0 0 1 .913-.433L9.207 3zM12 7.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6'/></g></svg>`;

interface FeedPagerProps {
  initialFeed?: FeedOption;
  onFeedChange?: (feed: FeedOption) => void;
  isRefreshing?: boolean;
  forceError?: boolean; // Add debug flag to force error responses
  applySafeArea?: boolean;
  // Optional override for indicator text size (used by Home screen)
  indicatorFontSize?: number;
}

interface FeedIndicatorItemProps {
  feedIndex: number;
  indicatorBaseFontSize: number;
  pageScrollProgress: SharedValue<number>;
  label: string;
  onPress: () => void;
  pressableStyle?: StyleProp<ViewStyle>;
}

const FeedIndicatorItem = memo(function FeedIndicatorItem({
  feedIndex,
  indicatorBaseFontSize,
  pageScrollProgress,
  label,
  onPress,
  pressableStyle,
}: FeedIndicatorItemProps) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const baseProgress = pageScrollProgress.value;
    const isActive = Math.round(baseProgress) === feedIndex;
    const distance = Math.abs(baseProgress - feedIndex);
    const opacity = isActive ? 1 : Math.max(0.3, 1 - distance * 0.4);
    const color = isActive ? Colors.white : 'rgba(255, 255, 255, 0.75)';
    return {
      color,
      fontSize: indicatorBaseFontSize,
      marginRight: 8,
      fontFamily: 'Figtree-Black',
      opacity,
    };
  }, [feedIndex, indicatorBaseFontSize]);

  return (
    <Pressable onPress={onPress} style={pressableStyle}>
      <Animated.Text style={animatedStyle}>{label}</Animated.Text>
    </Pressable>
  );
});

const FeedPager = forwardRef<ScrollToTopRef, FeedPagerProps>(function FeedPager(
  {
    initialFeed = 'following',
    onFeedChange,
    isRefreshing = false,
    forceError = false,
    applySafeArea = false,
    indicatorFontSize,
  },
  ref
) {
  const { width, height } = useWindowDimensions();
  const isTablet = Device.deviceType === Device.DeviceType.TABLET || Math.min(width, height) >= 600;
  const isSmallScreen = width <= 375 || height <= 667;
  const pagerViewRef = useRef<PagerView>(null);
  // Refs to FeedRenderer instances, keyed by feedOption
  const feedRendererRefs = useRef<{ [key: string]: ListFeedViewRef | null }>({});
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { nativeTabsEnabled } = useFeedSettings();
  const setTabBarVisibility = useSetTabBarVisibility();
  const setOverlayVisibility = useSetOverlayVisibility();
  const tabBarVisibility = useTabBarVisibility();

  const showBarAndOverlay = useCallback(() => {
    setTabBarVisibility(1);
    setOverlayVisibility(1);
  }, [setTabBarVisibility, setOverlayVisibility]);

  // Memoized screen dimensions handling
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('window'));
  const { screenWidth, screenHeight } = useMemo(
    () => ({
      screenWidth: screenDims.width,
      screenHeight: screenDims.height,
    }),
    [screenDims.width, screenDims.height]
  );

  // Listen for orientation/screen size changes
  useEffect(() => {
    const onChange = ({
      window,
    }: {
      window: { width: number; height: number; scale: number; fontScale: number };
    }) => {
      setScreenDims(window);
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => {
      sub?.remove();
    };
  }, []);

  // State for current feed
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const [feedRetries, setFeedRetries] = useState<{ [key in FeedOption]?: number }>({});

  // Animation values for feed bar vertical transition - using Reanimated for UI thread
  const feedBarTranslateY = useSharedValue(0);
  const [isFeedBarVisible, setIsFeedBarVisible] = useState(true);

  // Use PagerView's page tracking directly - updated via onPageSelected
  const currentPageRef = useRef(0);
  // Track scroll progress from PagerView's native onPageScroll - Reanimated shared value for UI thread.
  // FeedIndicatorItem reads it via useAnimatedStyle (no setState on onPageScroll).
  const pageScrollProgress = useSharedValue(0);

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
      // Reanimated shared value update

      pageScrollProgress.value = targetIndex;

      onFeedChange?.(feedOptions[targetIndex]);

      // Ensure the PagerView starts on the desired initial index
      requestAnimationFrame(() => {
        pagerViewRef.current?.setPage(targetIndex);
      });

      hasAppliedInitialIndexRef.current = true;
    }
    // pageScrollProgress is a shared value - not needed in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedOptions, initialFeed, onFeedChange]);

  // Compute current feed option using PagerView's tracked page
  const pendingInitialIndex = feedOptions.findIndex(option => option === initialFeed);
  const activePageIndex = hasAppliedInitialIndexRef.current
    ? currentPageRef.current
    : pendingInitialIndex >= 0
      ? pendingInitialIndex
      : 0;
  const currentFeedOption = feedOptions[activePageIndex] || feedOptions[0] || 'following';

  // Ensure PagerView renders the correct initial index on the first paint when items are available
  const initialPageIndex = useMemo(() => {
    if (hasAppliedInitialIndexRef.current) {
      return Math.max(0, Math.min(currentPageRef.current, Math.max(0, feedOptions.length - 1)));
    }
    if (feedOptions.length > 0) {
      return pendingInitialIndex >= 0 ? pendingInitialIndex : 0;
    }
    return 0;
    // hasAppliedInitialIndexRef.current is a ref - not a valid dependency
  }, [feedOptions.length, pendingInitialIndex]);

  // Animated style for feed bar - runs on UI thread
  const feedBarAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateY: feedBarTranslateY.value }],
    };
  });

  // Shared controls visibility (tab bar + camera button) driven by vertical scroll
  // Use shared value directly from context - no sync needed
  const controlsAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: withTiming(tabBarVisibility.value, {
        duration: 200,
        easing: Easing.out(Easing.ease),
      }),
    };
  });

  // Animate feed bar visibility - runs on UI thread with Reanimated
  const animateFeedBar = useCallback(
    (visible: boolean, immediate: boolean = false) => {
      if (visible === isFeedBarVisible) return;

      setIsFeedBarVisible(visible);

      const translateYValue = visible ? 0 : -50;

      if (immediate) {
        // Reanimated shared value update

        feedBarTranslateY.value = translateYValue;
      } else {
        feedBarTranslateY.value = withTiming(translateYValue, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        });
      }
    },
    [isFeedBarVisible, feedBarTranslateY]
  );

  // Ensure overlay is visible when feed changes
  useEffect(() => {
    if (hasAppliedInitialIndexRef.current) {
      animateFeedBar(true, true);
      showBarAndOverlay();
    }
  }, [currentFeedIndex, animateFeedBar, showBarAndOverlay]);

  // Ensure controls are visible when pager mounts
  useEffect(() => {
    showBarAndOverlay();
  }, [showBarAndOverlay]);

  // Handle page change from PagerView - final confirmation after transition completes
  const handlePageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      if (!hasAppliedInitialIndexRef.current) return;

      const nextIndex = event.nativeEvent.position;
      const prevIndex = currentPageRef.current;

      // Ensure refs are in sync (should already be updated by onPageScroll, but confirm)
      if (nextIndex !== prevIndex) {
        currentPageRef.current = nextIndex;

        pageScrollProgress.value = nextIndex;
        setCurrentFeedIndex(nextIndex);

        // Reset scroll tracking and reengage overlay when switching feeds
        lastScrollYRef.current = 0;
        animateFeedBar(true, true);
        showBarAndOverlay();
      }

      // Notify parent of feed change (only on final selection, not during scroll)
      const newFeedOption = feedOptions[nextIndex];
      if (newFeedOption && nextIndex !== prevIndex) {
        onFeedChange?.(newFeedOption);
      }
    },
    // pageScrollProgress is a shared value - not needed in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedOptions, onFeedChange, animateFeedBar, showBarAndOverlay]
  );

  // Handle retry for each feed
  const handleRetryFeed = useCallback(() => {
    const currentRetries = feedRetries[currentFeedOption] || 0;
    setFeedRetries(prev => ({
      ...prev,
      [currentFeedOption]: currentRetries + 1,
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

  // Handle page scroll from PagerView - use native props directly
  const handlePageScroll = useCallback(
    (event: { nativeEvent: { position: number; offset: number } }) => {
      const { position, offset } = event.nativeEvent;
      const progress = position + offset;
      const roundedPosition = Math.round(progress);

      // Update shared value directly from native event

      pageScrollProgress.value = progress;

      // Update visibility immediately during scroll
      if (
        roundedPosition !== currentPageRef.current &&
        roundedPosition >= 0 &&
        roundedPosition < feedOptions.length
      ) {
        currentPageRef.current = roundedPosition;
        setCurrentFeedIndex(roundedPosition);
      }

      // Show overlay during pager scroll
      animateFeedBar(true);
      showBarAndOverlay();
    },
    [animateFeedBar, feedOptions.length, pageScrollProgress, showBarAndOverlay]
  );

  // Use FlashList native scroll directly - simple threshold-based visibility
  const lastScrollYRef = useRef(0);
  const handleVerticalScroll = useCallback(
    (scrollY: number) => {
      const lastY = lastScrollYRef.current;
      const delta = scrollY - lastY;

      // Only update if scroll changed significantly (threshold of 10px)
      if (Math.abs(delta) < 10) {
        return;
      }

      lastScrollYRef.current = scrollY;

      // Simple rule: hide if scrolling down, show if scrolling up or near top
      const shouldHide = delta > 0 && scrollY > 50;
      setTabBarVisibility(shouldHide ? 0 : 1);
    },
    [setTabBarVisibility]
  );

  // Handle feed indicator tap
  const handleIndicatorTap = useCallback(
    (feedOption: FeedOption) => {
      const targetIndex = feedOptions.findIndex(option => option === feedOption);
      if (targetIndex >= 0 && targetIndex !== currentPageRef.current) {
        pagerViewRef.current?.setPage(targetIndex);
        // Reset scroll tracking and reengage overlay immediately when tapping indicator
        lastScrollYRef.current = 0;
        animateFeedBar(true, true);
        showBarAndOverlay();
      }
    },
    [feedOptions, animateFeedBar, showBarAndOverlay]
  );

  // Memoized query options for feed rendering
  const baseQueryOptions = useMemo(
    () => ({
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    }),
    []
  );

  // Optimized feed page styles - consistent with ListFeedView
  const feedPageStyle = useMemo(
    () => ({
      ...styles.feedPage,
      width: screenWidth,
      height: '100%' as const,
    }),
    [screenWidth]
  );

  // Dynamic base font size for channel indicators based on screen size
  const indicatorBaseFontSize = useMemo(() => {
    if (typeof indicatorFontSize === 'number' && indicatorFontSize > 0) return indicatorFontSize;
    if (isTablet) return 20;
    if (isSmallScreen) return 16;
    const minDimension = Math.min(screenWidth, screenHeight);
    if (minDimension >= 420) return 18; // large phones/phablets
    return 16;
  }, [screenWidth, screenHeight, indicatorFontSize, isTablet, isSmallScreen]);

  const feedSwitcherTopStyle = useMemo(
    () => ({ top: applySafeArea ? 12 + insets.top : 12 }),
    [applySafeArea, insets.top]
  );

  // Both feeds render side-by-side; each keeps its own scroll and cursor (fully independent).
  const renderFeed = useCallback(
    ({ item: feedOption, index }: { item: FeedOption; index: number }) => (
      <FeedRenderer
        ref={r => {
          feedRendererRefs.current[feedOption] = r;
        }}
        feedOption={String(feedOption)}
        onRetryFeed={handleRetryFeed}
        queryOptions={baseQueryOptions}
        isVisible={index === currentFeedIndex}
        isRefreshing={isRefreshing}
        forceError={forceError}
        onVerticalScroll={handleVerticalScroll}
      />
    ),
    [
      currentFeedIndex,
      handleRetryFeed,
      baseQueryOptions,
      isRefreshing,
      forceError,
      handleVerticalScroll,
    ]
  );

  // Expose scrollToTop method
  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        // Get current active feed option
        const activePageIndex = currentPageRef.current;
        const currentFeedOption = feedOptions[activePageIndex] || feedOptions[0] || 'following';
        // Scroll the current active feed to top
        feedRendererRefs.current[currentFeedOption]?.scrollToTop();
      },
    }),
    [feedOptions]
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.black} />

      {/* Feed Indicators & camera button - animated using Reanimated for UI thread performance */}
      <Animated.View
        style={[
          styles.feedSwitcher,
          feedSwitcherTopStyle,
          feedBarAnimatedStyle,
          controlsAnimatedStyle,
        ]}
      >
        <View style={styles.indicatorContainer}>
          <View style={styles.feedIndicators}>
            {feedOptions.map((feedOption, index) => (
              <FeedIndicatorItem
                key={feedOption}
                feedIndex={index}
                indicatorBaseFontSize={indicatorBaseFontSize}
                pageScrollProgress={pageScrollProgress}
                label={FEED_LABELS[feedOption] || feedOption}
                onPress={() => handleIndicatorTap(feedOption)}
                pressableStyle={styles.indicatorItem}
              />
            ))}
          </View>
          {nativeTabsEnabled && (
            <Pressable
              onPress={() => {
                router.push('/create');
              }}
              style={styles.createButton}
            >
              <SvgXml xml={CAMERA_2_FILL_ICON_SVG} width={24} height={24} />
            </Pressable>
          )}
        </View>
      </Animated.View>

      {/* PagerView for feeds with optimized gesture handling */}
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
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
    backgroundColor: Colors.transparent,
    // Opacity is controlled by controlsAnimatedStyle
  },
  indicatorContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2, // Android
  },
  indicatorItem: {
    paddingHorizontal: 4, // Reduced from 8 to 4 for tighter spacing
  },
  createButton: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2, // Android
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
const areEqual = (prevProps: FeedPagerProps, nextProps: FeedPagerProps) => {
  // Critical props that affect visibility and performance
  if (prevProps.initialFeed !== nextProps.initialFeed) return false;
  if (prevProps.isRefreshing !== nextProps.isRefreshing) return false;
  if (prevProps.forceError !== nextProps.forceError) return false;
  if (prevProps.applySafeArea !== nextProps.applySafeArea) return false;
  if (prevProps.indicatorFontSize !== nextProps.indicatorFontSize) return false;

  return true;
};

export default memo(FeedPager, areEqual);
