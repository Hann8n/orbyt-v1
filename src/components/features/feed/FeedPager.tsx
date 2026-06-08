import {
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useImperativeHandle,
  type Ref,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, StatusBar, type StyleProp, type ViewStyle } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import PagerView from 'react-native-pager-view';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { NanoIcon } from '../../ui/NanoIcon';
import { Colors } from '../../../theme';
import FeedRenderer from './FeedRenderer';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ListFeedViewRef } from '../../../types';
import type { FeedPagerRef } from '../../../utils/navigation/tabRefs';
import { useTabBarVisibility } from '../../../context/FeedIndicatorContext';
import { FontFamily, Typography, fontSizeFor } from '@/utils/components/typography';

export type FeedOption = string;

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
  /** When false, do not render FeedPager's default StatusBar (for screens that manage it themselves). */
  controlStatusBar?: boolean;
  /** When true, each feed tab shows pull-to-refresh (profile/channel). */
  pullToRefreshEnabled?: boolean;
  /** Runs with each visible tab's feed `refetch` when the user pulls to refresh. */
  onPullToRefreshExtra?: () => Promise<unknown>;
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
    const baseProgress = pageScrollProgress.value;
    const isActive = Math.round(baseProgress) === feedIndex;
    const distance = Math.abs(baseProgress - feedIndex);
    const opacity = isActive ? 1 : Math.max(0.3, 1 - distance * 0.4);
    const color = isActive ? Colors.neutral[50] : Colors.overlay.white80;
    return {
      color,
      fontSize: indicatorBaseFontSize,
      marginRight: 8,
      fontFamily: FontFamily.black,
      opacity,
    };
  }, [feedIndex, indicatorBaseFontSize]);

  return (
    <NativePressable onPress={onPress} style={pressableStyle}>
      <Animated.Text style={animatedStyle}>{label}</Animated.Text>
    </NativePressable>
  );
}

