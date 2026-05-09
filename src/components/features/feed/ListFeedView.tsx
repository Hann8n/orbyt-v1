import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  memo,
  type ComponentType,
  type Ref,
} from 'react';
import {
  View,
  Dimensions,
  StyleSheet,
  ScaledSize,
  LayoutChangeEvent,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView as RNScreensSafeAreaView } from 'react-native-screens/experimental';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useAnimatedStyle,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import {
  FlashList,
  FlashListRef,
  type FlashListProps,
  type ListRenderItemInfo,
  RenderTargetOptions,
} from '@shopify/flash-list';
import { FeedScrollProvider } from '../../../context/FeedScrollContext';
import type {
  FeedScrollLayoutValue,
  FeedScrollMotionValue,
} from '../../../context/FeedScrollContext';
import { useTabBarVisibility } from '../../../context/FeedIndicatorContext';
import EmptyFeed from './EmptyFeed';
import { VideoItem } from './VideoItem';
import GridFeedView from './GridFeedView';
import {
  FeedSurfaceStack,
  FEED_VIEW_CONSTANTS,
  IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING,
  getEmptyFeedType,
  getFeedItemKey,
  getEndOfFeedOverscrollTextColor,
  getProfileColors,
  getPullToRefreshTintColor,
  isHeaderFeed as getIsHeaderFeed,
} from './feedViewShared';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { isIosLiquidGlassAvailable } from '@/stores/userStore';
import { getEffectiveTopInset, getViewportDimensions } from '../../../utils/device/screen';
import { getVideoCardHeight } from '../../../utils/video/helpers';
import { Colors } from '../../../theme';
import {
  APP_CONSTANTS,
  SCROLL_CONSTANTS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { buildListSnapToOffsets } from '@/utils/feed/snapOffsets';
import type { FeedListItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import {
  useFeedVisibility,
  createFeedListPlaybackStore,
  FeedListPlaybackContext,
} from '../../../core/visibility';
import { useTranslation } from 'react-i18next';
import { TypographyText } from '@/utils/components/typography';
import { logger } from '../../../utils/logger';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as ComponentType<
  FlashListProps<FeedListItem> & { ref?: Ref<FlashListRef<FeedListItem>> }
>;

const ItemSeparatorComponent = ({
  leadingItem: _leadingItem,
  trailingItem: _trailingItem,
}: {
  leadingItem?: FeedListItem;
  trailingItem?: FeedListItem;
}) => <View style={styles.itemSeparator} />;

const getListItemType = (item: FeedListItem): string => {
  if (item.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
  return 'default';
};

const listKeyExtractor = (item: FeedListItem, index: number): string => getFeedItemKey(item, index);

interface ListEmptyComponentProps {
  isLoading: boolean;
  effectiveIsError: boolean;
  feedOption: string;
  secondaryColor?: string;
  profileColors?: { backgroundColor: string; textColor: string };
  emptyComponentHeight: number;
  onRetry?: () => void;
}

const minHeightStyleCache = new Map<number, { minHeight: number }>();
const measurementHeightStyleCache = new Map<number, { height: number }>();
const bottomPaddingStyleCache = new Map<number, { paddingBottom: number }>();
const overscrollHintLayoutStyleCache = new Map<number, { paddingBottom: number; bottom: number }>();

const getMinHeightStyle = (minHeight: number): { minHeight: number } => {
  const normalized = Math.max(0, Math.round(minHeight));
  const cached = minHeightStyleCache.get(normalized);
  if (cached) return cached;
  const style = { minHeight: normalized };
  minHeightStyleCache.set(normalized, style);
  return style;
};

const getMeasurementHeightStyle = (height: number): { height: number } => {
  const normalized = Math.max(0, Math.round(height));
  const cached = measurementHeightStyleCache.get(normalized);
  if (cached) return cached;
  const style = { height: normalized };
  measurementHeightStyleCache.set(normalized, style);
  return style;
};

const getBottomPaddingStyle = (paddingBottom: number): { paddingBottom: number } => {
  const normalized = Math.max(0, Math.round(paddingBottom));
  const cached = bottomPaddingStyleCache.get(normalized);
  if (cached) return cached;
  const style = { paddingBottom: normalized };
  bottomPaddingStyleCache.set(normalized, style);
  return style;
};

const getOverscrollHintLayoutStyle = (
  bottomInset: number
): { paddingBottom: number; bottom: number } => {
  const normalized = Math.max(0, Math.round(bottomInset));
  const cached = overscrollHintLayoutStyleCache.get(normalized);
  if (cached) return cached;
  const style = { paddingBottom: normalized, bottom: END_OF_FEED_HINT_BOTTOM_OFFSET };
  overscrollHintLayoutStyleCache.set(normalized, style);
  return style;
};
const MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED = { disabled: true } as const;
const SAFE_AREA_BOTTOM_EDGES = { bottom: true } as const;

const ListEmptyComponent = ({
  isLoading,
  effectiveIsError,
  feedOption,
  secondaryColor,
  profileColors,
  emptyComponentHeight,
  onRetry,
}: ListEmptyComponentProps) => {
  const loadingIndicatorColor = profileColors?.textColor ?? secondaryColor ?? Colors.neutral[50];
  const loadingContainerStyle = useMemo(
    () =>
      StyleSheet.compose(
        StyleSheet.compose(
          styles.centeredLoadingContainer,
          styles.centeredLoadingContainerBackground
        ),
        getMinHeightStyle(emptyComponentHeight)
      ),
    [emptyComponentHeight]
  );

  if (isLoading) {
    return (
      <View style={loadingContainerStyle}>
        <ActivityIndicator size="large" color={loadingIndicatorColor} />
      </View>
    );
  }

  const commonProps = {
    secondaryColor,
    profileColors,
    viewableAreaHeight: emptyComponentHeight,
    feedOption,
  };

  if (effectiveIsError) {
    return <EmptyFeed type="error" onRetry={onRetry} {...commonProps} />;
  }
  return <EmptyFeed type={getEmptyFeedType(feedOption)} {...commonProps} />;
};

ListEmptyComponent.displayName = 'ListEmptyComponent';

const END_OF_FEED_OVERSCROLL_FULL_OPACITY_PX = 56;
const CHROME_SHOW_DIRECTION_THRESHOLD_PX = 4;
const CHROME_HIDE_DIRECTION_THRESHOLD_PX = 18;

const END_OF_FEED_HINT_BOTTOM_OFFSET = 40;
type EndOfFeedOverscrollHintProps = {
  opacitySV: SharedValue<number>;
  bottomInset: number;
  labelColor: string;
};

const EndOfFeedOverscrollHint = memo(
  ({ opacitySV, bottomInset, labelColor }: EndOfFeedOverscrollHintProps) => {
    const { t } = useTranslation();
    const hintLayoutStyle = useMemo(() => getOverscrollHintLayoutStyle(bottomInset), [bottomInset]);
    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacitySV.value,
    }));
    const hintContainerStyle = useMemo(
      () =>
        StyleSheet.compose(
          StyleSheet.compose(styles.endOfFeedOverscrollHint, hintLayoutStyle),
          animatedStyle
        ),
      [hintLayoutStyle, animatedStyle]
    );
    return (
      <Animated.View pointerEvents="none" style={hintContainerStyle}>
        <View style={styles.endOfFeedOverscrollInner}>
          <TypographyText
            variant="body"
            weight="medium"
            color={labelColor}
            align="center"
            style={styles.endOfFeedLabel}
          >
            {t('feed.thatsAllForNow')}
          </TypographyText>
        </View>
      </Animated.View>
    );
  }
);
EndOfFeedOverscrollHint.displayName = 'EndOfFeedOverscrollHint';

