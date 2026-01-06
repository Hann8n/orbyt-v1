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
  Text,
  StyleSheet,
  Dimensions,
  StatusBar,
  Pressable,
  type NativeSyntheticEvent,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { Colors } from '../../ui/UI';
import FeedRenderer from './FeedRenderer';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
import { isSmallScreen, isTablet } from '../../../utils/device/screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVisibilityTabIsActive } from '../../../core/visibility';
import type { ListFeedViewRef } from '../../../types';
import type { ScrollToTopRef } from '../../../utils/navigation/tabRefs';

// Import FeedOption type
import type { FeedOption } from '../../../types';

// Hardcoded feed options - only 'following' and 'your-mix'
const FEED_LABELS: { [key: string]: string } = {
  following: 'following',
  'your-mix': 'your mix',
};

const ADD_SQUARE_FILL_ICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><title>add_square_fill</title><g id="add_square_fill" fill='none' fill-rule='evenodd'><path d='M24 0v24H0V0zM12.594 23.258l-.012.002-.071.035-.02.004-.014-.004-.071-.036c-.01-.003-.019 0-.024.006l-.004.01-.017.428.005.02.01.013.104.074.015.004.012-.004.104-.074.012-.016.004-.017-.017-.427c-.002-.01-.009-.017-.016-.018m.264-.113-.014.002-.184.093-.01.01-.003.011.018.43.005.012.008.008.201.092c.012.004.023 0 .029-.008l.004-.014-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014-.034.614c0 .012.007.02.017.024l.015-.002.201-.093.01-.008.003-.011.018-.43-.003-.012-.01-.01z'/><path fill='#FFFFFF' d='M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm4 7a1 1 0 0 1 1-1h3V8a1 1 0 1 1 2 0v3h3a1 1 0 1 1 0 2h-3v3a1 1 0 1 1-2 0v-3H8a1 1 0 0 1-1-1'/></g></svg>`;

interface SwipeableFeedContainerProps {
  initialFeed?: FeedOption;
  onFeedChange?: (feed: FeedOption) => void;
  isRefreshing?: boolean;
  forceError?: boolean; // Add debug flag to force error responses
  applySafeArea?: boolean;
  // Optional override for indicator text size (used by Home screen)
  indicatorFontSize?: number;
}

const SwipeableFeedContainer = memo(
  forwardRef<ScrollToTopRef, SwipeableFeedContainerProps>(
    (
      {
        initialFeed = 'following',
        onFeedChange,
        isRefreshing = false,
        forceError = false, // Add debug flag to force error responses
        applySafeArea = false,
        indicatorFontSize,
      },
      ref
    ) => {
      const pagerViewRef = useRef<PagerView>(null);
      // Refs to FeedRenderer instances, keyed by feedOption
      const feedRendererRefs = useRef<{ [key: string]: ListFeedViewRef | null }>({});
      const insets = useSafeAreaInsets();
      const isTabActive = useVisibilityTabIsActive('index');
      const router = useRouter();

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

      // Animation values for feed bar visibility and transitions - using Reanimated for UI thread
      const feedBarOpacity = useSharedValue(1);
      const feedBarTranslateY = useSharedValue(0);
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
      }, [hasAppliedInitialIndexRef.current, feedOptions.length, pendingInitialIndex]);

      // Animated style for feed bar - runs on UI thread
      const feedBarAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        return {
          opacity: feedBarOpacity.value,
          transform: [{ translateY: feedBarTranslateY.value }],
        };
      });

      // Animate feed bar visibility - runs on UI thread with Reanimated
      const animateFeedBar = useCallback(
        (visible: boolean, immediate: boolean = false) => {
          if (visible === isFeedBarVisible) return;

          setIsFeedBarVisible(visible);

          const toValue = visible ? 1 : 0;
          const translateYValue = visible ? 0 : -50;

          if (immediate) {
            feedBarOpacity.value = toValue;
            feedBarTranslateY.value = translateYValue;
          } else {
            feedBarOpacity.value = withTiming(toValue, {
              duration: 300,
              easing: Easing.out(Easing.ease),
            });
            feedBarTranslateY.value = withTiming(translateYValue, {
              duration: 300,
              easing: Easing.out(Easing.ease),
            });
          }
        },
        [isFeedBarVisible, feedBarOpacity, feedBarTranslateY]
      );

      // Ensure feed bar is visible when feed changes
      useEffect(() => {
        animateFeedBar(true, true);
      }, [currentFeedIndex, animateFeedBar]);

      // Handle page change from PagerView - final confirmation after transition completes
      const handlePageSelected = useCallback(
        (event: NativeSyntheticEvent<{ position: number }>) => {
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
        },
        [feedOptions, onFeedChange]
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

      // Handle page scroll from PagerView - update visibility and indicator immediately during scroll
      const handlePageScroll = useCallback(
        (event: NativeSyntheticEvent<{ position: number; offset: number }>) => {
          const { position, offset } = event.nativeEvent;
          const progress = position + offset;
          const roundedPosition = Math.round(progress);

          // Update refs immediately for calculations
          pageScrollProgress.current = progress;

          // Update visibility immediately during scroll (not waiting for onPageSelected)
          // This makes feeds visible/hidden in real-time as user swipes
          if (
            roundedPosition !== currentPageRef.current &&
            roundedPosition >= 0 &&
            roundedPosition < feedOptions.length
          ) {
            currentPageRef.current = roundedPosition;
            setCurrentFeedIndex(roundedPosition);
          }

          // Update indicator progress for smooth animation
          setIndicatorScrollProgress(progress);

          // Show feed bar during scrolling
          animateFeedBar(true);
        },
        [animateFeedBar, feedOptions.length]
      );

      // Handle scroll state changes from PagerView
      const handlePageScrollStateChanged = useCallback(() => {
        // Feed bar stays visible, no special handling needed
      }, []);

      // Handle feed indicator tap
      const handleIndicatorTap = useCallback(
        (feedOption: FeedOption) => {
          const targetIndex = feedOptions.findIndex(option => option === feedOption);
          if (targetIndex >= 0) {
            pagerViewRef.current?.setPage(targetIndex);
            // Show feed bar immediately when tapping indicator
            animateFeedBar(true, true);
          }
        },
        [feedOptions, animateFeedBar]
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
        if (typeof indicatorFontSize === 'number' && indicatorFontSize > 0)
          return indicatorFontSize;
        if (isTablet()) return 20;
        if (isSmallScreen()) return 16;
        const minDimension = Math.min(screenWidth, screenHeight);
        if (minDimension >= 420) return 18; // large phones/phablets
        return 16;
      }, [screenWidth, screenHeight, indicatorFontSize]);

      // Render individual feed with comprehensive memoization
      // Visibility uses currentFeedIndex state (synced with PagerView's page tracking)
      const renderFeed = useCallback(
        ({ item: feedOption, index }: { item: FeedOption; index: number }) => {
          // Use state for visibility - triggers re-render when page changes (synced with PagerView via handlePageSelected)
          const isVisible = isTabActive && index === currentFeedIndex;
          const isNeighbor = isTabActive && Math.abs(currentFeedIndex - index) === 1;

          return (
            <FeedRenderer
              key={feedOption} // Stable key - never changes to preserve scroll position
              ref={r => {
                feedRendererRefs.current[feedOption] = r;
              }}
              feedOption={String(feedOption)}
              onRetryFeed={handleRetryFeed}
              queryOptions={baseQueryOptions}
              // Pass visibility state to control video playback and fetching - consistent with ListFeedView
              // When feed becomes visible, isVisible changes trigger visibility detection in ListFeedView
              // FlashList's maintainVisibleContentPosition preserves scroll position
              isVisible={isVisible}
              isRefreshing={isRefreshing}
              forceError={forceError}
              shouldPrefetch={isNeighbor}
              visibilityKey={feedOption}
            />
          );
        },
        [currentFeedIndex, handleRetryFeed, baseQueryOptions, isTabActive, isRefreshing, forceError]
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

      // Get indicator style using PagerView's scroll progress directly from SDK
      const getIndicatorStyle = useCallback(
        (feedOption: FeedOption) => {
          const feedIndex = feedOptions.findIndex(option => option === feedOption);
          const isActive = feedOption === currentFeedOption;

          // Use state directly for smooth real-time updates during scroll (not ref)
          const baseProgress = hasAppliedInitialIndexRef.current
            ? indicatorScrollProgress
            : feedOptions.findIndex(option => option === initialFeed) >= 0
              ? feedOptions.findIndex(option => option === initialFeed)
              : 0;

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
        },
        [
          currentFeedOption,
          feedOptions,
          initialFeed,
          indicatorBaseFontSize,
          indicatorScrollProgress,
        ]
      );

      return (
        <GestureHandlerRootView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor={Colors.black} />

          {/* Feed Indicators - animated using Reanimated for UI thread performance */}
          <Animated.View
            style={[
              styles.feedSwitcher,
              {
                top: applySafeArea ? 12 + insets.top : 12,
              },
              feedBarAnimatedStyle,
            ]}
          >
            <View style={styles.indicatorContainer}>
              <View style={styles.feedIndicators}>
                {feedOptions.map(feedOption => (
                  <Pressable
                    key={feedOption}
                    onPress={() => handleIndicatorTap(feedOption)}
                    style={styles.indicatorItem}
                  >
                    <Text style={getIndicatorStyle(feedOption)}>
                      {FEED_LABELS[feedOption] || feedOption}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => router.push('/create')} style={styles.createButton}>
                <SvgXml xml={ADD_SQUARE_FILL_ICON_SVG} width={24} height={24} />
              </Pressable>
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
    }
  )
);

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
    justifyContent: 'space-between',
  },
  feedIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicatorItem: {
    paddingHorizontal: 4, // Reduced from 8 to 4 for tighter spacing
  },
  createButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
const areEqual = (
  prevProps: SwipeableFeedContainerProps,
  nextProps: SwipeableFeedContainerProps
) => {
  // Critical props that affect visibility and performance
  if (prevProps.initialFeed !== nextProps.initialFeed) return false;
  if (prevProps.isRefreshing !== nextProps.isRefreshing) return false;
  if (prevProps.forceError !== nextProps.forceError) return false;
  if (prevProps.applySafeArea !== nextProps.applySafeArea) return false;
  if (prevProps.indicatorFontSize !== nextProps.indicatorFontSize) return false;

  return true;
};

const MemoizedSwipeableFeedContainer = memo(SwipeableFeedContainer, areEqual);
export default MemoizedSwipeableFeedContainer;
