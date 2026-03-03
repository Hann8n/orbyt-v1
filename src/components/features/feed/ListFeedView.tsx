import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
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
  getProfileColors,
  isHeaderFeed as getIsHeaderFeed,
} from './feedViewShared';
import { getViewportDimensions } from '../../../utils/device/screen';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { getVideoCardHeight } from '../../../utils/video/helpers';
import { Colors } from '../../../theme';
import { APP_CONSTANTS, SCROLL_CONSTANTS, QUERY_CONSTANTS } from '../../../utils/constants';
import type { FeedListItem, EndCardItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { useFeedVisibility, useVisibilityCoreStore } from '../../../core/visibility';

// Reanimated-wrapped FlashList so useAnimatedScrollHandler runs on UI thread. Do not use @shopify/flash-list's AnimatedFlashList (it uses RN Animated).
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as ComponentType<
  FlashListProps<FeedListItem> & { ref?: Ref<FlashListRef<FeedListItem>> }
>;

// Memoized empty component to prevent recreation on every render
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

const ListEmptyComponent = memo<ListEmptyComponentProps>(
  ({
    isLoading,
    effectiveIsError,
    feedOption,
    secondaryColor,
    profileColors,
    isHeaderFeed,
    emptyComponentHeight,
    onRetry,
  }) => {
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
  },
  (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary rerenders
    return (
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.effectiveIsError === nextProps.effectiveIsError &&
      prevProps.feedOption === nextProps.feedOption &&
      prevProps.secondaryColor === nextProps.secondaryColor &&
      prevProps.profileColors === nextProps.profileColors &&
      prevProps.isHeaderFeed === nextProps.isHeaderFeed &&
      prevProps.emptyComponentHeight === nextProps.emptyComponentHeight &&
      prevProps.onRetry === nextProps.onRetry
    );
  }
);

ListEmptyComponent.displayName = 'ListEmptyComponent';

// ViewHolder passes leadingItem/trailingItem; accept for FlashList v2 compat, ignore for static bar.
const ItemSeparator = memo(
  ({
    leadingItem: _leadingItem,
    trailingItem: _trailingItem,
  }: {
    leadingItem?: FeedListItem;
    trailingItem?: FeedListItem;
  }) => (
    <View style={{ height: FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT, backgroundColor: Colors.black }} />
  )
);
ItemSeparator.displayName = 'ItemSeparator';

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
      isModal = false,
      contentScrollProgressOutput,
      forceError = false,
      ListComponent,
      targetScrollIndex,
      onGridItemPress: onGridItemPressProp,
    },
    ref
  ) => {
    // Hooks
    const insets = useSafeAreaInsets();

    // Layout state
    const [headerHeight, setHeaderHeight] = useState(0);
    // Track scroll-based blocking state (driven by useAnimatedReaction when crossing HEADER_BLOCKING_THRESHOLD)
    const [scrollBasedBlocking, setScrollBasedBlocking] = useState(() => Boolean(headerComponent));

    // Refs
    const flashListRef = useRef<FlashListRef<FeedListItem>>(null);

    // Scroll offset for percent-visible: written in useAnimatedScrollHandler (UI thread), read in VideoCard worklet.
    const scrollOffsetYSV = useSharedValue(0);

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
        scrollToTop: () => {
          flashListRef.current?.scrollToTop({ animated: true });
        },
      }),
      []
    );

    // Device detection
    const { screenWidth: width, screenHeight, isCompact: isCompactDevice } = useDeviceLayout();
    const isHeaderFeed = useMemo(
      () => getIsHeaderFeed(feedOption, headerComponent),
      [feedOption, headerComponent]
    );

    // Viewport calculations (single source of truth for list + cards)
    const viewportDimensions = useMemo(
      () => getViewportDimensions(isModal, isHeaderFeed, insets),
      [isModal, isHeaderFeed, insets, width, screenHeight]
    );

    // Card height: standard 9:16 portrait card from screen width, capped by screen height (not viewport).
    const cardHeight = useMemo(
      () => getVideoCardHeight(width, screenHeight),
      [width, screenHeight]
    );

    const { onViewableItemsChanged, viewabilityConfig, canPlay, feedKey } = useFeedVisibility({
      feedOption,
      userDid,
      isActive: Boolean(isVisible),
    });

    // Compute final blocking state in render
    const isHeaderBlockingPlayback = useMemo(() => {
      if (!headerComponent || !isVisible || viewMode !== 'list') {
        return false;
      }
      return scrollBasedBlocking;
    }, [headerComponent, isVisible, viewMode, scrollBasedBlocking]);

    // Memoize profileColors to prevent recreation on every render
    const profileColors = useMemo(
      () => getProfileColors(backgroundColor, secondaryColor),
      [backgroundColor, secondaryColor]
    );

    // List data with end card (feed is already filtered by FeedRenderer: reported + shouldFilter)
    // FlashList's maintainVisibleContentPosition will handle position preservation
    // Reanimated layout animations handle smooth removal of reported posts and addition of new items
    const listData = useMemo(() => {
      const shouldAppendEndCard =
        !isLoading && !isError && !isFetchingNextPage && !hasNextPage && feed.length > 0;

      if (shouldAppendEndCard) {
        return [
          ...feed,
          {
            post: { uri: 'end-card', cid: 'end-card' },
            endCard: true,
          } as EndCardItem,
        ];
      }
      return feed;
    }, [feed, isLoading, isError, isFetchingNextPage, hasNextPage]);

    // Error handling
    const effectiveIsError = forceError || isError;

    // Render item function - optimized to reduce dependencies and rerenders
    // VideoItem derives isVisible from store (activeFeedKey+lastViewableIndexByFeed) and allowPlayback from isVisible&&canPlay
    const renderItem = useCallback(
      ({ item, index, target }: ListRenderItemInfo<FeedListItem>) => {
        // FlashList may call renderItem with target=Measurement for layout; skip heavy work (video, images)
        if (target === RenderTargetOptions.Measurement) {
          return <View style={{ height: cardHeight }} />;
        }

        // Type guard for endCard
        if ('endCard' in item && item.endCard) {
          return (
            <EmptyFeed
              type="end"
              secondaryColor={secondaryColor}
              viewableAreaHeight={cardHeight}
              feedOption={feedOption}
            />
          );
        }

        const feedItem = item as ExtendedFeedViewPost;
        return (
          <VideoItem
            feedItem={feedItem}
            post={feedItem.post}
            height={cardHeight}
            feedOption={feedOption as 'following' | 'discover'}
            feedKey={feedKey}
            canPlay={canPlay}
            isHeaderBlockingPlayback={isHeaderBlockingPlayback}
            isModal={isModal}
            index={index}
          />
        );
      },
      [cardHeight, feedOption, feedKey, canPlay, isModal, secondaryColor, isHeaderBlockingPlayback]
    );

    // Item type for FlashList recycling optimization
    const getItemType = useCallback((item: FeedListItem) => {
      if ('endCard' in item && item.endCard) return 'endCard';
      // item is ExtendedFeedViewPost here
      const feedItem = item as ExtendedFeedViewPost;
      if (feedItem.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
      return 'default';
    }, []);

    // Key extractor with stable keys (no index) for FlashList v2 maintainVisibleContentPosition
    // Index-based keys cause issues when new items are added because existing items get new keys
    const keyExtractor = useCallback(
      (item: FeedListItem, _index: number) => getFeedItemKey(item),
      []
    );

    // FlashList's native viewability handles item detection automatically
    // maintainVisibleContentPosition preserves scroll position, so the visible item
    // at that position will be detected by the viewability callback

    // Calculate initialScrollIndex from targetScrollIndex for FlashList's built-in prop
    // This avoids any scrolling animation or jumps - FlashList handles it natively
    const initialScrollIndex = useMemo(() => {
      if (
        targetScrollIndex !== null &&
        targetScrollIndex !== undefined &&
        viewMode === 'list' &&
        listData.length > 0
      ) {
        return Math.max(0, Math.min(targetScrollIndex, listData.length - 1));
      }
      return undefined;
    }, [targetScrollIndex, viewMode, listData.length]);

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

    // Calculate viewport dimensions for list view (always compute to avoid conditional hooks)
    const viewableAreaHeight = viewportDimensions.height;
    const headerHeightForTabs = useMemo(
      () => (ListComponent ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS : 0),
      [ListComponent]
    );
    const emptyComponentHeight = useMemo(
      () => Math.max(0, viewableAreaHeight - headerHeightForTabs),
      [viewableAreaHeight, headerHeightForTabs]
    );

    // Snapping configuration - memoized to prevent recalculation (always compute)
    // FlashList's ItemSeparatorComponent adds spacing between items, so we need to account for it
    // Total spacing from start of one item to start of next = cardHeight + separatorHeight
    const itemSpacing = useMemo(
      () => cardHeight + FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT,
      [cardHeight]
    );
    const snapToIntervalValue = useMemo(() => itemSpacing, [itemSpacing]);
    const hasHeader = useMemo(() => Boolean(headerComponent), [headerComponent]);

    // Header-feed specific top inset policy for snapping
    // - Header feeds:
    //   - Small/tablet devices -> snap items to the very top (ignore top safe area)
    //   - Taller root/header feeds -> snap just below the status bar safe area
    // - Non-header feeds keep existing behavior (small devices ignore inset to stay full-screen)
    const headerSnapTopInset = useMemo(() => {
      if (!isHeaderFeed) {
        return null;
      }

      if (isCompactDevice || (isModal && hasHeader)) return 0;
      return insets.top;
    }, [isHeaderFeed, isCompactDevice, isModal, hasHeader, insets.top]);

    const nonHeaderSnapTopInset = useMemo(
      () => (isCompactDevice ? 0 : insets.top),
      [isCompactDevice, insets.top]
    );

    const snapTopInset = useMemo(
      () => (headerSnapTopInset !== null ? headerSnapTopInset : nonHeaderSnapTopInset),
      [headerSnapTopInset, nonHeaderSnapTopInset]
    );

    const snapToOffsets = useMemo(() => {
      // Always use snapToOffsets when there's a header to properly account for header height
      // snapToInterval doesn't account for headers, so it causes scroll issues
      if (!hasHeader && isCompactDevice) return null;

      const offsets: number[] = hasHeader ? [0] : [];

      for (let i = 0; i < listData.length; i++) {
        if (hasHeader && headerHeight > 0 && cardHeight > 0) {
          // Header height from onLayout already includes all padding (including safe area)
          // Use full headerHeight to ensure we scroll past the entire header
          // For header feeds, adjust by snapTopInset so first card lands where desired
          const baseOffset = headerHeight + i * itemSpacing;
          offsets.push(baseOffset - (isHeaderFeed ? snapTopInset : 0));
        } else {
          offsets.push(i * itemSpacing - snapTopInset);
        }
      }

      return offsets;
    }, [
      headerHeight,
      cardHeight,
      listData.length,
      snapTopInset,
      isCompactDevice,
      hasHeader,
      itemSpacing,
      isHeaderFeed,
    ]);

    const handleHeaderLayout = useCallback(
      (e: LayoutChangeEvent) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== headerHeight) {
          // Use requestAnimationFrame to avoid blocking layout
          requestAnimationFrame(() => {
            setHeaderHeight(h);
          });
        }
      },
      [headerHeight]
    );

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
            // eslint-disable-next-line react-hooks/immutability
            contentScrollProgressOutput.value = Math.max(0, Math.min(1, y / fadeDist));
          }
        },
      },
      [contentScrollProgressOutput, fadeDist]
    );

    // Memoize context value to avoid unnecessary re-renders of list consumers when layout/scroll haven't changed.
    // Must be before the grid early return so hooks run in the same order every render.
    const feedScrollValue = useMemo(
      () => ({
        scrollOffsetYSV,
        headerHeight,
        viewportHeight: viewportDimensions.height,
        itemSpacing,
        contentScrollProgressSV,
      }),
      [
        scrollOffsetYSV,
        headerHeight,
        viewportDimensions.height,
        itemSpacing,
        contentScrollProgressSV,
      ]
    );

    // Grid view rendering (feed from FeedRenderer has no endCard; filter satisfies GridFeedView type)
    if (viewMode === 'grid') {
      const gridFeed = feed.filter(
        (item): item is ExtendedFeedViewPost => !('endCard' in item && item.endCard)
      );
      return (
        <GridFeedView
          feed={gridFeed}
          headerComponent={headerComponent}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          isProfileFeed={isHeaderFeed}
          feedOption={feedOption}
          userDid={userDid}
          onLoadMore={onLoadMore}
          hasNextPage={hasNextPage}
          onGridItemPress={onGridItemPressProp}
          isError={effectiveIsError}
          onRetry={onRetry}
          ListComponent={ListComponent}
        />
      );
    }

    return (
      <FeedScrollProvider value={feedScrollValue}>
        <View style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]}>
          <AnimatedFlashList
            ref={flashListRef}
            data={listData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            initialScrollIndex={initialScrollIndex}
            ListHeaderComponent={
              headerComponent ? (
                <View onLayout={handleHeaderLayout}>
                  {headerComponent}
                  <View
                    style={{
                      height: FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT,
                      backgroundColor: Colors.black,
                    }}
                  />
                </View>
              ) : null
            }
            // Snapping configuration

            pagingEnabled={false}
            snapToOffsets={snapToOffsets ?? undefined}
            snapToInterval={snapToOffsets ? undefined : snapToIntervalValue}
            snapToAlignment={snapToOffsets ? undefined : ('center' as const)}
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
            showsVerticalScrollIndicator={false}
            bounces={true}
            directionalLockEnabled={true}
            // Prevent horizontal interference
            alwaysBounceVertical={false}
            alwaysBounceHorizontal={false}
            // Empty state components - extracted to memoized component
            ListEmptyComponent={
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
            }
            // Item separator for black gaps between cards
            ItemSeparatorComponent={ItemSeparator}
            contentContainerStyle={[
              styles.contentContainer,
              feed.length > 0 && {
                paddingBottom: viewportDimensions.bottomNavBarHeight,
              },
            ]}
          />
        </View>
      </FeedScrollProvider>
    );
  }
);

const styles = StyleSheet.create({
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
    backgroundColor: Colors.black,
  },
});

ListFeedViewComponent.displayName = 'ListFeedView';

export default ListFeedViewComponent;
