import {
  useState,
  useEffect,
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
  StatusBar,
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
import EmptyFeed from './EmptyFeed';
import { VideoItem } from './VideoItem';
import GridFeedView from './GridFeedView';
import {
  FEED_VIEW_CONSTANTS,
  getEmptyFeedType,
  getFeedItemKey,
  getEndOfFeedOverscrollTextColor,
  getProfileColors,
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
import type { FeedListItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import { useFeedVisibility, useVisibilityCoreStore } from '../../../core/visibility';
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

const listKeyExtractor = (item: FeedListItem, _index: number): string => getFeedItemKey(item);

/** Passed via FlashList `extraData` so `renderItem` stays referentially stable (ViewHolder memo). */
interface ListFeedListRenderExtra {
  cardHeight: number;
  feedOption: string;
  feedKey: string;
  canPlay: boolean;
  isHeaderBlockingPlayback: boolean;
  zoomTargetPostUri: string | null;
}

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
      <View style={[styles.centeredLoadingContainer, { backgroundColor: Colors.black }]}>
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
    // Hooks
    const insets = useSafeAreaInsets();

    // Layout state
    const [headerHeight, setHeaderHeight] = useState(0);
    /** Pixel height of the feed region from onLayout — source of truth once laid out (profile pager, tab shell, modals). */
    const [feedLayoutHeight, setFeedLayoutHeight] = useState(0);
    // Track scroll-based blocking state (driven by useAnimatedReaction when crossing HEADER_BLOCKING_THRESHOLD)
    const [scrollBasedBlocking, setScrollBasedBlocking] = useState(() => Boolean(headerComponent));

    // Refs
    const flashListRef = useRef<FlashListRef<FeedListItem>>(null);

    // Scroll offset for percent-visible: written in useAnimatedScrollHandler (UI thread), read in VideoCard worklet.
    const scrollOffsetYSV = useSharedValue(0);
    const endOfFeedEnabledSV = useSharedValue(0);
    const endOfFeedOverscrollOpacitySV = useSharedValue(0);

    // setScrollBasedBlocking via useAnimatedReaction so we only cross the JS bridge when the boolean flips (same pattern as ProfileHeader).
    useAnimatedReaction(
      () => scrollOffsetYSV.value < FEED_VIEW_CONSTANTS.HEADER_BLOCKING_THRESHOLD,
      (isBlocking, prev) => {
        if (prev === null || isBlocking !== prev) {
          runOnJS(setScrollBasedBlocking)(isBlocking);
        }
      },
      [scrollOffsetYSV]
    );

    // Expose scrollToTop method
    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: (animated = true) => {
          flashListRef.current?.scrollToTop({ animated });
        },
      }),
      []
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

    const initialScrollIndex =
      targetScrollIndex !== null &&
      targetScrollIndex !== undefined &&
      viewMode === 'list' &&
      feed.length > 0
        ? Math.max(0, Math.min(targetScrollIndex, feed.length - 1))
        : undefined;

    const initialViewableIndexForVisibility =
      viewMode === 'list' && feed.length > 0 ? (initialScrollIndex ?? 0) : undefined;

    const { onViewableItemsChanged, viewabilityConfig, canPlay, feedKey } = useFeedVisibility({
      feedOption,
      userDid,
      isActive: Boolean(isVisible),
      initialViewableIndex: initialViewableIndexForVisibility,
    });

    const isHeaderBlockingPlayback =
      !headerComponent || !isVisible || viewMode !== 'list' ? false : scrollBasedBlocking;

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
    }, [showEndOfFeed]);

    const listRenderExtraData: ListFeedListRenderExtra = useMemo(
      () => ({
        cardHeight,
        feedOption,
        feedKey,
        canPlay,
        isHeaderBlockingPlayback,
        zoomTargetPostUri: zoomTargetPostUri ?? null,
      }),
      [cardHeight, feedOption, feedKey, canPlay, isHeaderBlockingPlayback, zoomTargetPostUri]
    );

    const listRenderExtraRef = useRef(listRenderExtraData);
    listRenderExtraRef.current = listRenderExtraData;

    // Stable renderItem identity + FlashList `extraData` (see FlashListProps / ViewHolder memo).
    const renderItem = useCallback((info: ListRenderItemInfo<FeedListItem>) => {
      const { item, index, target, extraData } = info;
      const x = (extraData as ListFeedListRenderExtra | undefined) ?? listRenderExtraRef.current;
      const rowHeight = x.cardHeight;
      if (target === RenderTargetOptions.Measurement) {
        return <View style={[styles.measurementPlaceholder, { height: rowHeight }]} />;
      }
      const feedItem = item;
      const isAppleZoomTarget =
        Boolean(x.zoomTargetPostUri) &&
        feedItem.post?.uri === x.zoomTargetPostUri &&
        Platform.OS === 'ios';
      return (
        <VideoItem
          feedItem={feedItem}
          post={feedItem.post}
          height={x.cardHeight}
          feedOption={x.feedOption as 'following' | 'discover'}
          feedKey={x.feedKey}
          canPlay={x.canPlay}
          isHeaderBlockingPlayback={x.isHeaderBlockingPlayback}
          index={index}
          isAppleZoomTarget={isAppleZoomTarget}
        />
      );
    }, []);

    // Item type + keys are handled by pure module-scope helpers.

    // FlashList's native viewability handles item detection automatically
    // maintainVisibleContentPosition preserves scroll position, so the visible item
    // at that position will be detected by the viewability callback

    // Only adjust scroll when this feed is the active pager page; use this feed's own viewable index
    const handleOrientationChange = useCallback(
      (_event: { window: ScaledSize }) => {
        const { activeFeedKey, lastViewableIndexByFeed } = useVisibilityCoreStore.getState();
        const idx = lastViewableIndexByFeed[feedKey] ?? -1;
        if (flashListRef.current && feed.length > 0 && activeFeedKey === feedKey && idx >= 0) {
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
      [feedKey, feed.length]
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

    const headerHeightRef = useRef(headerHeight);
    headerHeightRef.current = headerHeight;

    const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h <= 0 || h === headerHeightRef.current) return;
      requestAnimationFrame(() => {
        setHeaderHeight(prev => (prev === h ? prev : h));
      });
    }, []);

    const snapToOffsets = useMemo((): number[] | null => {
      if (useLegacyIosTabLiquidGlassLayout && !hasHeader && isCompact) {
        return null;
      }
      const offsets: number[] = hasHeader ? [0] : [];

      for (let i = 0; i < listData.length; i++) {
        if (hasHeader && headerHeight > 0 && cardHeight > 0) {
          const baseOffset = headerHeight + i * itemSpacing;
          offsets.push(baseOffset - (isHeaderFeed ? snapTopInset : 0));
        } else {
          offsets.push(i * itemSpacing - snapTopInset);
        }
      }

      return offsets;
    }, [
      useLegacyIosTabLiquidGlassLayout,
      hasHeader,
      isCompact,
      listData.length,
      headerHeight,
      cardHeight,
      itemSpacing,
      isHeaderFeed,
      snapTopInset,
    ]);

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
          const y = event.contentOffset.y;
          scrollOffsetYSV.value = y;
          if (contentScrollProgressOutput && fadeDist > 0) {
            // Reanimated SharedValue: mutating .value is the intended API (UI-thread sync), not the prop reference.

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

    // Context compares value by reference; memoize so VideoCard subscribers do not re-render on unrelated list updates.
    const feedScrollValue = useMemo(
      () => ({
        scrollOffsetYSV,
        headerHeight,
        viewportHeight: viewableAreaHeight,
        itemSpacing,
        contentScrollProgressSV,
      }),
      [headerHeight, viewableAreaHeight, itemSpacing, scrollOffsetYSV, contentScrollProgressSV]
    );

    /** ~1 viewport of draw distance for tall full-screen rows; bounded for memory (FlashList default 250). */
    const flashListDrawDistance = useMemo(() => {
      if (viewableAreaHeight <= 0) {
        return 300;
      }
      return Math.min(1200, Math.max(300, Math.round(viewableAreaHeight * 0.85)));
    }, [viewableAreaHeight]);

    /** Tab / home indicator clearance for the overscroll hint sitting above the bottom edge. */
    const endOfFeedHintBottomInset = useNativeTabBottomSafeArea ? 12 : Math.max(12, insets.bottom);

    /** Offset so the spinner sits below the status bar / notch (see RefreshControl `progressViewOffset`). */
    const refreshProgressViewOffset = useMemo(() => {
      const top = getEffectiveTopInset(insets.top);
      if (Platform.OS === 'android') {
        return Math.max(top, StatusBar.currentHeight ?? 0);
      }
      return top;
    }, [insets.top]);

    const listRefreshControl = useMemo(() => {
      if (!pullToRefresh) return undefined;
      const accent = profileColors?.textColor ?? secondaryColor ?? Colors.neutral[50];
      const trackBg = profileColors?.backgroundColor ?? backgroundColor ?? Colors.black;
      return (
        <RefreshControl
          refreshing={pullToRefresh.refreshing}
          onRefresh={() => {
            void Promise.resolve(pullToRefresh.onRefresh());
          }}
          tintColor={accent}
          colors={[accent]}
          progressBackgroundColor={trackBg}
          progressViewOffset={refreshProgressViewOffset}
        />
      );
    }, [pullToRefresh, refreshProgressViewOffset, profileColors, secondaryColor, backgroundColor]);

    const listHeaderMemo = useMemo(
      () =>
        headerComponent ? (
          <View onLayout={handleHeaderLayout}>
            {headerComponent}
            <View style={styles.listHeaderGapStrip} />
          </View>
        ) : null,
      [headerComponent, handleHeaderLayout]
    );

    const listEmptyMemo = useMemo(
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

    const listFooterMemo = useMemo(
      () => (feed.length > 0 ? <View style={styles.itemSeparator} /> : null),
      [feed.length]
    );

    const listContentContainerStyle = useMemo(
      () =>
        feed.length > 0
          ? [
              styles.contentContainer,
              {
                paddingBottom: useNativeTabBottomSafeArea ? 0 : insets.bottom,
              },
            ]
          : [styles.contentContainer],
      [feed.length, useNativeTabBottomSafeArea, insets.bottom]
    );

    if (viewMode === 'grid') {
      const grid = (
        <GridFeedView
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
          ListComponent={ListComponent}
          contentScrollProgressOutput={contentScrollProgressOutput}
          snapTopInset={snapTopInset}
          useNativeTabBottomSafeArea={useNativeTabBottomSafeArea}
          pullToRefresh={pullToRefresh}
        />
      );
      const tabSafeBg = backgroundColor || Colors.black;
      return useNativeTabBottomSafeArea ? (
        <RNScreensSafeAreaView
          style={[styles.tabSceneSafeArea, { backgroundColor: tabSafeBg }]}
          edges={{ bottom: true }}
        >
          {grid}
        </RNScreensSafeAreaView>
      ) : (
        grid
      );
    }

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
            extraData={listRenderExtraData}
            renderItem={renderItem}
            keyExtractor={listKeyExtractor}
            drawDistance={flashListDrawDistance}
            getItemType={getListItemType}
            initialScrollIndex={initialScrollIndex}
            ListHeaderComponent={listHeaderMemo}
            // Snapping configuration

            pagingEnabled={false}
            snapToOffsets={snapToOffsets ?? undefined}
            snapToInterval={undefined}
            snapToAlignment={undefined}
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
            // Allow bottom rubber-band when at end of feed so the overscroll hint can appear (not in scroll content).
            alwaysBounceVertical={showEndOfFeed}
            alwaysBounceHorizontal={false}
            // Empty state components - extracted to memoized component
            ListEmptyComponent={listEmptyMemo}
            // Item separator for black gaps between cards
            ItemSeparatorComponent={ItemSeparatorComponent}
            ListFooterComponent={listFooterMemo}
            contentContainerStyle={listContentContainerStyle}
            refreshControl={listRefreshControl}
          />
        </View>
      </View>
    );

    return (
      <FeedScrollProvider value={feedScrollValue}>
        {useNativeTabBottomSafeArea ? (
          <RNScreensSafeAreaView
            style={[styles.tabSceneSafeArea, { backgroundColor: backgroundColor || Colors.black }]}
            edges={{ bottom: true }}
          >
            {listBody}
          </RNScreensSafeAreaView>
        ) : (
          listBody
        )}
      </FeedScrollProvider>
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: Dimensions.get('window').height,
  },
  contentContainer: {
    backgroundColor: Colors.transparent,
  },
  flashListWrapper: {
    flex: 1,
    zIndex: 1,
    ...(Platform.OS === 'android' ? { elevation: 6 } : {}),
  },
  flashList: {
    flex: 1,
    backgroundColor: Colors.transparent,
  },
  itemSeparator: {
    height: FEED_VIEW_CONSTANTS.LIST_ITEM_GAP,
    backgroundColor: Colors.black,
  },
  listHeaderGapStrip: {
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