function FeedPager({
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
  controlStatusBar = true,
  pullToRefreshEnabled = false,
  onPullToRefreshExtra,
  ref,
}: FeedPagerProps & { ref?: Ref<FeedPagerRef> }) {
  const { t } = useTranslation();
  const { screenWidth: width, isTablet } = useDeviceLayout();
  const pagerViewRef = useRef<PagerView>(null);
  const feedRendererRefs = useRef<{ [key: string]: ListFeedViewRef | null }>({});
  const router = useRouter();
  const tabBarVisibility = useTabBarVisibility();

  const SAFE_AREA_TOP_EDGES = { top: true } as const;
  const SAFE_AREA_NO_EDGES = {} as const;

  const feedOptions = feedOptionsProp ?? DEFAULT_FEED_OPTIONS;

  const initialPageIndex = (() => {
    const feed = currentFeed ?? initialFeed;
    const initialIndex = feedOptions.findIndex(option => option === feed);
    return initialIndex >= 0 ? initialIndex : 0;
  })();

  const pageScrollProgress = useSharedValue(initialPageIndex);
  const pageScrollProgressRef = useRef(pageScrollProgress);
  const contentScrollProgressOutputRef = useRef(contentScrollProgressOutput);

  useLayoutEffect(() => {
    pageScrollProgressRef.current = pageScrollProgress;
  }, [pageScrollProgress]);

  useLayoutEffect(() => {
    contentScrollProgressOutputRef.current = contentScrollProgressOutput;
  }, [contentScrollProgressOutput]);

  const [currentFeedIndex, setCurrentFeedIndex] = useState(initialPageIndex);

  const setPagerPage = useCallback(
    (index: number) => {
      if (index < 0 || !pagerViewRef.current) return;
      if (scrollEnabled) pagerViewRef.current.setPage(index);
      else pagerViewRef.current.setPageWithoutAnimation(index);
      pageScrollProgressRef.current.value = index;
      setCurrentFeedIndex(index);
    },
    [scrollEnabled]
  );

  useEffect(() => {
    if (currentFeed == null) return;
    const index = feedOptions.findIndex(option => option === currentFeed);
    if (index >= 0) {
      setPagerPage(index);
    }
  }, [currentFeed, feedOptions, setPagerPage]);

  const currentFeedOption = feedOptions[currentFeedIndex] || feedOptions[0] || 'following';

  useAnimatedReaction(
    () => pageScrollProgress.value,
    (index: number, prev: number | null) => {
      const contentScrollProgress = contentScrollProgressOutputRef.current;
      if (prev === null || index === prev || !contentScrollProgress) return;
      contentScrollProgress.value = withTiming(0, { duration: 150 });
    },
    []
  );

  const feedBarAnimatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2,
      backgroundColor: Colors.transparent,
      opacity: tabBarVisibility.value,
      transform: [{ translateY: (1 - tabBarVisibility.value) * -18 }],
    };
  }, [tabBarVisibility]);

  const handlePageScroll = useCallback(
    (event: { nativeEvent: { position: number; offset: number } }) => {
      pageScrollProgressRef.current.value = event.nativeEvent.position + event.nativeEvent.offset;
    },
    []
  );

  const handlePageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const nextIndex = event.nativeEvent.position;
      setCurrentFeedIndex(nextIndex);
      const newFeedOption = feedOptions[nextIndex];
      if (newFeedOption) {
        onFeedChange?.(newFeedOption);
      }
    },
    [feedOptions, onFeedChange]
  );

  const handleIndicatorTap = useCallback(
    (feedOption: FeedOption) => {
      const targetIndex = feedOptions.findIndex(option => option === feedOption);
      if (targetIndex >= 0) setPagerPage(targetIndex);
    },
    [feedOptions, setPagerPage]
  );

  const baseQueryOptions = useMemo(
    () => ({
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchIntervalInBackground: false,
      ...queryOptionsProp,
    }),
    [queryOptionsProp]
  );

  const feedPageStyle = useMemo(
    () => ({ ...styles.feedPage, width, height: '100%' as const }),
    [width]
  );

  const feedQueryOptions = useMemo(
    () => ({ ...baseQueryOptions, enabled: baseQueryOptions.enabled ?? true }),
    [baseQueryOptions]
  );

  const feedRendererRefCallbacks = useMemo(
    () =>
      Object.fromEntries(
        feedOptions.map(fo => [
          fo,
          (r: ListFeedViewRef | null) => {
            feedRendererRefs.current[fo] = r;
          },
        ])
      ),
    [feedOptions]
  );

  const indicatorPressHandlers = useMemo(
    () => Object.fromEntries(feedOptions.map(fo => [fo, () => handleIndicatorTap(fo)])),
    [feedOptions, handleIndicatorTap]
  );

  const handleCreatePress = useCallback(() => {
    router.navigate('/create');
  }, [router]);

  const indicatorBaseFontSize =
    typeof indicatorFontSize === 'number' && indicatorFontSize > 0
      ? fontSizeFor(indicatorFontSize)
      : isTablet
        ? Typography.sizes.h3
        : Typography.sizes.title;

  const renderFeed = useCallback(
    ({ item: feedOption, index }: { item: FeedOption; index: number }) => (
      <FeedRenderer
        ref={feedRendererRefCallbacks[feedOption]}
        feedOption={String(feedOption)}
        userDid={userDid}
        headerComponent={headerComponent}
        backgroundColor={backgroundColor}
        secondaryColor={secondaryColor}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        contentScrollProgressOutput={contentScrollProgressOutput}
        onRetryFeed={() => {}}
        queryOptions={feedQueryOptions}
        isVisible={isVisible && index === currentFeedIndex}
        forceError={forceError}
        pullToRefreshEnabled={pullToRefreshEnabled}
        onPullToRefreshExtra={onPullToRefreshExtra}
      />
    ),
    [
      feedRendererRefCallbacks,
      userDid,
      headerComponent,
      backgroundColor,
      secondaryColor,
      viewMode,
      onViewModeChange,
      contentScrollProgressOutput,
      currentFeedIndex,
      feedQueryOptions,
      isVisible,
      forceError,
      pullToRefreshEnabled,
      onPullToRefreshExtra,
    ]
  );

  const getLabel = (feedOption: FeedOption) => {
    if (feedLabelsProp?.[feedOption]) return feedLabelsProp[feedOption];
    const labelKey = FEED_LABEL_KEYS[feedOption];
    return labelKey ? t(labelKey) : feedOption;
  };

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        feedRendererRefs.current[currentFeedOption]?.scrollToTop();
      },
      refresh: () => {
        feedRendererRefs.current[currentFeedOption]?.refresh?.();
      },
      setPage: (index: number) => {
        if (index >= 0 && index < feedOptions.length) setPagerPage(index);
      },
    }),
    [currentFeedOption, feedOptions.length, setPagerPage]
  );

  return (
    <View style={styles.container}>
      {controlStatusBar && <StatusBar barStyle="light-content" backgroundColor={Colors.black} />}

      {showFeedIndicator && (
        <Animated.View style={feedBarAnimatedStyle}>
          <SafeAreaView edges={applySafeArea ? SAFE_AREA_TOP_EDGES : SAFE_AREA_NO_EDGES}>
            <View style={styles.indicatorContainer}>
              <View style={styles.feedIndicators}>
                {feedOptions.map((feedOption, index) => (
                  <FeedIndicatorItem
                    key={feedOption}
                    feedIndex={index}
                    indicatorBaseFontSize={indicatorBaseFontSize}
                    pageScrollProgress={pageScrollProgress}
                    label={getLabel(feedOption)}
                    onPress={indicatorPressHandlers[feedOption]}
                    pressableStyle={styles.indicatorItem}
                  />
                ))}
              </View>
              <NativePressable onPress={handleCreatePress} style={styles.createButton}>
                <NanoIcon name="camera-2-fill" size={24} color={Colors.neutral[50]} />
              </NativePressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      )}

      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={initialPageIndex}
        onPageScroll={handlePageScroll}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
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

export default FeedPager;