const ListFeedViewComponent = forwardRef<ListFeedViewRef, ListFeedViewProps>(
  (
    {
      feed,
      headerComponent,
      backgroundColor,
      secondaryColor,
      feedOption,
      userDid,
      onLoadMore,
      isFetchingNextPage,
      hasNextPage,
      isLoading,
      isError,
      onRetry,
      isVisible = true,
      viewMode,
      onViewModeChange: _onViewModeChange,
      hasTabBar: hasTabBarProp,
      contentScrollProgressOutput,
      forceError = false,
      ListComponent,
      targetScrollIndex,
      onGridItemPress: onGridItemPressProp,
      zoomTargetPostUri,
      gridFeedModalZoomConfig,
      pullToRefresh,
      onHashtagPress,
    },
    ref
  ) => {
    const resolvedViewMode = viewMode ?? 'list';

    const initialScrollIndex = useMemo((): number | undefined => {
      if (
        targetScrollIndex !== null &&
        targetScrollIndex !== undefined &&
        resolvedViewMode === 'list' &&
        feed.length > 0
      ) {
        return Math.max(0, Math.min(targetScrollIndex, feed.length - 1));
      }
      return undefined;
    }, [targetScrollIndex, resolvedViewMode, feed.length]);

    // Hooks
    const insets = useSafeAreaInsets();

    // Layout state
    const [headerHeight, setHeaderHeight] = useState(0);
    const [feedLayoutHeight, setFeedLayoutHeight] = useState(0);

    // Refs
    const flashListRef = useRef<FlashListRef<FeedListItem>>(null);
    const gridRef = useRef<ListFeedViewRef>(null);

    const scrollOffsetYSV = useSharedValue(0);
    const homePagerChromeUserHoldSV = useSharedValue(0);
    const endOfFeedEnabledSV = useSharedValue(0);
    const endOfFeedOverscrollOpacitySV = useSharedValue(0);

    const seedActiveIndex =
      typeof initialScrollIndex === 'number' ? initialScrollIndex : feed.length > 0 ? 0 : -1;
    const activeVisibleIndexRef = useRef(seedActiveIndex);
    // Lazy-init the playback store once per list mount. useState's initializer is the
    // lint-clean equivalent of `useRef(create()).current` — same value identity, no
    // ref-access-during-render warning.
    const [listPlaybackStore] = useState(() =>
      createFeedListPlaybackStore({ activeIndex: seedActiveIndex })
    );

    const headerBlockingBaseSuppressedSV = useSharedValue(1);

    const tabBarVisibility = useTabBarVisibility();
    const listSurfaceActive = isVisible && resolvedViewMode === 'list';
    const isVisibleSV = useSharedValue(listSurfaceActive ? 1 : 0);
    const chromeVisibleMaxY = FEED_VIEW_CONSTANTS.HOME_PAGER_CHROME_VISIBLE_MAX_SCROLL_Y;
    useEffect(() => {
      isVisibleSV.value = listSurfaceActive ? 1 : 0;
    }, [listSurfaceActive, isVisibleSV]);

    useAnimatedReaction(
      () => [scrollOffsetYSV.value, homePagerChromeUserHoldSV.value] as const,
      (current, previous) => {
        'worklet';

        if (!isVisibleSV.value) return;

        const y = Math.max(0, current[0]);
        const hold = current[1];

        if (hold > 0.5) {
          tabBarVisibility.value = 1;
          return;
        }

        const prevHold = previous === null ? 0 : previous[1];
        const prevY = previous === null ? y : Math.max(0, previous[0]);

        if (previous === null || prevHold > 0.5) {
          tabBarVisibility.value = y < chromeVisibleMaxY ? 1 : 0;
          return;
        }

        if (y < chromeVisibleMaxY) {
          tabBarVisibility.value = 1;
        } else if (y > prevY + CHROME_HIDE_DIRECTION_THRESHOLD_PX) {
          tabBarVisibility.value = 0;
        } else if (y < prevY - CHROME_SHOW_DIRECTION_THRESHOLD_PX) {
          tabBarVisibility.value = 1;
        }
      },
      [scrollOffsetYSV, homePagerChromeUserHoldSV, tabBarVisibility, isVisibleSV, chromeVisibleMaxY]
    );

    const patchHeaderBlockingPlayback = useCallback(
      (blocked: boolean) => listPlaybackStore.patch({ headerBlockingPlayback: blocked }),
      [listPlaybackStore]
    );

    useAnimatedReaction(
      () => {
        if (headerBlockingBaseSuppressedSV.value > 0.5) return 0;
        return scrollOffsetYSV.value < FEED_VIEW_CONSTANTS.HEADER_BLOCKING_THRESHOLD ? 1 : 0;
      },
      (blocked, prev) => {
        if (prev === null || blocked !== prev) {
          runOnJS(patchHeaderBlockingPlayback)(blocked === 1);
        }
      },
      [scrollOffsetYSV, headerBlockingBaseSuppressedSV, patchHeaderBlockingPlayback]
    );

    const { screenWidth, screenHeight, isCompact } = useDeviceLayout();
    const isHeaderFeed = getIsHeaderFeed(feedOption, headerComponent);
    const hasTabBar = hasTabBarProp ?? true;
    const useManualIosGlassTabPaddingLayout = hasTabBar && isIosLiquidGlassAvailable;
    const useNativeTabBottomSafeArea =
      hasTabBar && Platform.OS === 'ios' && !isIosLiquidGlassAvailable;

    const viewableAreaHeight = (() => {
      if (!hasTabBar) {
        const maxViewport = Math.max(0, screenHeight - insets.bottom);
        return feedLayoutHeight > 0 ? Math.min(feedLayoutHeight, maxViewport) : maxViewport;
      }
      if (useManualIosGlassTabPaddingLayout) {
        return getViewportDimensions(insets, { useFullWindowHeight: !hasTabBar }).height;
      }
      if (feedLayoutHeight > 0) {
        return feedLayoutHeight;
      }
      return Math.max(0, screenHeight - insets.top - insets.bottom);
    })();
    const cardHeight = useManualIosGlassTabPaddingLayout
      ? getVideoCardHeight(screenWidth, screenHeight)
      : Math.max(0, viewableAreaHeight - FEED_VIEW_CONSTANTS.LIST_ITEM_GAP);

    const handleActiveVisibleIndexChange = useCallback(
      (index: number) => {
        if (activeVisibleIndexRef.current === index) return;
        activeVisibleIndexRef.current = index;
        listPlaybackStore.patch({ activeIndex: index });
      },
      [listPlaybackStore]
    );

    useEffect(() => {
      if (typeof initialScrollIndex !== 'number') return;
      if (activeVisibleIndexRef.current === initialScrollIndex) return;
      activeVisibleIndexRef.current = initialScrollIndex;
      listPlaybackStore.patch({ activeIndex: initialScrollIndex });
    }, [initialScrollIndex, listPlaybackStore]);

    useEffect(() => {
      if (feed.length === 0) {
        if (activeVisibleIndexRef.current === -1) return;
        activeVisibleIndexRef.current = -1;
        listPlaybackStore.patch({ activeIndex: -1 });
        return;
      }
      if (activeVisibleIndexRef.current >= 0) return;
      activeVisibleIndexRef.current = 0;
      listPlaybackStore.patch({ activeIndex: 0 });
    }, [feed.length, listPlaybackStore]);

    const { onViewableItemsChanged, viewabilityConfig, canPlay } = useFeedVisibility({
      isActive: listSurfaceActive,
      onActiveVisibleIndexChange: handleActiveVisibleIndexChange,
    });

    useLayoutEffect(() => {
      listPlaybackStore.patch({ canPlay });
      const suppressed = !headerComponent || !isVisible || resolvedViewMode !== 'list';
      headerBlockingBaseSuppressedSV.value = suppressed ? 1 : 0;
      if (suppressed) listPlaybackStore.patch({ headerBlockingPlayback: false });
    }, [
      canPlay,
      headerComponent,
      isVisible,
      resolvedViewMode,
      listPlaybackStore,
      headerBlockingBaseSuppressedSV,
    ]);

    const profileColors = getProfileColors(backgroundColor, secondaryColor);
    const endOfFeedHintColor = useMemo(
      () => getEndOfFeedOverscrollTextColor(profileColors?.textColor, secondaryColor),
      [profileColors?.textColor, secondaryColor]
    );

    const listData = feed;

    const effectiveIsError = forceError || isError;

    const showEndOfFeed =
      feed.length > 0 &&
      !effectiveIsError &&
      !isLoading &&
      hasNextPage === false &&
      !isFetchingNextPage;

    useEffect(() => {
      endOfFeedEnabledSV.value = showEndOfFeed ? 1 : 0;
      if (!showEndOfFeed) {
        endOfFeedOverscrollOpacitySV.value = 0;
      }
    }, [showEndOfFeed, endOfFeedEnabledSV, endOfFeedOverscrollOpacitySV]);

    const onHashtagPressRef = useRef(onHashtagPress);
    useEffect(() => {
      onHashtagPressRef.current = onHashtagPress;
    }, [onHashtagPress]);

    // Note: previously these values were carried via `extraData` so that renderItem
    // could stay closure-stable. FlashList v2 invalidates render cache on extraData
    // change, which is heavier than just re-creating renderItem when these inputs
    // actually change (rotation, feed switch, zoom transition). Closing over the
    // values directly skips the extraData round-trip.
    // FlashList v2 onLoad — fires once items are drawn and reports elapsedTimeInMs.
    // Dev-only: feeds the existing logger so the timing shows up in the same place
    // as other startup spans without paying the call cost in release builds.
    const onListLoad = useCallback(({ elapsedTimeInMs }: { elapsedTimeInMs: number }) => {
      if (!__DEV__) return;
      logger.debug(`FlashList rendered in ${elapsedTimeInMs.toFixed(0)}ms`, {
        component: 'ListFeedView',
        elapsedTimeInMs,
      });
    }, []);

    const renderItem = useCallback(
      ({ item, index, target }: ListRenderItemInfo<FeedListItem>) => {
        if (target === RenderTargetOptions.Measurement) {
          return (
            <View
              style={StyleSheet.compose(
                styles.measurementPlaceholder,
                getMeasurementHeightStyle(cardHeight)
              )}
            />
          );
        }

        const isAppleZoomTarget =
          Boolean(zoomTargetPostUri) &&
          item.post?.uri === zoomTargetPostUri &&
          Platform.OS === 'ios';
        return (
          <VideoItem
            feedItem={item}
            post={item.post}
            height={cardHeight}
            feedOption={feedOption}
            index={index}
            isAppleZoomTarget={isAppleZoomTarget}
            onHashtagPress={onHashtagPressRef.current}
          />
        );
      },
      [cardHeight, feedOption, zoomTargetPostUri]
    );

    const handleOrientationChange = useCallback(
      (_event: { window: ScaledSize }) => {
        const idx = activeVisibleIndexRef.current;
        if (
          flashListRef.current &&
          feed.length > 0 &&
          listSurfaceActive &&
          idx >= 0 &&
          resolvedViewMode === 'list'
        ) {
          try {
            flashListRef.current.scrollToIndex({
              index: idx,
              animated: false,
              viewPosition: 0.5,
            });
          } catch (_error) {
            // Handle scroll errors gracefully
          }
        }
      },
      [feed.length, listSurfaceActive, resolvedViewMode]
    );

    useEffect(() => {
      const subscription = Dimensions.addEventListener('change', handleOrientationChange);
      return () => subscription?.remove();
    }, [handleOrientationChange]);

    const itemSpacing = cardHeight + FEED_VIEW_CONSTANTS.LIST_ITEM_GAP;
    const hasHeader = Boolean(headerComponent);

    const listViewportForEmpty = feedLayoutHeight > 0 ? feedLayoutHeight : viewableAreaHeight;
    const emptyStateHeaderDeduction = ListComponent
      ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS
      : hasHeader && headerHeight > 0
        ? headerHeight
        : 0;
    const emptyComponentHeight = Math.max(0, listViewportForEmpty - emptyStateHeaderDeduction);

    const snapTopInset =
      useManualIosGlassTabPaddingLayout && !isCompact ? getEffectiveTopInset(insets.top) : 0;

    const snapDisabledCompactLiquidGlass =
      useManualIosGlassTabPaddingLayout && !hasHeader && isCompact;
    const snapWaitHeaderLayout = hasHeader && headerHeight <= 0;
    const listSnapUsesInterval =
      !snapDisabledCompactLiquidGlass &&
      !snapWaitHeaderLayout &&
      !hasHeader &&
      snapTopInset === 0 &&
      listData.length > 0;

    const snapToIntervalValue = listSnapUsesInterval ? itemSpacing : undefined;

    const snapToOffsets = useMemo((): number[] | undefined => {
      return buildListSnapToOffsets({
        snapDisabledCompactLiquidGlass,
        snapWaitHeaderLayout,
        listSnapUsesInterval,
        hasHeader,
        headerHeight,
        cardHeight,
        itemCount: listData.length,
        itemSpacing,
        snapTopInset,
        isHeaderFeed,
      });
    }, [
      snapDisabledCompactLiquidGlass,
      snapWaitHeaderLayout,
      listSnapUsesInterval,
      hasHeader,
      headerHeight,
      cardHeight,
      listData.length,
      itemSpacing,
      snapTopInset,
      isHeaderFeed,
    ]);

    const handleHeaderLayout = useCallback(
      (e: LayoutChangeEvent) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== headerHeight) {
          requestAnimationFrame(() => {
            setHeaderHeight(h);
          });
        }
      },
      [headerHeight]
    );

    const handleFeedLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0) {
        setFeedLayoutHeight(prev => (prev === h ? prev : h));
      }
    }, []);

    const fadeDist = hasHeader ? SCROLL_CONSTANTS.HEADER_FADE_DISTANCE : 0;
    const contentScrollProgressSV = useSharedValue(0);

    const scrollHandler = useAnimatedScrollHandler(
      {
        onScroll: event => {
          'worklet';

          const y = Math.max(0, event.contentOffset.y);
          scrollOffsetYSV.value = y;

          if (fadeDist > 0) {
            contentScrollProgressSV.value = Math.max(0, Math.min(1, y / fadeDist));
          } else {
            contentScrollProgressSV.value = 0;
          }

          if (contentScrollProgressOutput && fadeDist > 0) {
            contentScrollProgressOutput.value = Math.max(0, Math.min(1, y / fadeDist));
          }

          const contentH = event.contentSize?.height ?? 0;
          const layoutH = event.layoutMeasurement?.height ?? 0;
          const maxY = Math.max(0, contentH - layoutH);
          const overscrollPastEnd = y - maxY;
          if (endOfFeedEnabledSV.value < 0.5) {
            endOfFeedOverscrollOpacitySV.value = 0;
          } else {
            endOfFeedOverscrollOpacitySV.value = Math.max(
              0,
              Math.min(1, overscrollPastEnd / END_OF_FEED_OVERSCROLL_FULL_OPACITY_PX)
            );
          }
        },
      },
      [contentScrollProgressOutput, fadeDist]
    );

    const setHomePagerChromeUserHold = useCallback(
      (held: boolean) => {
        homePagerChromeUserHoldSV.value = held ? 1 : 0;
        tabBarVisibility.value =
          held || scrollOffsetYSV.value < FEED_VIEW_CONSTANTS.HOME_PAGER_CHROME_VISIBLE_MAX_SCROLL_Y
            ? 1
            : 0;
      },
      [homePagerChromeUserHoldSV, scrollOffsetYSV, tabBarVisibility]
    );

    const feedScrollMotion = useMemo<FeedScrollMotionValue>(
      () => ({
        scrollOffsetYSV,
        contentScrollProgressSV,
        homePagerChromeUserHoldSV,
        setHomePagerChromeUserHold,
      }),
      [
        scrollOffsetYSV,
        contentScrollProgressSV,
        homePagerChromeUserHoldSV,
        setHomePagerChromeUserHold,
      ]
    );

    const feedScrollLayout = useMemo<FeedScrollLayoutValue>(
      () => ({
        headerHeight,
        viewportHeight: viewableAreaHeight,
        itemSpacing,
      }),
      [headerHeight, viewableAreaHeight, itemSpacing]
    );

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () =>
          resolvedViewMode === 'grid'
            ? gridRef.current?.scrollToTop()
            : flashListRef.current?.scrollToTop({ animated: true }),
      }),
      [resolvedViewMode]
    );

    const endOfFeedHintBottomInset = useNativeTabBottomSafeArea ? 12 : Math.max(12, insets.bottom);

    const listContentContainerExtraStyle = useMemo(() => {
      if (feed.length === 0) {
        return undefined;
      }
      if (useNativeTabBottomSafeArea) {
        return styles.contentContainerListItemsNativeTabBottom;
      }
      const bottomPadding =
        insets.bottom +
        (useManualIosGlassTabPaddingLayout ? IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING : 0);
      return getBottomPaddingStyle(bottomPadding);
    }, [feed.length, useNativeTabBottomSafeArea, insets.bottom, useManualIosGlassTabPaddingLayout]);
    const listContentContainerStyle = useMemo(
      () => StyleSheet.compose(styles.contentContainer, listContentContainerExtraStyle),
      [listContentContainerExtraStyle]
    );
    const listContainerStyle = styles.container;
    const tabSafeAreaStyle = styles.tabSceneSafeArea;

    const listEmptyElement = useMemo(
      () => (
        <ListEmptyComponent
          isLoading={isLoading}
          effectiveIsError={effectiveIsError}
          feedOption={feedOption}
          secondaryColor={secondaryColor}
          profileColors={profileColors}
          emptyComponentHeight={emptyComponentHeight}
          onRetry={onRetry}
        />
      ),
      [
        isLoading,
        effectiveIsError,
        feedOption,
        secondaryColor,
        profileColors,
        isHeaderFeed,
        emptyComponentHeight,
        onRetry,
      ]
    );

    const refreshControlElement = useMemo(() => {
      if (!pullToRefresh) return undefined;
      return (
        <RefreshControl
          refreshing={pullToRefresh.refreshing}
          onRefresh={pullToRefresh.onRefresh}
          tintColor={getPullToRefreshTintColor(profileColors?.textColor, secondaryColor)}
          progressViewOffset={insets.top}
        />
      );
    }, [pullToRefresh, profileColors?.textColor, secondaryColor, insets.top]);

    const listHeaderElement = useMemo(() => {
      if (!headerComponent) return null;
      const separatorStyle =
        feed.length > 0 ? styles.listHeaderBottomSeparator : styles.listHeaderBottomSeparatorEmpty;
      return (
        <View onLayout={handleHeaderLayout}>
          {headerComponent}
          <View style={separatorStyle} />
        </View>
      );
    }, [headerComponent, handleHeaderLayout, feed.length]);

    const listFooterElement = useMemo(
      () => (feed.length > 0 ? <View style={styles.itemSeparator} /> : null),
      [feed.length]
    );

    const listBody = useMemo(
      () => (
        <View collapsable={false} style={listContainerStyle} onLayout={handleFeedLayout}>
          {showEndOfFeed ? (
            <EndOfFeedOverscrollHint
              opacitySV={endOfFeedOverscrollOpacitySV}
              bottomInset={endOfFeedHintBottomInset}
              labelColor={endOfFeedHintColor}
            />
          ) : null}
          <View style={styles.flashListWrapper}>
            <AnimatedFlashList
              ref={flashListRef}
              style={styles.flashList}
              data={listData}
              renderItem={renderItem}
              // drawDistance is in pixels. One full card-height ahead/behind the
              // viewport overlaps with the playback store's preload window
              // (active±N) so neighbours are mounted before the user reaches them.
              drawDistance={cardHeight}
              onLoad={onListLoad}
              keyExtractor={listKeyExtractor}
              getItemType={getListItemType}
              refreshControl={refreshControlElement}
              initialScrollIndex={initialScrollIndex}
              ListHeaderComponent={listHeaderElement}
              pagingEnabled={false}
              snapToOffsets={snapToOffsets}
              snapToInterval={snapToIntervalValue}
              snapToAlignment={snapToIntervalValue != null ? 'start' : undefined}
              decelerationRate={
                Platform.OS === 'ios'
                  ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
                  : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID
              }
              disableIntervalMomentum={true}
              scrollEventThrottle={APP_CONSTANTS.SCROLL_THROTTLE}
              onScroll={scrollHandler}
              onEndReached={onLoadMore}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED}
              scrollEnabled={true}
              showsVerticalScrollIndicator={
                listData.length >= SCROLL_INDICATOR_CONSTANTS.FEED_LIST_MIN_ITEMS
              }
              bounces={true}
              directionalLockEnabled={true}
              alwaysBounceVertical
              alwaysBounceHorizontal={false}
              ListEmptyComponent={listEmptyElement}
              ItemSeparatorComponent={ItemSeparatorComponent}
              ListFooterComponent={listFooterElement}
              contentContainerStyle={listContentContainerStyle}
            />
          </View>
        </View>
      ),
      [
        listContainerStyle,
        handleFeedLayout,
        showEndOfFeed,
        endOfFeedOverscrollOpacitySV,
        endOfFeedHintBottomInset,
        endOfFeedHintColor,
        listData,
        renderItem,
        cardHeight,
        onListLoad,
        refreshControlElement,
        initialScrollIndex,
        listHeaderElement,
        snapToOffsets,
        snapToIntervalValue,
        scrollHandler,
        onLoadMore,
        onViewableItemsChanged,
        viewabilityConfig,
        listEmptyElement,
        listFooterElement,
        listContentContainerStyle,
      ]
    );

    const listSurfaceNode = useMemo(
      () => (
        <FeedListPlaybackContext.Provider value={listPlaybackStore}>
          <FeedScrollProvider motion={feedScrollMotion} layout={feedScrollLayout}>
            {listBody}
          </FeedScrollProvider>
        </FeedListPlaybackContext.Provider>
      ),
      [listPlaybackStore, feedScrollMotion, feedScrollLayout, listBody]
    );

    const gridSurfaceNode = useMemo(
      () => (
        <GridFeedView
          ref={gridRef}
          feed={feed}
          headerComponent={headerComponent}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          feedOption={feedOption}
          userDid={userDid}
          onLoadMore={onLoadMore}
          hasNextPage={hasNextPage}
          onGridItemPress={onGridItemPressProp}
          gridFeedModalZoomConfig={gridFeedModalZoomConfig ?? undefined}
          isError={effectiveIsError}
          onRetry={onRetry}
          isLoading={isLoading}
          ListComponent={ListComponent}
          contentScrollProgressOutput={contentScrollProgressOutput}
          snapTopInset={snapTopInset}
          useNativeTabBottomSafeArea={useNativeTabBottomSafeArea}
          pullToRefresh={pullToRefresh}
        />
      ),
      [
        feed,
        headerComponent,
        backgroundColor,
        secondaryColor,
        feedOption,
        userDid,
        onLoadMore,
        hasNextPage,
        onGridItemPressProp,
        gridFeedModalZoomConfig,
        effectiveIsError,
        onRetry,
        isLoading,
        ListComponent,
        contentScrollProgressOutput,
        snapTopInset,
        useNativeTabBottomSafeArea,
        pullToRefresh,
        resolvedViewMode,
      ]
    );

    const stack = (
      <FeedSurfaceStack
        listActive={resolvedViewMode === 'list'}
        listSurface={listSurfaceNode}
        gridSurface={gridSurfaceNode}
      />
    );

    return useNativeTabBottomSafeArea ? (
      <RNScreensSafeAreaView style={tabSafeAreaStyle} edges={SAFE_AREA_BOTTOM_EDGES}>
        {stack}
      </RNScreensSafeAreaView>
    ) : (
      stack
    );
  }
);

