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
  StyleSheet,
  LayoutChangeEvent,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView as RNScreensSafeAreaView } from 'react-native-screens/experimental';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
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
  SCROLL_CONSTANTS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { useFeedPlaybackStore } from '@/hooks/useFeedPlaybackStore';
import { useFeedSnapOffsets } from '@/hooks/useFeedSnapOffsets';
import { useFeedScrollHandler } from '@/hooks/useFeedScrollHandler';
import type { FeedListItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import { useFeedVisibility, FeedListPlaybackContext } from '../../../core/visibility';
import { useTranslation } from 'react-i18next';
import { TypographyText } from '@/utils/components/typography';

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
  isPaused: boolean;
  feedOption: string;
  secondaryColor?: string;
  profileColors?: { backgroundColor: string; textColor: string };
  emptyComponentHeight: number;
  onRetry?: () => void;
}

const MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED = { disabled: true } as const;
const SAFE_AREA_BOTTOM_EDGES = { bottom: true } as const;

const ListEmptyComponent = ({
  isLoading,
  effectiveIsError,
  isPaused,
  feedOption,
  secondaryColor,
  profileColors,
  emptyComponentHeight,
  onRetry,
}: ListEmptyComponentProps) => {
  const loadingIndicatorColor = profileColors?.textColor ?? secondaryColor ?? Colors.neutral[50];
  const loadingContainerStyle = useMemo(
    () => [
      styles.centeredLoadingContainer,
      styles.centeredLoadingContainerBackground,
      { minHeight: Math.max(0, Math.round(emptyComponentHeight)) },
    ],
    [emptyComponentHeight]
  );

  const commonProps = {
    secondaryColor,
    profileColors,
    viewableAreaHeight: emptyComponentHeight,
    feedOption,
  };

  if (isLoading) {
    return (
      <View style={loadingContainerStyle}>
        <ActivityIndicator size="large" color={loadingIndicatorColor} />
      </View>
    );
  }

  if (effectiveIsError) {
    return <EmptyFeed type="error" onRetry={onRetry} {...commonProps} />;
  }

  if (isPaused) {
    return <EmptyFeed type="no-connection" onRetry={onRetry} {...commonProps} />;
  }

  return <EmptyFeed type={getEmptyFeedType(feedOption)} {...commonProps} />;
};

ListEmptyComponent.displayName = 'ListEmptyComponent';

const CHROME_SHOW_DIRECTION_THRESHOLD_PX = 4;
const CHROME_HIDE_DIRECTION_THRESHOLD_PX = 18;
type EndOfFeedOverscrollHintProps = {
  opacitySV: SharedValue<number>;
  bottomInset: number;
  labelColor: string;
};

