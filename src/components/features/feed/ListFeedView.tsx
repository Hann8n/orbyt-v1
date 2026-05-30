import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useImperativeHandle,
  memo,
  type Ref,
} from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Text,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useAnimatedRef,
  useScrollOffset,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  FlashList,
  FlashListRef,
  type ListRenderItemInfo,
  RenderTargetOptions,
} from '@shopify/flash-list';
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
  createReanimatedScrollComponent,
} from './feedViewShared';
import { Colors } from '../../../theme';
import {
  SCROLL_CONSTANTS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { buildListSnapToOffsets } from '@/utils/feed/snapOffsets';
import { useViewportHeight } from '@/hooks/useViewportHeight';
import type { FeedListItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import { ExtendedFeedViewPost } from '../../../services/api/types';
import { isFeedHeaderItem } from '../../../types';
import { useFeedVisibility, useScreenVisible } from '../../../core/visibility/hooks';
import { useTranslation } from 'react-i18next';
import { Typography, FontFamily } from '@/utils/components/typography';

const ItemSeparatorComponent = ({
  leadingItem: _leadingItem,
  trailingItem: _trailingItem,
}: {
  leadingItem?: FeedListItem;
  trailingItem?: FeedListItem;
}) => <View style={styles.itemSeparator} />;

const getListItemType = (item: FeedListItem): string => {
  if (isFeedHeaderItem(item)) return 'header';
  if (item.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
  return 'default';
};

const listKeyExtractor = (item: FeedListItem, index: number): string => getFeedItemKey(item, index);

const isFeedListHeaderItem = (item: unknown): boolean => isFeedHeaderItem(item as FeedListItem);

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
      () => [StyleSheet.compose(styles.endOfFeedOverscrollHint, hintLayoutStyle), animatedStyle],
      [hintLayoutStyle, animatedStyle]
    );
    const labelStyle = useMemo(
      () => StyleSheet.compose(styles.endOfFeedLabel, { color: labelColor }),
      [labelColor]
    );
    return (
      <Animated.View pointerEvents="none" style={hintContainerStyle}>
        <View style={styles.endOfFeedOverscrollInner}>
          <Text style={labelStyle}>{t('feed.thatsAllForNow')}</Text>
        </View>
      </Animated.View>
    );
  }
);
EndOfFeedOverscrollHint.displayName = 'EndOfFeedOverscrollHint';