const styles = StyleSheet.create({
  tabSceneSafeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centeredLoadingContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredLoadingContainerBackground: {
    backgroundColor: Colors.transparent,
  },
  contentContainer: {
    backgroundColor: Colors.transparent,
  },
  contentContainerListItemsNativeTabBottom: {
    paddingBottom: 0,
  },
  flashListWrapper: {
    flex: 1,
    zIndex: 1,
  },
  flashList: {
    flex: 1,
    backgroundColor: Colors.transparent,
  },
  itemSeparator: {
    height: FEED_VIEW_CONSTANTS.LIST_ITEM_GAP,
    backgroundColor: Colors.black,
  },
  listHeaderBottomSeparator: {
    height: FEED_VIEW_CONSTANTS.LIST_ITEM_GAP,
    backgroundColor: Colors.black,
  },
  listHeaderBottomSeparatorEmpty: {
    height: FEED_VIEW_CONSTANTS.LIST_ITEM_GAP,
    backgroundColor: Colors.transparent,
  },
  measurementPlaceholder: {
    // Used by FlashList for measurement passes
  },
  endOfFeedOverscrollHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 0,
    paddingTop: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: Colors.transparent,
  },
  endOfFeedOverscrollInner: {
    alignItems: 'center',
    maxWidth: 280,
  },
  endOfFeedLabel: {
    letterSpacing: 0.5,
  },
});

ListFeedViewComponent.displayName = 'ListFeedView';

export default memo(ListFeedViewComponent);
