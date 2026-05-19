import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativePressable } from '@/components/ui/NativePressable';
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import {
  TabView,
  TabBar,
  type SceneRendererProps,
  type NavigationState,
  type Route,
  type TabDescriptor,
} from 'react-native-tab-view';
import { useRouter } from 'expo-router';
import { NanoIcon } from '../../ui/NanoIcon';
import { Colors } from '../../../theme';
import FeedRenderer from './FeedRenderer';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListFeedViewRef } from '../../../types';
import type { FeedPagerRef } from '../../../utils/navigation/tabRefs';
import { useTabBarVisibility } from '../../../context/FeedIndicatorContext';
import { FontFamily, Typography, fontSizeFor } from '@/utils/components/typography';
import { LAYOUT_INSETS } from '@/utils/constants';

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

const NOOP = () => {};

// ORBYT_WHITE (#f3f5fe) at 0.6 opacity — matches the previous position-interpolated dimming for inactive tabs.
const FEED_INACTIVE_TAB_COLOR = 'rgba(243, 245, 254, 0.6)';

interface FeedPagerRendererProps {
  headerComponent?: ReactNode;
  backgroundColor?: string;
  secondaryColor?: string;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
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
  controlStatusBar?: boolean;
  pullToRefreshEnabled?: boolean;
  onPullToRefreshExtra?: () => Promise<unknown>;
}

interface FeedPagerProps extends FeedPagerRendererProps {
  initialFeed?: FeedOption;
  feedOptions?: readonly FeedOption[];
  feedLabels?: { [key: string]: string };
  userDid?: string;
  onFeedChange?: (feed: FeedOption) => void;
  currentFeed?: FeedOption;
  forceError?: boolean;
  applySafeArea?: boolean;
  indicatorFontSize?: number;
  showFeedIndicator?: boolean;
  scrollEnabled?: boolean;
}

