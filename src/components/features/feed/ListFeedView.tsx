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
  useDerivedValue,
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

// Reanimated-wrapped FlashList so useAnimatedScrollHandler runs on UI thread. Do not use @shopify/flash-list's AnimatedFlashList (it uses RN Animated).
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

// FlashList recycling helpers: these are pure/dep-free so React Compiler
// can handle memoization without us manually wrapping them in useCallback.
const getListItemType = (item: FeedListItem): string => {
  if (item.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
  return 'default';
};

const listKeyExtractor = (item: FeedListItem, index: number): string => getFeedItemKey(item, index);

// Empty component shown when there are no feed items
interface ListEmptyComponentProps {
  isLoading: boolean;
  effectiveIsError: boolean;
  feedOption: string;
  secondaryColor?: string;
  profileColors?: { backgroundColor: string; textColor: string };
  isHeaderFeed: boolean;
  emptyComponentHeight: number;
  onRetry?: () => void;
}

const ListEmptyComponent = ({
  isLoading,
  effectiveIsError,
  feedOption,
  secondaryColor,
  profileColors,
  isHeaderFeed,
  emptyComponentHeight,
  onRetry,
}: ListEmptyComponentProps) => {
  if (isLoading) {
    return (
      <View
        style={[
          styles.centeredLoadingContainer,
          {
            backgroundColor: Colors.black,
            minHeight: emptyComponentHeight,
          },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={profileColors?.textColor || secondaryColor || Colors.neutral[50]}
        />
      </View>
    );
  }

  const commonProps = {
    secondaryColor,
    profileColors,
    isProfileFeed: isHeaderFeed,
    viewableAreaHeight: emptyComponentHeight,
    feedOption,
  };

  if (effectiveIsError) {
    return <EmptyFeed type="error" onRetry={onRetry} {...commonProps} />;
  }
  return <EmptyFeed type={getEmptyFeedType(feedOption)} {...commonProps} />;
};

ListEmptyComponent.displayName = 'ListEmptyComponent';

/** Pixels of bottom rubber-band past the last item to reach full opacity (iOS overscroll). */
const END_OF_FEED_OVERSCROLL_FULL_OPACITY_PX = 56;
const CHROME_DIRECTION_THRESHOLD_PX = 12;
const CHROME_TOGGLE_MIN_TRAVEL_PX = 28;
const CHROME_NEAR_TOP_BUFFER_PX = 16;

/** Lift hint from screen bottom so it sits in the band under the last card (above tab / home indicator). */
const END_OF_FEED_HINT_BOTTOM_OFFSET = 40;

type EndOfFeedOverscrollHintProps = {
  opacitySV: SharedValue<number>;
  bottomInset: number;
  labelColor: string;
};

/** End-of-feed copy under the scroll layer; opacity from bottom overscroll only. */
const EndOfFeedOverscrollHint = memo(
  ({ opacitySV, bottomInset, labelColor }: EndOfFeedOverscrollHintProps) => {
    const { t } = useTranslation();
    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacitySV.value,
    }));
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.endOfFeedOverscrollHint,
          { paddingBottom: bottomInset, bottom: END_OF_FEED_HINT_BOTTOM_OFFSET },
          animatedStyle,
        ]}
      >
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
    /** Pixel height of the feed region from onLayout — source of truth once laid out (profile pager, tab shell, modals). */
    const [feedLayoutHeight, setFeedLayoutHeight] = useState(0);

    // Refs
    const flashListRef = useRef<FlashListRef<FeedListItem>>(null);
    const gridRef = useRef<ListFeedViewRef>(null);

    // Scroll offset for percent-visible: written in useAnimatedScrollHandler (UI thread), read in VideoCard worklet.
    const scrollOffsetYSV = useSharedValue(0);
    const homePagerChromeUserHoldSV = useSharedValue(0);
    const previousScrollYSV = useSharedValue(0);
    const chromeToggleAnchorYSV = useSharedValue(0);
    const endOfFeedEnabledSV = useSharedValue(0);
    const endOfFeedOverscrollOpacitySV = useSharedValue(0);

    const seedActiveIndex =
      typeof initialScrollIndex === 'number' ? initialScrollIndex : feed.length > 0 ? 0 : -1;
    const activeVisibleIndexRef = useRef(seedActiveIndex);
    const listPlaybackStore = useRef(
      createFeedListPlaybackStore({ activeIndex: seedActiveIndex })
    ).current;

    const headerBlockingBaseSuppressedSV = useSharedValue(1);

    // Mirror isVisible into a shared value so worklets can read it on the UI thread.
    const tabBarVisibility = useTabBarVisibility();
    const listSurfaceActive = isVisible && resolvedViewMode === 'list';
    const isVisibleSV = useSharedValue(listSurfaceActive ? 1 : 0);
    useEffect(() => {
      isVisibleSV.value = listSurfaceActive ? 1 : 0;
    }, [listSurfaceActive, isVisibleSV]);

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
    /** Pre–SafeAreaView list snap: `getViewportDimensions` + `getVideoCardHeight` (peek under glass tab bar). */
    const useLegacyIosTabLiquidGlassLayout = hasTabBar && isIosLiquidGlassAvailable;
    /**
     * Native tabs only auto-adjust the first ScrollView on iOS; FlashList does not get tab-bar insets.
     * Non–liquid-glass iOS: RNScreens SafeAreaView bottom inset avoids clipping (Expo-recommended).
     * Liquid glass iOS: legacy viewport + card height; list draws under the tab bar for next-card peek.
     * @see https://docs.expo.dev/router/advanced/native-tabs/#safe-area-handling
     */
    const useNativeTabBottomSafeArea =
      hasTabBar && Platform.OS === 'ios' && !isIosLiquidGlassAvailable;

    const viewableAreaHeight = (() => {
      if (!hasTabBar) {
        const maxViewport = Math.max(0, screenHeight - insets.bottom);
        return feedLayoutHeight > 0 ? Math.min(feedLayoutHeight, maxViewport) : maxViewport;
      }
      if (useLegacyIosTabLiquidGlassLayout) {
        return getViewportDimensions(insets, { useFullWindowHeight: !hasTabBar }).height;
      }
      if (feedLayoutHeight > 0) {
        return feedLayoutHeight;
      }
      return Math.max(0, screenHeight - insets.top - insets.bottom);
    })();
    const cardHeight = useLegacyIosTabLiquidGlassLayout
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

    // Memoize profileColors to prevent recreation on every render
    const profileColors = getProfileColors(backgroundColor, secondaryColor);

    const endOfFeedHintColor = useMemo(
      () => getEndOfFeedOverscrollTextColor(profileColors?.textColor, secondaryColor),
      [profileColors?.textColor, secondaryColor]
    );

    // Feed is already filtered by FeedRenderer: reported + shouldFilter.
    // FlashList's maintainVisibleContentPosition will handle position preservation.
    const listData = feed;

    // Error handling
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

    const listRenderExtraData = useMemo(
      () => ({
        cardHeight,
        feedOption,
        zoomTargetPostUri: zoomTargetPostUri ?? null,
      }),
      [cardHeight, feedOption, zoomTargetPostUri]
    );

    const renderItem = useCallback(
      ({ item, index, target, extraData }: ListRenderItemInfo<FeedListItem>) => {
        const xd = extraData as typeof listRenderExtraData | undefined;
        const h = xd?.cardHeight ?? 0;
        if (target === RenderTargetOptions.Measurement) {
          return <View style={[styles.measurementPlaceholder, { height: h }]} />;
        }
        if (!xd) {
          return <View style={[styles.measurementPlaceholder, { height: h }]} />;
        }

        const feedItem = item;
        const isAppleZoomTarget =
          Boolean(xd.zoomTargetPostUri) &&
          feedItem.post?.uri === xd.zoomTargetPostUri &&
          Platform.OS === 'ios';
        return (
          <VideoItem
            feedItem={feedItem}
            post={feedItem.post}
            height={xd.cardHeight}
            feedOption={xd.feedOption}
            index={index}
            isAppleZoomTarget={isAppleZoomTarget}
          />
        );
      },
      []
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

    // Snapping configuration - memoized to prevent recalculation (always compute)
    // FlashList's ItemSeparatorComponent adds spacing between items, so we need to account for it
    // Total spacing from start of one item to start of next = cardHeight + LIST_ITEM_GAP
    const itemSpacing = cardHeight + FEED_VIEW_CONSTANTS.LIST_ITEM_GAP;
    const hasHeader = Boolean(headerComponent);

    /**
     * Empty state sits below ListHeaderComponent (profile/channel header). Height must be the
     * visible list viewport minus that header — not full window height — or the slot is oversized
     * and copy is positioned using the wrong vertical scale.
     */
    const listViewportForEmpty = feedLayoutHeight > 0 ? feedLayoutHeight : viewableAreaHeight;
    const emptyStateHeaderDeduction = ListComponent
      ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS
      : hasHeader && headerHeight > 0
        ? headerHeight
        : 0;
    const emptyComponentHeight = Math.max(0, listViewportForEmpty - emptyStateHeaderDeduction);

    /**
     * iOS tab + liquid glass: offset snaps by top safe area on non-compact devices so the first
     * card aligns with the status bar. Use effective top inset (same as UniversalHeader) when the
     * hook reports 0 under native tabs.
     */
    const snapTopInset =
      useLegacyIosTabLiquidGlassLayout && !isCompact ? getEffectiveTopInset(insets.top) : 0;

    /** iOS liquid glass + compact home: no snap offsets/interval. */
    const snapDisabledCompactLiquidGlass =
      useLegacyIosTabLiquidGlassLayout && !hasHeader && isCompact;
    const snapWaitHeaderLayout = hasHeader && headerHeight <= 0;
    /** Uniform pitch from y=0: same as `i * itemSpacing` offsets without allocating O(n) array. */
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

    const handleHeaderLayout = (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== headerHeight) {
        // Use requestAnimationFrame to avoid blocking layout
        requestAnimationFrame(() => {
          setHeaderHeight(h);
        });
      }
    };

    const handleFeedLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0) {
        setFeedLayoutHeight(prev => (prev === h ? prev : h));
      }
    }, []);

    const fadeDist = hasHeader ? SCROLL_CONSTANTS.HEADER_FADE_DISTANCE : 0;
    const contentScrollProgressSV = useDerivedValue(() => {
      'worklet';
      return fadeDist > 0 ? Math.max(0, Math.min(1, scrollOffsetYSV.value / fadeDist)) : 0;
    }, [scrollOffsetYSV, fadeDist]);

    // UI-thread scroll handler: one write path for offset and (when provided) overlay progress. No extra useAnimatedReaction.
    const scrollHandler = useAnimatedScrollHandler(
      {
        onScroll: event => {
          'worklet';
          /* eslint-disable react-hooks/immutability -- SharedValue.value in worklet */
          const y = event.contentOffset.y;
          scrollOffsetYSV.value = y;

          if (isVisibleSV.value) {
            const chromeMaxY = FEED_VIEW_CONSTANTS.HOME_PAGER_CHROME_VISIBLE_MAX_SCROLL_Y;
            const prevY = previousScrollYSV.value;
            const dy = y - prevY;
            const isHeld = homePagerChromeUserHoldSV.value > 0.5;
            const currentVisible = tabBarVisibility.value > 0.5;
            const travelSinceToggle = Math.abs(y - chromeToggleAnchorYSV.value);
            const nearTop = y < chromeMaxY + CHROME_NEAR_TOP_BUFFER_PX;

            if (isHeld || nearTop) {
              if (!currentVisible) {
                tabBarVisibility.value = 1;
                chromeToggleAnchorYSV.value = y;
              }
            } else if (
              currentVisible &&
              dy > CHROME_DIRECTION_THRESHOLD_PX &&
              travelSinceToggle > CHROME_TOGGLE_MIN_TRAVEL_PX
            ) {
              tabBarVisibility.value = 0;
              chromeToggleAnchorYSV.value = y;
            } else if (
              !currentVisible &&
              dy < -CHROME_DIRECTION_THRESHOLD_PX &&
              travelSinceToggle > CHROME_TOGGLE_MIN_TRAVEL_PX
            ) {
              tabBarVisibility.value = 1;
              chromeToggleAnchorYSV.value = y;
            }
          }

          previousScrollYSV.value = y;

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
          /* eslint-enable react-hooks/immutability */
        },
      },
      [contentScrollProgressOutput, fadeDist, tabBarVisibility]
    );

    const setHomePagerChromeUserHold = useCallback(
      (held: boolean) => {
        // eslint-disable-next-line react-hooks/immutability -- SharedValue.value
        homePagerChromeUserHoldSV.value = held ? 1 : 0;
        // Reset anchor so the next direction change needs real travel before toggling.
        // eslint-disable-next-line react-hooks/immutability -- SharedValue.value
        chromeToggleAnchorYSV.value = scrollOffsetYSV.value;
        // Keep chrome behavior deterministic when pause/play changes without a scroll event.
        // eslint-disable-next-line react-hooks/immutability -- SharedValue.value
        tabBarVisibility.value =
          held || scrollOffsetYSV.value < FEED_VIEW_CONSTANTS.HOME_PAGER_CHROME_VISIBLE_MAX_SCROLL_Y
            ? 1
            : 0;
      },
      [homePagerChromeUserHoldSV, scrollOffsetYSV, tabBarVisibility, chromeToggleAnchorYSV]
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

    /** Tab / home indicator clearance for the overscroll hint sitting above the bottom edge. */
    const endOfFeedHintBottomInset = useNativeTabBottomSafeArea ? 12 : Math.max(12, insets.bottom);

    const listContentContainerExtraStyle = useMemo(() => {
      if (feed.length === 0) {
        return undefined;
      }
      if (useNativeTabBottomSafeArea) {
        return styles.contentContainerListItemsNativeTabBottom;
      }
      return { paddingBottom: insets.bottom };
    }, [feed.length, useNativeTabBottomSafeArea, insets.bottom]);

    const listEmptyElement = useMemo(
      () => (
        <ListEmptyComponent
          isLoading={isLoading}
          effectiveIsError={effectiveIsError}
          feedOption={feedOption}
          secondaryColor={secondaryColor}
          profileColors={profileColors}
          isHeaderFeed={isHeaderFeed}
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

    const listBody = (
      <View
        collapsable={false}
        style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]}
        onLayout={handleFeedLayout}
      >
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
            extraData={listRenderExtraData}
            drawDistance={FEED_VIEW_CONSTANTS.FLASHLIST_DRAW_DISTANCE}
            keyExtractor={listKeyExtractor}
            getItemType={getListItemType}
            refreshControl={
              pullToRefresh ? (
                <RefreshControl
                  refreshing={pullToRefresh.refreshing}
                  onRefresh={pullToRefresh.onRefresh}
                  tintColor={getPullToRefreshTintColor(profileColors?.textColor, secondaryColor)}
                  progressViewOffset={insets.top}
                />
              ) : undefined
            }
            initialScrollIndex={initialScrollIndex}
            ListHeaderComponent={
              headerComponent ? (
                <View onLayout={handleHeaderLayout}>
                  {headerComponent}
                  <View style={styles.listHeaderBottomSeparator} />
                </View>
              ) : null
            }
            // Snapping configuration

            pagingEnabled={false}
            snapToOffsets={snapToOffsets}
            snapToInterval={snapToIntervalValue}
            snapToAlignment={snapToIntervalValue != null ? 'start' : undefined}
            decelerationRate={
              Platform.OS === 'ios'
                ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
                : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID
            }
            // Disable fast scrolling to prevent scrolling past multiple items
            disableIntervalMomentum={true}
            scrollEventThrottle={APP_CONSTANTS.SCROLL_THROTTLE}
            onScroll={scrollHandler}
            onEndReached={onLoadMore}
            onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            // Scroll behavior
            scrollEnabled={true}
            showsVerticalScrollIndicator={
              listData.length >= SCROLL_INDICATOR_CONSTANTS.FEED_LIST_MIN_ITEMS
            }
            bounces={true}
            directionalLockEnabled={true}
            alwaysBounceVertical
            alwaysBounceHorizontal={false}
            // Empty state: memoized element so FlashList does not see a new tree every parent render
            ListEmptyComponent={listEmptyElement}
            // Item separator for black gaps between cards
            ItemSeparatorComponent={ItemSeparatorComponent}
            ListFooterComponent={feed.length > 0 ? <View style={styles.itemSeparator} /> : null}
            contentContainerStyle={[styles.contentContainer, listContentContainerExtraStyle]}
          />
        </View>
      </View>
    );

    const stack = (
      <FeedSurfaceStack
        listActive={resolvedViewMode === 'list'}
        listSurface={
          <FeedListPlaybackContext.Provider value={listPlaybackStore}>
            <FeedScrollProvider motion={feedScrollMotion} layout={feedScrollLayout}>
              {listBody}
            </FeedScrollProvider>
          </FeedListPlaybackContext.Provider>
        }
        gridSurface={
          <GridFeedView
            ref={gridRef}
            feed={feed}
            headerComponent={headerComponent}
            backgroundColor={backgroundColor}
            secondaryColor={secondaryColor}
            isProfileFeed={isHeaderFeed}
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
        }
      />
    );

    return useNativeTabBottomSafeArea ? (
      <RNScreensSafeAreaView
        style={[styles.tabSceneSafeArea, { backgroundColor: backgroundColor || Colors.black }]}
        edges={{ bottom: true }}
      >
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

export default ListFeedViewComponent;