function ListFeedViewComponent({
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
  viewMode,
  onViewModeChange: _onViewModeChange,
  hasTabBar: hasTabBarProp,
  contentScrollProgressOutput,
  forceError = false,
  ListComponent,
  onGridItemPress: onGridItemPressProp,
  zoomTargetPostUri,
  gridFeedModalZoomConfig,
  pullToRefresh,
  onHashtagPress,
  ref,
}: ListFeedViewProps & { ref?: Ref<ListFeedViewRef> }) {
  'use no memo';
  const resolvedViewMode = viewMode ?? 'list';

  const insets = useSafeAreaInsets();

  const [headerHeight, setHeaderHeight] = useState(0);
  const [feedLayoutHeight, setFeedLayoutHeight] = useState(0);

  const flashListRef = useRef<FlashListRef<FeedListItem>>(null);
  const gridRef = useRef<ListFeedViewRef>(null);

  const animatedScrollRef = useAnimatedRef<Animated.ScrollView>();
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => createReanimatedScrollComponent(animatedScrollRef, props),
    [animatedScrollRef]
  );

  const scrollOffsetYSV = useScrollOffset(animatedScrollRef);
  const contentHeightSV = useSharedValue(0);
  const layoutHeightSV = useSharedValue(0);
  const endOfFeedEnabledSV = useSharedValue(0);
  const endOfFeedOverscrollOpacitySV = useSharedValue(0);

  const isHeaderFeed = getIsHeaderFeed(feedOption, headerComponent);

  const seedActiveIndex = (() => {
    if (zoomTargetPostUri && feed.length > 0) {
      const idx = feed.findIndex(
        item => !isFeedHeaderItem(item) && item.post?.uri === zoomTargetPostUri
      );
      if (idx >= 0) return idx + (isHeaderFeed ? 1 : 0);
    }
    return feed.length > 0 ? (isHeaderFeed ? 1 : 0) : -1;
  })();
  const activeVisibleIndexRef = useRef(seedActiveIndex);
  const [activeIndex, setActiveIndex] = useState(seedActiveIndex);

  const tabBarVisibility = useTabBarVisibility();
  const listSurfaceActive = useScreenVisible() && resolvedViewMode === 'list';
  const chromeVisibleMaxY = FEED_VIEW_CONSTANTS.HOME_PAGER_CHROME_VISIBLE_MAX_SCROLL_Y;

  useEffect(() => {
    if (listSurfaceActive) tabBarVisibility.value = 1;
  }, [listSurfaceActive, tabBarVisibility]);

  useAnimatedReaction(
    () => scrollOffsetYSV.value,
    (y, prevY) => {
      if (!listSurfaceActive) return;
      const cy = Math.max(0, y);
      const py = prevY === null ? cy : Math.max(0, prevY);
      if (cy < chromeVisibleMaxY) {
        tabBarVisibility.value = withTiming(1, { duration: 200 });
      } else if (cy > py + CHROME_HIDE_DIRECTION_THRESHOLD_PX) {
        tabBarVisibility.value = withTiming(0, { duration: 200 });
      } else if (cy < py - CHROME_SHOW_DIRECTION_THRESHOLD_PX) {
        tabBarVisibility.value = withTiming(1, { duration: 200 });
      }
    },
    [scrollOffsetYSV, tabBarVisibility, listSurfaceActive, chromeVisibleMaxY]
  );

  const hasTabBar = hasTabBarProp ?? true;
  // The custom JS tab bar (app/(tabs)/_layout.tsx) is in-flow and reserves the bottom safe area,
  // so the feed's TabSlot viewport already excludes it. When a tab bar is present the feed adds no
  // bottom inset of its own; without one it pads by the safe-area inset.
  const tabBarReservesBottom = hasTabBar;

  // useViewportHeight returns feedLayoutHeight when measured, and an accurate pre-layout
  // estimate based on known constants otherwise — so cardHeight is correct from frame 0.
  const cardHeight = useViewportHeight({ hasTabBar, feedLayoutHeight });

  const handleActiveVisibleIndexChange = useCallback((index: number) => {
    if (activeVisibleIndexRef.current === index) return;
    activeVisibleIndexRef.current = index;
    setActiveIndex(index);
  }, []);

  const didScrollToTargetRef = useRef(false);
  useEffect(() => {
    if (didScrollToTargetRef.current || !zoomTargetPostUri || feed.length === 0) return;
    const idx = feed.findIndex(
      item => !isFeedHeaderItem(item) && item.post?.uri === zoomTargetPostUri
    );
    if (idx < 0 || !flashListRef.current) return;
    const adjustedIdx = idx + (isHeaderFeed ? 1 : 0);
    didScrollToTargetRef.current = true;
    if (activeVisibleIndexRef.current !== adjustedIdx) {
      activeVisibleIndexRef.current = adjustedIdx;
      setActiveIndex(adjustedIdx);
    }
    flashListRef.current.scrollToItem({ item: feed[idx], animated: false, viewPosition: 0 });
  }, [zoomTargetPostUri, feed, isHeaderFeed]);

  useEffect(() => {
    if (feed.length === 0) {
      if (activeVisibleIndexRef.current === -1) return;
      activeVisibleIndexRef.current = -1;
      setActiveIndex(-1);
      return;
    }
    if (activeVisibleIndexRef.current >= 0) return;
    const headerOffset = isHeaderFeed ? 1 : 0;
    activeVisibleIndexRef.current = headerOffset;
    setActiveIndex(headerOffset);
  }, [feed.length, isHeaderFeed]);

  const { canPlay, onViewableItemsChanged, viewabilityConfig } = useFeedVisibility({
    isActive: listSurfaceActive,
    onActiveVisibleIndexChange: handleActiveVisibleIndexChange,
    isHeaderItem: isFeedListHeaderItem,
  });

  const profileColors = useMemo(
    () => getProfileColors(backgroundColor, secondaryColor),
    [backgroundColor, secondaryColor]
  );
  const endOfFeedHintColor = useMemo(
    () => getEndOfFeedOverscrollTextColor(profileColors?.textColor, secondaryColor),
    [profileColors?.textColor, secondaryColor]
  );

  const listData = useMemo(() => {
    if (headerComponent) {
      return [{ type: 'header' as const, component: headerComponent }, ...feed] as FeedListItem[];
    }
    return feed;
  }, [headerComponent, feed]);

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
      onHashtagPress,
      activeIndex,
      canPlay,
    }),
    [cardHeight, feedOption, zoomTargetPostUri, onHashtagPress, activeIndex, canPlay]
  );

  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setHeaderHeight(prev => (prev === h ? prev : h));
  }, []);

  const renderItem = useCallback(
    ({ item, index, target, extraData }: ListRenderItemInfo<FeedListItem>) => {
      const xd = extraData as typeof listRenderExtraData | undefined;
      const h = xd?.cardHeight ?? 0;
      if (target === RenderTargetOptions.Measurement || !xd) {
        return (
          <View
            style={StyleSheet.compose(styles.measurementPlaceholder, getMeasurementHeightStyle(h))}
          />
        );
      }

      if (isFeedHeaderItem(item)) {
        return <View onLayout={handleHeaderLayout}>{item.component}</View>;
      }

      const isAppleZoomTarget =
        Boolean(xd.zoomTargetPostUri) &&
        !isFeedHeaderItem(item) &&
        item.post?.uri === xd.zoomTargetPostUri &&
        Platform.OS === 'ios';
      return (
        <VideoItem
          feedItem={item}
          post={item.post}
          height={xd.cardHeight}
          feedOption={xd.feedOption}
          index={index}
          isAppleZoomTarget={isAppleZoomTarget}
          onHashtagPress={xd.onHashtagPress}
          activeIndex={xd.activeIndex}
          canPlay={xd.canPlay}
        />
      );
    },

    [handleHeaderLayout]
  );

  const itemSpacing = useMemo(() => cardHeight + FEED_VIEW_CONSTANTS.LIST_ITEM_GAP, [cardHeight]);

  const listViewportForEmpty = cardHeight;
  const emptyStateHeaderDeduction = ListComponent
    ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS
    : isHeaderFeed && headerHeight > 0
      ? headerHeight
      : 0;
  const emptyComponentHeight = Math.max(0, listViewportForEmpty - emptyStateHeaderDeduction);

  const snapToIntervalValue = !isHeaderFeed && listData.length > 0 ? itemSpacing : undefined;

  const snapToOffsets = useMemo((): number[] | undefined => {
    return buildListSnapToOffsets({
      isHeaderFeed,
      headerHeight,
      cardHeight,
      itemCount: listData.length,
      itemSpacing,
    });
  }, [isHeaderFeed, headerHeight, cardHeight, listData.length, itemSpacing]);

  const handleFeedLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0) {
        setFeedLayoutHeight(prev => (prev === h ? prev : h));
        layoutHeightSV.value = h;
      }
    },
    [layoutHeightSV]
  );

  useAnimatedReaction(
    () => scrollOffsetYSV.value,
    y => {
      if (contentScrollProgressOutput) {
        contentScrollProgressOutput.value = Math.max(
          0,
          Math.min(1, y / SCROLL_CONSTANTS.HEADER_FADE_DISTANCE)
        );
      }
      const maxY = Math.max(0, contentHeightSV.value - layoutHeightSV.value);
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
    [contentScrollProgressOutput]
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

  const endOfFeedHintBottomInset = tabBarReservesBottom ? 12 : Math.max(12, insets.bottom);

  const listContentContainerExtraStyle = useMemo(() => {
    if (feed.length === 0) {
      return undefined;
    }
    if (tabBarReservesBottom) {
      return styles.contentContainerListItemsNativeTabBottom;
    }
    return getBottomPaddingStyle(insets.bottom);
  }, [feed.length, tabBarReservesBottom, insets.bottom]);
  const listContentContainerStyle = useMemo(
    () => StyleSheet.compose(styles.contentContainer, listContentContainerExtraStyle),
    [listContentContainerExtraStyle]
  );
  const listContainerStyle = styles.container;

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

  const listHeaderElement = null;

  const listFooterElement = useMemo(() => {
    if (feed.length === 0 && headerComponent) {
      return listEmptyElement;
    }
    return feed.length > 0 ? <View style={styles.itemSeparator} /> : null;
  }, [feed.length, headerComponent, listEmptyElement]);

  // Memoize FlashList props separately to reduce listBody dependency count
  const flashListProps = useMemo(
    () => ({
      ref: flashListRef,
      style: styles.flashList,
      data: listData,
      renderItem,
      extraData: listRenderExtraData,
      drawDistance: FEED_VIEW_CONSTANTS.FLASHLIST_DRAW_DISTANCE,
      keyExtractor: listKeyExtractor,
      getItemType: getListItemType,
      refreshControl: refreshControlElement,
      ListHeaderComponent: listHeaderElement,
      pagingEnabled: false,
      snapToOffsets,
      snapToInterval: snapToIntervalValue,
      snapToAlignment: (snapToIntervalValue != null ? 'start' : undefined) as 'start' | undefined,
      decelerationRate:
        Platform.OS === 'ios'
          ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
          : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID,
      disableIntervalMomentum: snapToIntervalValue != null,
      renderScrollComponent,
      onContentSizeChange: (_w: number, h: number) => {
        contentHeightSV.value = h;
      },
      onEndReached: onLoadMore,
      onEndReachedThreshold: QUERY_CONSTANTS.END_REACHED_THRESHOLD,
      onViewableItemsChanged,
      viewabilityConfig,
      maintainVisibleContentPosition: MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED,
      scrollEnabled: true,
      showsVerticalScrollIndicator:
        listData.length >= SCROLL_INDICATOR_CONSTANTS.FEED_LIST_MIN_ITEMS,
      bounces: true,
      directionalLockEnabled: true,
      alwaysBounceVertical: true,
      alwaysBounceHorizontal: false,
      ListEmptyComponent: listEmptyElement,
      ItemSeparatorComponent: ItemSeparatorComponent,
      ListFooterComponent: listFooterElement,
      contentContainerStyle: listContentContainerStyle,
    }),
    [
      listData,
      renderItem,
      listRenderExtraData,
      refreshControlElement,
      listHeaderElement,
      snapToOffsets,
      snapToIntervalValue,
      renderScrollComponent,
      contentHeightSV,
      onLoadMore,
      onViewableItemsChanged,
      viewabilityConfig,
      listEmptyElement,
      listFooterElement,
      listContentContainerStyle,
    ]
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
          <FlashList {...flashListProps} />
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
      flashListProps,
    ]
  );

  const listSurfaceNode = useMemo(() => listBody, [listBody]);

  const gridFeedData = useMemo(
    () => feed.filter(item => !isFeedHeaderItem(item)) as ExtendedFeedViewPost[],
    [feed]
  );

  const gridSurfaceNode = useMemo(
    () => (
      <GridFeedView
        ref={gridRef}
        feed={gridFeedData}
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
        tabBarReservesBottom={tabBarReservesBottom}
        pullToRefresh={pullToRefresh}
      />
    ),
    [
      gridFeedData,
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
      tabBarReservesBottom,
      pullToRefresh,
    ]
  );

  return (
    <FeedSurfaceStack
      listActive={resolvedViewMode === 'list'}
      listSurface={listSurfaceNode}
      gridSurface={gridSurfaceNode}
    />
  );
}

const styles = StyleSheet.create({
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
  measurementPlaceholder: {},
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
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
});

ListFeedViewComponent.displayName = 'ListFeedView';

export default memo(ListFeedViewComponent);
