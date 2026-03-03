import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
  memo,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import {
  View,
  StyleSheet,
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
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { Colors } from '../../../theme';
import FeedRenderer from './FeedRenderer';
import { useDeviceLayout } from '../../../hooks/useDeviceLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListFeedViewRef } from '../../../types';
import type { ProfileRef } from '../../../utils/navigation/tabRefs';
import { useFeedSettings } from '../../../stores/userStore';
import {
  useSetTabBarVisibility,
  useTabBarVisibility,
  useSetOverlayVisibility,
} from '../../../context/FeedIndicatorContext';

// Define the feed options type
export type FeedOption = string;

// Default feed options and labels for home screen
const DEFAULT_FEED_OPTIONS: FeedOption[] = ['following', 'your-mix'];
const FEED_LABELS: { [key: string]: string } = {
  following: 'following',
  'your-mix': 'your mix',
  profile: 'videos',
  reposts: 'reposts',
  likes: 'likes',
};

// SVG uses Orbyt White for the camera icon fill (matches Colors.neutral[50] / Colors.neutral[50])
const CAMERA_2_FILL_ICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='2 2 20 20'><g fill='none'><path fill='#f3f5fe' d='M14.793 3a1.5 1.5 0 0 1 .95.34l.11.1L17.415 5H20a2 2 0 0 1 1.995 1.85L22 7v12a2 2 0 0 1-1.85 1.995L20 21H4a2 2 0 0 1-1.995-1.85L2 19V7a2 2 0 0 1 1.85-1.995L4 5h2.586l1.56-1.56a1.5 1.5 0 0 1 .913-.433L9.207 3zM12 7.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6'/></g></svg>`;

// Pass-through props for FeedRenderer when using custom feedOptions (e.g. profile)
interface FeedPagerRendererProps {
  headerComponent?: ReactNode;
  backgroundColor?: string;
  secondaryColor?: string;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  /** When provided, the visible list writes scroll progress (0..1) here on UI thread for overlay fade. */
  contentScrollProgressOutput?: SharedValue<number>;
  queryOptions?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnMount?: boolean;
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
    refetchInterval?: number | false;
    refetchIntervalInBackground?: boolean;
  };
  isVisible?: boolean;
  isModal?: boolean;
  /** When false, do not render FeedPager's default StatusBar (for screens that manage it themselves). */
  controlStatusBar?: boolean;
}

interface FeedPagerProps extends FeedPagerRendererProps {
  initialFeed?: FeedOption;
  /** When provided, use these feeds instead of default following/your-mix (e.g. profile/reposts/likes) */
  feedOptions?: FeedOption[];
  /** Custom labels for feed indicator; when missing uses FEED_LABELS */
  feedLabels?: { [key: string]: string };
  /** Passed to each FeedRenderer when using profile-style feeds */
  userDid?: string;
  onFeedChange?: (feed: FeedOption) => void;
  /** Controlled feed: when provided, pager syncs page to this feed (e.g. profile tab tap) */
  currentFeed?: FeedOption;
  forceError?: boolean;
  applySafeArea?: boolean;
  indicatorFontSize?: number;
  /** When false, hide the top feed indicator bar (profile uses TabNavigation in header) */
  showFeedIndicator?: boolean;
  /** When false, disables swipe and uses instant page changes (no animation). Default true. */
  scrollEnabled?: boolean;
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
    const color = isActive ? Colors.neutral[50] : Colors.overlay.white80;
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

const FeedPager = forwardRef<ProfileRef, FeedPagerProps>(function FeedPager(
  {
    initialFeed = 'following',
    feedOptions: feedOptionsProp,
    feedLabels: feedLabelsProp,
    userDid,
    currentFeed,
    onFeedChange,
    forceError = false,
    applySafeArea = false,
    indicatorFontSize,
    showFeedIndicator = true,
    scrollEnabled = true,
    headerComponent,
    backgroundColor,
    secondaryColor,
    viewMode,
    onViewModeChange,
    contentScrollProgressOutput,
    queryOptions: queryOptionsProp,
    isVisible = true,
    isModal = false,
    controlStatusBar = true,
  },
  ref
) {
  const {
    screenWidth: width,
    screenHeight: height,
    isTablet,
    isSmallPhone: isSmallScreen,
  } = useDeviceLayout();
  const pagerViewRef = useRef<PagerView>(null);
  const feedRendererRefs = useRef<{ [key: string]: ListFeedViewRef | null }>({});
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { nativeTabsEnabled } = useFeedSettings();
  const setTabBarVisibility = useSetTabBarVisibility();
  const setOverlayVisibility = useSetOverlayVisibility();
  const tabBarVisibility = useTabBarVisibility();

  const feedOptions = useMemo(() => feedOptionsProp ?? DEFAULT_FEED_OPTIONS, [feedOptionsProp]);

  const showBarAndOverlay = useCallback(() => {
    setTabBarVisibility(1);
    setOverlayVisibility(1);
  }, [setTabBarVisibility, setOverlayVisibility]);

  // Animation values for feed bar vertical transition - using Reanimated for UI thread
  const feedBarTranslateY = useSharedValue(0);
  const [isFeedBarVisible, setIsFeedBarVisible] = useState(true);

  // Same as PagerView's initialPage – single source of truth for "which page we're on" at mount.
  const initialPageIndex = useMemo(() => {
    const feed = currentFeed ?? initialFeed;
    const initialIndex = feedOptions.findIndex(option => option === feed);
    return initialIndex >= 0 ? initialIndex : 0;
  }, [feedOptions, initialFeed, currentFeed]);

  // Must match initialPage: native PagerView does not fire onPageSelected for the initial page.
  const pageScrollProgress = useSharedValue(initialPageIndex);

  const setPagerPage = useCallback(
    (index: number) => {
      if (index < 0 || !pagerViewRef.current) return;
      if (scrollEnabled) pagerViewRef.current.setPage(index);
      else pagerViewRef.current.setPageWithoutAnimation(index);
      pageScrollProgress.value = index;
    },
    [scrollEnabled, pageScrollProgress]
  );

  // Sync controlled currentFeed -> pager page (handles store hydration and programmatic changes)
  useEffect(() => {
    if (currentFeed == null) return;
    const index = feedOptions.findIndex(option => option === currentFeed);
    if (index >= 0) {
      setPagerPage(index);
      setCurrentFeedIndex(index); // Keep React state in sync immediately to avoid UI/playback mismatch
    }
  }, [currentFeed, feedOptions, setPagerPage]);

  // Track current feed index for visibility checks (updated via useAnimatedReaction)
  const [currentFeedIndex, setCurrentFeedIndex] = useState(initialPageIndex);

  // Update current feed index state when shared value changes (for isVisible prop)
  useAnimatedReaction(
    () => Math.round(pageScrollProgress.value),
    (currentIndex, previousIndex) => {
      if (previousIndex !== null && currentIndex !== previousIndex) {
        runOnJS(setCurrentFeedIndex)(currentIndex);
      }
    }
  );

  // Derive current feed option from current index
  const currentFeedOption = feedOptions[currentFeedIndex] || feedOptions[0] || 'following';

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

  // React to page changes from shared value to trigger callbacks
  useAnimatedReaction(
    () => Math.round(pageScrollProgress.value),
    (currentIndex, previousIndex) => {
      if (previousIndex !== null && currentIndex !== previousIndex) {
        runOnJS(animateFeedBar)(true, true);
        runOnJS(showBarAndOverlay)();
      }
    },
    []
  );

  // Ensure controls are visible when pager mounts
  useEffect(() => {
    showBarAndOverlay();
  }, [showBarAndOverlay]);

  // Handle page change from PagerView - final confirmation after transition completes
  const handlePageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const nextIndex = event.nativeEvent.position;
      // Update shared value to exact position after transition
      pageScrollProgress.value = nextIndex;
      // Notify parent of feed change
      const newFeedOption = feedOptions[nextIndex];
      if (newFeedOption) {
        onFeedChange?.(newFeedOption);
      }
    },
    // pageScrollProgress is a shared value - not needed in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedOptions, onFeedChange]
  );

  // Retry is handled inside FeedRenderer (refetch); pass stable no-op so child can call it
  const handleRetryFeed = useCallback(() => {}, []);

  const handleIndicatorTap = useCallback(
    (feedOption: FeedOption) => {
      const targetIndex = feedOptions.findIndex(option => option === feedOption);
      if (targetIndex >= 0) setPagerPage(targetIndex);
    },
    [feedOptions, setPagerPage]
  );

  // Memoized query options for feed rendering (merge profile-style overrides when provided)
  const baseQueryOptions = useMemo(
    () => ({
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchIntervalInBackground: false,
      ...queryOptionsProp,
    }),
    [queryOptionsProp]
  );

  // Optimized feed page styles - consistent with ListFeedView
  const feedPageStyle = useMemo(
    () => ({
      ...styles.feedPage,
      width,
      height: '100%' as const,
    }),
    [width]
  );

  // Dynamic base font size for channel indicators based on screen size
  const indicatorBaseFontSize = useMemo(() => {
    if (typeof indicatorFontSize === 'number' && indicatorFontSize > 0) return indicatorFontSize;
    if (isTablet) return 20;
    if (isSmallScreen) return 16;
    const minDimension = Math.min(width, height);
    if (minDimension >= 420) return 18; // large phones/phablets
    return 16;
  }, [width, height, indicatorFontSize, isTablet, isSmallScreen]);

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
        userDid={userDid}
        headerComponent={headerComponent}
        backgroundColor={backgroundColor}
        secondaryColor={secondaryColor}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        contentScrollProgressOutput={
          index === currentFeedIndex ? contentScrollProgressOutput : undefined
        }
        onRetryFeed={handleRetryFeed}
        queryOptions={{
          ...baseQueryOptions,
          // Enable feed queries for all pager pages while the pager is visible.
          // Playback remains controlled by isVisible/currentFeedIndex below.
          enabled: (baseQueryOptions.enabled ?? true) && isVisible,
        }}
        isVisible={isVisible && index === currentFeedIndex}
        forceError={forceError}
        isModal={isModal}
      />
    ),
    [
      userDid,
      headerComponent,
      backgroundColor,
      secondaryColor,
      viewMode,
      onViewModeChange,
      contentScrollProgressOutput,
      currentFeedIndex,
      handleRetryFeed,
      baseQueryOptions,
      isVisible,
      forceError,
      isModal,
    ]
  );

  const getLabel = useCallback(
    (feedOption: FeedOption) =>
      feedLabelsProp?.[feedOption] ?? FEED_LABELS[feedOption] ?? feedOption,
    [feedLabelsProp]
  );

  // Expose scrollToTop and setPage (setPage used by profile to sync tab tap -> pager)
  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        feedRendererRefs.current[currentFeedOption]?.scrollToTop();
      },
      setPage: (index: number) => {
        if (index >= 0 && index < feedOptions.length) setPagerPage(index);
      },
    }),
    [currentFeedOption, feedOptions.length, setPagerPage]
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {controlStatusBar && <StatusBar barStyle="light-content" backgroundColor={Colors.black} />}

      {showFeedIndicator && (
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
                  label={getLabel(feedOption)}
                  onPress={() => handleIndicatorTap(feedOption)}
                  pressableStyle={styles.indicatorItem}
                />
              ))}
            </View>
            {nativeTabsEnabled && (
              <Pressable
                onPress={() => {
                  router.navigate('/create');
                }}
                style={styles.createButton}
              >
                <SvgXml xml={CAMERA_2_FILL_ICON_SVG} width={24} height={24} />
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}

      {/* PagerView for feeds with optimized gesture handling */}
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
        scrollEnabled={scrollEnabled}
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
    shadowColor: Colors.neutral[200],
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
    shadowColor: Colors.neutral[200],
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
  if (prevProps.initialFeed !== nextProps.initialFeed) return false;
  if (prevProps.currentFeed !== nextProps.currentFeed) return false;
  if (prevProps.forceError !== nextProps.forceError) return false;
  if (prevProps.applySafeArea !== nextProps.applySafeArea) return false;
  if (prevProps.indicatorFontSize !== nextProps.indicatorFontSize) return false;
  if (prevProps.showFeedIndicator !== nextProps.showFeedIndicator) return false;
  if (prevProps.scrollEnabled !== nextProps.scrollEnabled) return false;
  if (prevProps.userDid !== nextProps.userDid) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.feedOptions !== nextProps.feedOptions) return false;

  return true;
};

export default memo(FeedPager, areEqual);
