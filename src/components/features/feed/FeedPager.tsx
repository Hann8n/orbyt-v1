import {
  useRef,
  useCallback,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, StatusBar, type StyleProp, type ViewStyle } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
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
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListFeedViewRef } from '../../../types';
import type { FeedPagerRef } from '../../../utils/navigation/tabRefs';
import {
  useSetTabBarVisibility,
  useTabBarVisibility,
  useSetOverlayVisibility,
} from '../../../context/FeedIndicatorContext';

// Define the feed options type
export type FeedOption = string;

// Default feed options and label keys for home screen (resolved via t() in component)
const DEFAULT_FEED_OPTIONS: FeedOption[] = ['following', 'your-mix'];
const FEED_LABEL_KEYS: { [key: string]: string } = {
  following: 'feed.following',
  'your-mix': 'feed.yourMix',
  profile: 'profile.videos',
  reposts: 'profile.reposts',
  likes: 'profile.likes',
  bookmarks: 'profile.saves',
  watched: 'profile.watched',
};

const NOOP = () => {};

// SVG uses Orbyt White for the camera icon fill (matches Colors.neutral[50] / Colors.neutral[50])
// Matches the MGC "camera_2_cute_fi.svg" asset (fill adjusted to Orbyt white).
const CAMERA_2_FILL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M10.86 2.485c-1.066.027-1.512.085-1.956.252-.603.227-.961.46-1.633 1.066-.653.589-.936.717-1.58.717-.353 0-.993.136-1.388.296a4.424 4.424 0 0 0-2.704 3.229c-.083.409-.084.467-.068 4.395.015 3.362.027 4.055.082 4.46.195 1.46.529 2.259 1.267 3.036.692.728 1.462 1.135 2.54 1.342.919.176 1.137.182 6.58.182s5.661-.006 6.58-.182c1.219-.234 2.076-.739 2.817-1.661.427-.53.728-1.233.883-2.057.162-.864.17-1.08.188-5.141.017-3.897.016-3.968-.067-4.372a4.438 4.438 0 0 0-2.729-3.243c-.382-.151-1.02-.284-1.363-.284-.644 0-.927-.128-1.58-.717a9.323 9.323 0 0 0-.734-.606 4.441 4.441 0 0 0-1.224-.56c-.562-.144-2.017-.201-3.911-.152m1.583 5.037c1.187.122 2.222.596 3.032 1.391a4.988 4.988 0 0 1 0 7.174 5 5 0 0 1-5.015 1.165 4.514 4.514 0 0 1-1.231-.598 4.975 4.975 0 0 1-1.967-2.579C6.25 11.049 8.316 7.856 11.5 7.524c.462-.048.49-.048.943-.002m-1.112 2.056a3.024 3.024 0 0 0-2.219 2.13c-.126.443-.125 1.143.002 1.59a3.051 3.051 0 0 0 2.048 2.082c.323.1 1.103.124 1.478.044.378-.08.948-.356 1.259-.611.468-.382.818-.919.987-1.515.128-.449.128-1.147 0-1.596a3.051 3.051 0 0 0-2.048-2.082c-.3-.094-1.172-.118-1.507-.042" fill="#f3f5fe" fill-rule="evenodd"/></svg>`;

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
  feedOptions?: readonly FeedOption[];
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

function FeedIndicatorItem({
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
    <NativePressable onPress={onPress} style={pressableStyle}>
      <Animated.Text style={animatedStyle}>{label}</Animated.Text>
    </NativePressable>
  );
}

const FeedPager = forwardRef<FeedPagerRef, FeedPagerProps>(function FeedPager(
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
  const { t } = useTranslation();
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
  const setTabBarVisibility = useSetTabBarVisibility();
  const setOverlayVisibility = useSetOverlayVisibility();
  const tabBarVisibility = useTabBarVisibility();

  const feedOptions = feedOptionsProp ?? DEFAULT_FEED_OPTIONS;

  const showBarAndOverlay = useCallback(() => {
    setTabBarVisibility(1);
    setOverlayVisibility(1);
  }, [setTabBarVisibility, setOverlayVisibility]);

  // Animation values for feed bar vertical transition - using Reanimated for UI thread
  const feedBarTranslateY = useSharedValue(0);
  const [isFeedBarVisible, setIsFeedBarVisible] = useState(true);

  // Same as PagerView's initialPage – single source of truth for "which page we're on" at mount.
  const initialPageIndex = (() => {
    const feed = currentFeed ?? initialFeed;
    const initialIndex = feedOptions.findIndex(option => option === feed);
    return initialIndex >= 0 ? initialIndex : 0;
  })();

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
    [feedOptions, onFeedChange, pageScrollProgress]
  );

  // Retry is handled inside FeedRenderer (refetch); pass stable no-op so child can call it
  const handleIndicatorTap = (feedOption: FeedOption) => {
    const targetIndex = feedOptions.findIndex(option => option === feedOption);
    if (targetIndex >= 0) setPagerPage(targetIndex);
  };

  // Memoized query options for feed rendering (merge profile-style overrides when provided)
  const baseQueryOptions = {
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: false,
    ...queryOptionsProp,
  };

  // Optimized feed page styles - consistent with ListFeedView
  const feedPageStyle = {
    ...styles.feedPage,
    width,
    height: '100%' as const,
  };

  // Dynamic base font size for channel indicators based on screen size
  const indicatorBaseFontSize =
    typeof indicatorFontSize === 'number' && indicatorFontSize > 0
      ? indicatorFontSize
      : isTablet
        ? 20
        : isSmallScreen
          ? 16
          : (() => {
              const minDimension = Math.min(width, height);
              if (minDimension >= 420) return 18; // large phones/phablets
              return 16;
            })();

  const feedSwitcherTopStyle = { top: applySafeArea ? 12 + insets.top : 12 };

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
        onRetryFeed={NOOP}
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
      baseQueryOptions,
      isVisible,
      forceError,
      isModal,
    ]
  );

  const getLabel = (feedOption: FeedOption) => {
    if (feedLabelsProp?.[feedOption]) return feedLabelsProp[feedOption];
    const labelKey = FEED_LABEL_KEYS[feedOption];
    return labelKey ? t(labelKey) : feedOption;
  };

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
            <NativePressable
              onPress={() => {
                router.navigate('/create');
              }}
              style={styles.createButton}
            >
              <SvgXml xml={CAMERA_2_FILL_ICON_SVG} width={26} height={26} />
            </NativePressable>
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

export default FeedPager;