const FeedPager = function FeedPager({
  ref,
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
}: FeedPagerProps & {
  ref?: React.Ref<FeedPagerRef>;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const { isTablet, screenWidth } = useDeviceLayout();
  const feedRendererRefs = useRef<{ [key: string]: ListFeedViewRef | null }>({});
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabBarVisibility = useTabBarVisibility();

  const feedOptions = feedOptionsProp ?? DEFAULT_FEED_OPTIONS;

  const initialFeedKey = currentFeed ?? initialFeed;
  const initialPageIndex = Math.max(
    0,
    feedOptions.findIndex(o => o === initialFeedKey)
  );

  const [index, setIndex] = useState(initialPageIndex);

  const getLabel = useCallback(
    (feedOption: FeedOption) => {
      if (feedLabelsProp?.[feedOption]) return feedLabelsProp[feedOption];
      const labelKey = FEED_LABEL_KEYS[feedOption];
      return labelKey ? t(labelKey) : feedOption;
    },
    [feedLabelsProp, t]
  );

  const routes: Route[] = useMemo(
    () => feedOptions.map(fo => ({ key: fo, title: getLabel(fo) })),
    [feedOptions, getLabel]
  );

  const handleIndexChange = useCallback(
    (nextIndex: number) => {
      setIndex(nextIndex);
      const feed = feedOptions[nextIndex];
      if (feed) onFeedChange?.(feed);
      if (contentScrollProgressOutput) {
        contentScrollProgressOutput.set(withTiming(0, { duration: 150 }));
      }
    },
    [feedOptions, onFeedChange, contentScrollProgressOutput]
  );

  // Sync controlled currentFeed → pager index
  useEffect(() => {
    if (currentFeed == null) return;
    const nextIndex = feedOptions.findIndex(o => o === currentFeed);
    if (nextIndex >= 0 && nextIndex !== index) setIndex(nextIndex);
  }, [currentFeed, feedOptions, index]);

  const indicatorBaseFontSize =
    typeof indicatorFontSize === 'number' && indicatorFontSize > 0
      ? fontSizeFor(indicatorFontSize)
      : isTablet
        ? Typography.sizes.h3
        : Typography.sizes.title;

  const feedCommonOptions = useMemo<TabDescriptor<Route>>(
    () => ({
      sceneStyle: styles.scene,
      label: ({ color, labelText }) => (
        <Text
          style={{
            color,
            fontSize: indicatorBaseFontSize,
            fontFamily: FontFamily.black,
            includeFontPadding: false,
          }}
        >
          {labelText}
        </Text>
      ),
    }),
    [indicatorBaseFontSize]
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

  const feedQueryOptions = useMemo(
    () => ({ ...baseQueryOptions, enabled: baseQueryOptions.enabled ?? true }),
    [baseQueryOptions]
  );

  const renderScene = useCallback(
    ({ route }: SceneRendererProps & { route: Route }) => {
      const feedIndex = feedOptions.indexOf(route.key as FeedOption);
      return (
        <FeedRenderer
          ref={(r: ListFeedViewRef | null) => {
            feedRendererRefs.current[route.key] = r;
          }}
          feedOption={route.key}
          userDid={userDid}
          headerComponent={headerComponent}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          contentScrollProgressOutput={contentScrollProgressOutput}
          onRetryFeed={NOOP}
          queryOptions={feedQueryOptions}
          isVisible={isVisible && feedIndex === index}
          forceError={forceError}
          pullToRefreshEnabled={pullToRefreshEnabled}
          onPullToRefreshExtra={onPullToRefreshExtra}
        />
      );
    },
    [
      feedOptions,
      userDid,
      headerComponent,
      backgroundColor,
      secondaryColor,
      viewMode,
      onViewModeChange,
      contentScrollProgressOutput,
      index,
      feedQueryOptions,
      isVisible,
      forceError,
      pullToRefreshEnabled,
      onPullToRefreshExtra,
    ]
  );

  const feedBarAnimatedStyle = useAnimatedStyle(() => {
    const visible = tabBarVisibility.value > 0.5;
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 2,
      backgroundColor: Colors.transparent,
      top: applySafeArea ? 12 + insets.top : 12,
      opacity: withTiming(visible ? 1 : 0, { duration: 200 }),
      transform: [{ translateY: withTiming(visible ? 0 : -18, { duration: 200 }) }],
    };
  }, [tabBarVisibility, applySafeArea, insets.top]);

  const handleCreatePress = useCallback(() => {
    router.navigate('/create');
  }, [router]);

  const renderTabBar = useCallback(
    (
      props: SceneRendererProps & {
        navigationState: NavigationState<Route>;
        options: Record<string, TabDescriptor<Route>> | undefined;
      }
    ) => {
      if (!showFeedIndicator) return null;
      return (
        // Reanimated Animated.View — drives hide/show via tabBarVisibility SharedValue
        <Animated.View style={feedBarAnimatedStyle}>
          <View style={styles.indicatorContainer}>
            <TabBar
              {...props}
              style={styles.feedTabBar}
              tabStyle={styles.indicatorItem}
              activeColor={Colors.neutral[50]}
              inactiveColor={FEED_INACTIVE_TAB_COLOR}
              renderIndicator={() => null}
              scrollEnabled
              gap={12 * fontScale}
              pressOpacity={0.7}
            />
            <NativePressable onPress={handleCreatePress} style={styles.createButton}>
              <NanoIcon name="camera-2-fill" size={26} color={Colors.neutral[50]} />
            </NativePressable>
          </View>
        </Animated.View>
      );
    },
    [showFeedIndicator, feedBarAnimatedStyle, handleCreatePress, fontScale]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        feedRendererRefs.current[feedOptions[index]]?.scrollToTop();
      },
      setPage: (nextIndex: number) => {
        if (nextIndex >= 0 && nextIndex < feedOptions.length) setIndex(nextIndex);
      },
    }),
    [feedOptions, index]
  );

  return (
    <>
      {controlStatusBar && <StatusBar style="light" />}
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={handleIndexChange}
        renderTabBar={renderTabBar}
        swipeEnabled={scrollEnabled}
        animationEnabled={scrollEnabled}
        initialLayout={{ width: screenWidth }}
        lazy
        lazyPreloadDistance={1}
        style={styles.pager}
        commonOptions={feedCommonOptions}
        overScrollMode="never"
      />
    </>
  );
};

const styles = StyleSheet.create({
  pager: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  scene: {
    backgroundColor: Colors.black,
  },
  indicatorContainer: {
    flexDirection: 'row',
    paddingHorizontal: LAYOUT_INSETS.DETAIL_OVERLAY_HORIZONTAL,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedTabBar: {
    flex: 1,
    backgroundColor: 'transparent',
    elevation: 0,
    boxShadow: 'none',
  },
  indicatorItem: {
    width: 'auto',
    paddingHorizontal: 0,
    paddingVertical: 0,
    minHeight: 0,
  },
  createButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FeedPager;