const EndOfFeedOverscrollHint = memo(
  ({ opacitySV, bottomInset, labelColor }: EndOfFeedOverscrollHintProps) => {
    const { t } = useTranslation();
    const hintLayoutStyle = useMemo(
      () => ({ paddingBottom: Math.max(0, Math.round(bottomInset)), bottom: 40 as const }),
      [bottomInset]
    );
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
      isPaused = false,
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

    const insets = useSafeAreaInsets();

    const [headerHeight, setHeaderHeight] = useState(0);
    const [feedLayoutHeight, setFeedLayoutHeight] = useState(0);

    const flashListRef = useRef<FlashListRef<FeedListItem>>(null);
    const gridRef = useRef<ListFeedViewRef>(null);

    const headerBlockingBaseSuppressedSV = useSharedValue(1);

    const { listPlaybackStore, handleActiveVisibleIndexChange } =
      useFeedPlaybackStore(initialScrollIndex, feed.length);

    // Local ref for the orientation scroll-restore handler — updated alongside the store.
    const activeVisibleIndexRef = useRef(
      typeof initialScrollIndex === 'number' ? initialScrollIndex : 0
    );
    const handleActiveVisibleIndexChangeWithRef = useCallback(
      (index: number) => {
        activeVisibleIndexRef.current = index;
        handleActiveVisibleIndexChange(index);
      },
      [handleActiveVisibleIndexChange]
    );

    const tabBarVisibility = useTabBarVisibility();
    const listSurfaceActive = isVisible && resolvedViewMode === 'list';
    const isVisibleSV = useSharedValue(listSurfaceActive ? 1 : 0);
    const chromeVisibleMaxY = FEED_VIEW_CONSTANTS.HOME_PAGER_CHROME_VISIBLE_MAX_SCROLL_Y;

    const hasHeaderEarly = Boolean(headerComponent);
    const fadeDistEarly = hasHeaderEarly ? SCROLL_CONSTANTS.HEADER_FADE_DISTANCE : 0;

    const {
      scrollHandler,
      scrollOffsetYSV,
      contentScrollProgressSV,
      endOfFeedEnabledSV,
      endOfFeedOverscrollOpacitySV,
    } = useFeedScrollHandler({ fadeDist: fadeDistEarly, contentScrollProgressOutput });

    useEffect(() => {
      isVisibleSV.value = listSurfaceActive ? 1 : 0;
    }, [listSurfaceActive, isVisibleSV]);

    useAnimatedReaction(
      () => [scrollOffsetYSV.value, isVisibleSV.value] as const,
      (current, previous) => {
        'worklet';

        if (!isVisibleSV.value) return;

        const y = Math.max(0, current[0]);
        const prevY = previous === null ? y : Math.max(0, previous[0]);
        const prevVisible = previous === null ? 0 : previous[1];

        // Re-evaluate immediately when becoming visible (feed switch / screen focus)
        if (previous === null || prevVisible < 0.5) {
          tabBarVisibility.value = 1;
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
      [scrollOffsetYSV, tabBarVisibility, isVisibleSV, chromeVisibleMaxY]
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
          scheduleOnRN(patchHeaderBlockingPlayback, blocked === 1);
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

    const viewableAreaHeight = useMemo(() => {
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
    }, [hasTabBar, screenHeight, insets.bottom, feedLayoutHeight, useManualIosGlassTabPaddingLayout, insets.top]);

    const cardHeight = useMemo(
      () =>
        useManualIosGlassTabPaddingLayout
          ? getVideoCardHeight(screenWidth, screenHeight)
          : Math.max(0, viewableAreaHeight - FEED_VIEW_CONSTANTS.LIST_ITEM_GAP),
      [useManualIosGlassTabPaddingLayout, screenWidth, screenHeight, viewableAreaHeight]
    );

    const patchCanPlay = useCallback(
      (canPlay: boolean) => listPlaybackStore.patch({ canPlay }),
      [listPlaybackStore]
    );

    const { onViewableItemsChanged, viewabilityConfig } = useFeedVisibility({
      isActive: listSurfaceActive,
      onActiveVisibleIndexChange: handleActiveVisibleIndexChangeWithRef,
      onCanPlayChange: patchCanPlay,
    });

    useLayoutEffect(() => {
      const suppressed = !headerComponent || !isVisible || resolvedViewMode !== 'list';
      headerBlockingBaseSuppressedSV.value = suppressed ? 1 : 0;
      if (suppressed) listPlaybackStore.patch({ headerBlockingPlayback: false });
    }, [
      headerComponent,
      isVisible,
      resolvedViewMode,
      listPlaybackStore,
      headerBlockingBaseSuppressedSV,
    ]);

    const profileColors = useMemo(
      () => getProfileColors(backgroundColor, secondaryColor),
      [backgroundColor, secondaryColor]
    );
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

    const listRenderExtraData = useMemo(
      () => ({
        cardHeight,
        feedOption,
        zoomTargetPostUri: zoomTargetPostUri ?? null,
        onHashtagPress,
      }),
      [cardHeight, feedOption, zoomTargetPostUri, onHashtagPress]
    );

    const renderItem = useCallback(
      ({ item, index, target, extraData }: ListRenderItemInfo<FeedListItem>) => {
        const xd = extraData as typeof listRenderExtraData | undefined;
        const h = xd?.cardHeight ?? 0;
        if (target === RenderTargetOptions.Measurement || !xd) {
          return (
            <View
              style={StyleSheet.compose(styles.measurementPlaceholder, {
                height: Math.max(0, Math.round(h)),
              })}
            />
          );
        }

        const isAppleZoomTarget =
          Boolean(xd.zoomTargetPostUri) &&
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
          />
        );
      },

      []
    );

    const prevScreenWidthRef = useRef(screenWidth);
    useEffect(() => {
      if (prevScreenWidthRef.current === screenWidth) return;
      prevScreenWidthRef.current = screenWidth;
      const idx = activeVisibleIndexRef.current;
      if (flashListRef.current && feed.length > 0 && listSurfaceActive && idx >= 0 && resolvedViewMode === 'list') {
        try {
          flashListRef.current.scrollToIndex({ index: idx, animated: false, viewPosition: 0.5 });
        } catch (_error) {}
      }
    }, [screenWidth, feed.length, listSurfaceActive, resolvedViewMode]);

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

    const {
      snapToInterval: snapToIntervalValue,
      snapToOffsets,
      snapToAlignment,
    } = useFeedSnapOffsets({
      hasTabBar,
      isIosLiquidGlassAvailable,
      isCompact,
      hasHeader,
      headerHeight,
      cardHeight,
      itemCount: listData.length,
      itemSpacing,
      snapTopInset,
      isHeaderFeed,
    });

    const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      setHeaderHeight(prev => (h > 0 && h !== prev ? h : prev));
    }, []);

    const handleFeedLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0) {
        setFeedLayoutHeight(prev => (prev === h ? prev : h));
      }
    }, []);

    const feedScrollMotion = useMemo<FeedScrollMotionValue>(
      () => ({
        scrollOffsetYSV,
        contentScrollProgressSV,
      }),
      [scrollOffsetYSV, contentScrollProgressSV]
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
      return { paddingBottom: Math.max(0, Math.round(bottomPadding)) };
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
          isPaused={isPaused}
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
        isPaused,
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
              extraData={listRenderExtraData}
              drawDistance={Math.max(FEED_VIEW_CONSTANTS.FLASHLIST_DRAW_DISTANCE, cardHeight)}
              keyExtractor={listKeyExtractor}
              getItemType={getListItemType}
              refreshControl={refreshControlElement}
              initialScrollIndex={initialScrollIndex}
              ListHeaderComponent={listHeaderElement}
              snapToInterval={snapToIntervalValue}
              snapToOffsets={snapToOffsets}
              snapToAlignment={snapToAlignment}
              decelerationRate={
                Platform.OS === 'ios'
                  ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
                  : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID
              }
              disableIntervalMomentum={snapToIntervalValue != null}
              overScrollMode={Platform.OS === 'android' ? 'never' : undefined}
              scrollEventThrottle={16}
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
        cardHeight,
        listData,
        renderItem,
        listRenderExtraData,
        refreshControlElement,
        initialScrollIndex,
        listHeaderElement,
        snapToOffsets,
        snapToIntervalValue,
        snapToAlignment,
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
          isPaused={isPaused}
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
        isPaused,
        onRetry,
        isLoading,
        ListComponent,
        contentScrollProgressOutput,
        snapTopInset,
        useNativeTabBottomSafeArea,
        pullToRefresh,
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
