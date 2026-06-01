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
  useWindowDimensions,
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
  FeedLayoutProvider,
  getEmptyFeedType,
  getFeedItemKey,
  getEndOfFeedOverscrollTextColor,
  getProfileColors,
  getPullToRefreshTintColor,
  isHeaderFeed as getIsHeaderFeed,
  useReanimatedScrollComponent,
  type FeedLayout,
} from './feedViewShared';
import { Colors } from '../../../theme';
import {
  SCROLL_CONSTANTS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { buildListSnapToOffsets } from '@/utils/feed/snapOffsets';
import type { FeedListItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import { ExtendedFeedViewPost } from '../../../services/api/types';
import { isFeedHeaderItem } from '../../../types';
import { useFeedVisibility, useScreenVisible } from '../../../core/visibility/hooks';
import { useTranslation } from 'react-i18next';
import { Typography, FontFamily } from '@/utils/components/typography';

const getListItemType = (item: FeedListItem): string => {
  if (isFeedHeaderItem(item)) return 'header';
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
  const [feedLayoutWidth, setFeedLayoutWidth] = useState(0);

  const flashListRef = useRef<FlashListRef<FeedListItem>>(null);
  const gridRef = useRef<ListFeedViewRef>(null);

  const animatedScrollRef = useAnimatedRef<Animated.ScrollView>();
  const renderScrollComponent = useReanimatedScrollComponent(animatedScrollRef);

  const scrollOffsetYSV = useScrollOffset(animatedScrollRef);
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
  const [activeIndex, setActiveIndex] = useState(seedActiveIndex);

  const tabBarVisibility = useTabBarVisibility();
  // react-compiler treats the value returned from a hook as immutable; mutating via ref.current is fine.
  const tabBarVisibilityRef = useRef(tabBarVisibility);
  const screenVisible = useScreenVisible();
  const listSurfaceActive = screenVisible && resolvedViewMode === 'list';

  useEffect(() => {
    if (listSurfaceActive) tabBarVisibilityRef.current.value = 1;
  }, [listSurfaceActive]);

  const hasTabBar = hasTabBarProp ?? true;

  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const fullHeight = feedLayoutHeight > 0 ? feedLayoutHeight : windowHeight;
  const cardHeight = hasTabBar ? Math.max(0, fullHeight - insets.bottom) : fullHeight;
  const cardWidth = feedLayoutWidth > 0 ? feedLayoutWidth : windowWidth;

  const feedLayoutValue = useMemo<FeedLayout>(
    () => ({
      viewportHeight: cardHeight,
      viewportWidth: cardWidth,
      topInset: insets.top,
      bottomInset: 0,
    }),
    [cardHeight, cardWidth, insets.top]
  );

  // Viewability fires at mount offset 0; gate it until the imperative scrollToItem reaches the target.
  const scrollToTargetPendingRef = useRef(!!zoomTargetPostUri);
  const didScrollToTargetRef = useRef(false);
  useEffect(() => {
    didScrollToTargetRef.current = false;
    scrollToTargetPendingRef.current = !!zoomTargetPostUri;
  }, [zoomTargetPostUri]);
  useEffect(() => {
    if (didScrollToTargetRef.current || !zoomTargetPostUri || feed.length === 0) return;
    const idx = feed.findIndex(
      item => !isFeedHeaderItem(item) && item.post?.uri === zoomTargetPostUri
    );
    if (idx < 0 || !flashListRef.current) return;
    const adjustedIdx = idx + (isHeaderFeed ? 1 : 0);
    didScrollToTargetRef.current = true;
    scrollToTargetPendingRef.current = false;
    setActiveIndex(adjustedIdx);
    flashListRef.current.scrollToItem({ item: feed[idx], animated: false, viewPosition: 0 });
  }, [zoomTargetPostUri, feed, isHeaderFeed]);

  const handleActiveIndexChange = useCallback((index: number) => {
    if (scrollToTargetPendingRef.current) return;
    setActiveIndex(prev => (prev === index ? prev : index));
  }, []);

  // Clamp to current data length so a stale activeIndex can never point past the end of the feed.
  const renderableCount = feed.length + (headerComponent ? 1 : 0);
  const activeIndexForRender =
    feed.length === 0
      ? -1
      : activeIndex >= 0 && activeIndex < renderableCount
        ? activeIndex
        : isHeaderFeed
          ? 1
          : 0;

  const listData = useMemo(() => {
    if (headerComponent) {
      return [{ type: 'header' as const, component: headerComponent }, ...feed] as FeedListItem[];
    }
    return feed;
  }, [headerComponent, feed]);

  const itemSpacing = useMemo(() => cardHeight + FEED_VIEW_CONSTANTS.LIST_ITEM_GAP, [cardHeight]);

  const snapToOffsets = useMemo((): number[] | undefined => {
    return buildListSnapToOffsets({
      isHeaderFeed,
      headerHeight,
      cardHeight,
      itemCount: listData.length,
      itemSpacing,
    });
  }, [isHeaderFeed, headerHeight, cardHeight, listData.length, itemSpacing]);

  const { canPlay, onViewableItemsChanged, viewabilityConfig } = useFeedVisibility({
    isActive: listSurfaceActive,
    onActiveIndexChange: handleActiveIndexChange,
  });

  const profileColors = useMemo(
    () => getProfileColors(backgroundColor, secondaryColor),
    [backgroundColor, secondaryColor]
  );
  const endOfFeedHintColor = useMemo(
    () => getEndOfFeedOverscrollTextColor(profileColors?.textColor, secondaryColor),
    [profileColors?.textColor, secondaryColor]
  );

  const effectiveIsError = forceError || isError;

  const showEndOfFeed =
    feed.length > 0 &&
    !effectiveIsError &&
    !isLoading &&
    hasNextPage === false &&
    !isFetchingNextPage;

  useEffect(() => {
    endOfFeedOverscrollOpacitySV.value = withTiming(showEndOfFeed ? 1 : 0, { duration: 300 });
  }, [showEndOfFeed, endOfFeedOverscrollOpacitySV]);

  const listRenderExtraData = useMemo(
    () => ({
      cardHeight,
      feedOption,
      zoomTargetPostUri: zoomTargetPostUri ?? null,
      onHashtagPress,
      activeIndex: activeIndexForRender,
      canPlay,
      surfaceVisible: screenVisible,
    }),
    [
      cardHeight,
      feedOption,
      zoomTargetPostUri,
      onHashtagPress,
      activeIndexForRender,
      canPlay,
      screenVisible,
    ]
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
          isActive={xd.activeIndex === index}
          canPlay={xd.canPlay}
          surfaceVisible={xd.surfaceVisible}
        />
      );
    },
    [handleHeaderLayout]
  );

  const emptyStateHeaderDeduction = ListComponent
    ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS
    : isHeaderFeed && headerHeight > 0
      ? headerHeight
      : 0;
  const emptyComponentHeight = Math.max(0, cardHeight - emptyStateHeaderDeduction);

  const usesPaging = !isHeaderFeed && listData.length > 0;

  const handleFeedLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    const w = Math.round(e.nativeEvent.layout.width);
    if (h > 0) setFeedLayoutHeight(prev => (prev === h ? prev : h));
    if (w > 0) setFeedLayoutWidth(prev => (prev === w ? prev : w));
  }, []);

  useAnimatedReaction(
    () => scrollOffsetYSV.value,
    y => {
      if (contentScrollProgressOutput) {
        // eslint-disable-next-line react-compiler/react-compiler
        contentScrollProgressOutput.value = Math.max(
          0,
          Math.min(1, y / SCROLL_CONSTANTS.HEADER_FADE_DISTANCE)
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

  const endOfFeedHintBottomInset = Math.max(12, insets.bottom);

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

  const listFooterElement = useMemo(() => {
    if (feed.length === 0 && headerComponent) return listEmptyElement;
    return feed.length > 0 ? <View style={styles.itemSeparator} /> : null;
  }, [feed.length, headerComponent, listEmptyElement]);

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
        tabBarReservesBottom={hasTabBar}
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
      hasTabBar,
      pullToRefresh,
    ]
  );

  const listSurface = (
    <View collapsable={false} style={styles.container} onLayout={handleFeedLayout}>
      {showEndOfFeed ? (
        <EndOfFeedOverscrollHint
          opacitySV={endOfFeedOverscrollOpacitySV}
          bottomInset={endOfFeedHintBottomInset}
          labelColor={endOfFeedHintColor}
        />
      ) : null}
      <View style={styles.flashListWrapper}>
        <FlashList
          ref={flashListRef}
          style={styles.flashList}
          data={listData}
          renderItem={renderItem}
          extraData={listRenderExtraData}
          drawDistance={cardHeight > 0 ? cardHeight : undefined}
          keyExtractor={listKeyExtractor}
          getItemType={getListItemType}
          refreshControl={refreshControlElement}
          snapToInterval={usesPaging ? cardHeight : undefined}
          snapToOffsets={usesPaging ? undefined : snapToOffsets}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate={
            Platform.OS === 'ios'
              ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
              : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID
          }
          renderScrollComponent={renderScrollComponent}
          onEndReached={onLoadMore}
          onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED}
          scrollEnabled
          showsVerticalScrollIndicator={
            listData.length >= SCROLL_INDICATOR_CONSTANTS.FEED_LIST_MIN_ITEMS
          }
          bounces
          directionalLockEnabled
          alwaysBounceVertical
          alwaysBounceHorizontal={false}
          ListEmptyComponent={listEmptyElement}
          ListFooterComponent={listFooterElement}
          contentContainerStyle={styles.contentContainer}
        />
      </View>
    </View>
  );

  return (
    <FeedLayoutProvider value={feedLayoutValue}>
      <FeedSurfaceStack
        listActive={resolvedViewMode === 'list'}
        listSurface={listSurface}
        gridSurface={gridSurfaceNode}
      />
    </FeedLayoutProvider>
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
