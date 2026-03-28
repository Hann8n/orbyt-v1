import {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
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
import { useOverlayLayout } from '../../../context/OverlayLayoutContext';
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
import { buildListSnapViewport } from './listSnapViewport';
import { Colors } from '../../../theme';
import { APP_CONSTANTS, SCROLL_CONSTANTS, QUERY_CONSTANTS } from '../../../utils/constants';
import type { FeedListItem, EndCardItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { useFeedVisibility, useVisibilityCoreStore } from '../../../core/visibility';

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
  if ('endCard' in item && item.endCard) return 'endCard';
  // item is ExtendedFeedViewPost here
  const feedItem = item as ExtendedFeedViewPost;
  if (feedItem.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
  return 'default';
};

const listKeyExtractor = (item: FeedListItem, _index: number): string => getFeedItemKey(item);

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
      zoomTargetPostUri,
      gridFeedModalZoomConfig,
    },
    ref
  ) => {
    // Hooks
    const insets = useSafeAreaInsets();

    // Layout state
    const [headerHeight, setHeaderHeight] = useState(0);
    const [measuredViewportHeight, setMeasuredViewportHeight] = useState<number | null>(null);
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
    const isHeaderFeed = getIsHeaderFeed(feedOption, headerComponent);

    const viewportDimensions = getViewportDimensions(isModal, isHeaderFeed, insets);
    const overlayLayout = useOverlayLayout();
    const effectiveBottomNavBarHeight =
      overlayLayout?.bottomNavBarHeight ?? viewportDimensions.bottomNavBarHeight;
    const { useLegacyLiquidGlassLayout, snapViewportHeight, cardHeightForList } =
      buildListSnapViewport({
        screenWidth: width,
        screenHeight,
        legacyViewportHeight: viewportDimensions.height,
        bottomNavBarHeight: effectiveBottomNavBarHeight,
      });
    const autoViewportHeight = measuredViewportHeight ?? snapViewportHeight;
    const viewableAreaHeight = useLegacyLiquidGlassLayout ? snapViewportHeight : autoViewportHeight;
    const cardHeight = useLegacyLiquidGlassLayout
      ? cardHeightForList
      : Math.max(0, viewableAreaHeight - FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT);

    const { onViewableItemsChanged, viewabilityConfig, canPlay, feedKey } = useFeedVisibility({
      feedOption,
      userDid,
      isActive: Boolean(isVisible),
    });

    const isHeaderBlockingPlayback =
      !headerComponent || !isVisible || viewMode !== 'list' ? false : scrollBasedBlocking;

    // Memoize profileColors to prevent recreation on every render
    const profileColors = getProfileColors(backgroundColor, secondaryColor);

    // List data with end card (feed is already filtered by FeedRenderer: reported + shouldFilter)
    // FlashList's maintainVisibleContentPosition will handle position preservation
    // Reanimated layout animations handle smooth removal of reported posts and addition of new items
    const listData = (() => {
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
    })();

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
        const isAppleZoomTarget =
          isModal &&
          Boolean(zoomTargetPostUri) &&
          feedItem.post?.uri === zoomTargetPostUri &&
          Platform.OS === 'ios';
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
            isAppleZoomTarget={isAppleZoomTarget}
          />
        );
      },
      [
        cardHeight,
        feedOption,
        feedKey,
        canPlay,
        isModal,
        secondaryColor,
        isHeaderBlockingPlayback,
        zoomTargetPostUri,
      ]
    );

    // Item type + keys are handled by pure module-scope helpers.

    // FlashList's native viewability handles item detection automatically
    // maintainVisibleContentPosition preserves scroll position, so the visible item
    // at that position will be detected by the viewability callback

    // Calculate initialScrollIndex from targetScrollIndex for FlashList's built-in prop
    // This avoids any scrolling animation or jumps - FlashList handles it natively
    const initialScrollIndex = (() => {
      if (
        targetScrollIndex !== null &&
        targetScrollIndex !== undefined &&
        viewMode === 'list' &&
        listData.length > 0
      ) {
        return Math.max(0, Math.min(targetScrollIndex, listData.length - 1));
      }

      return undefined;
    })();

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
    const headerHeightForTabs = ListComponent ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS : 0;
    const emptyComponentHeight = Math.max(0, viewableAreaHeight - headerHeightForTabs);

    // Snapping configuration - memoized to prevent recalculation (always compute)
    // FlashList's ItemSeparatorComponent adds spacing between items, so we need to account for it
    // Total spacing from start of one item to start of next = cardHeight + separatorHeight
    const itemSpacing = cardHeight + FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT;
    const snapToIntervalValue = itemSpacing;
    const hasHeader = Boolean(headerComponent);

    // Header-feed specific top inset policy for snapping
    // - Header feeds:
    //   - Small/tablet devices -> snap items to the very top (ignore top safe area)
    //   - Taller root/header feeds -> snap just below the status bar safe area
    // - Non-header feeds keep existing behavior (small devices ignore inset to stay full-screen)
    const headerSnapTopInset = !isHeaderFeed
      ? null
      : useLegacyLiquidGlassLayout
        ? isCompactDevice || (isModal && hasHeader)
          ? 0
          : insets.top
        : 0;

    const nonHeaderSnapTopInset = useLegacyLiquidGlassLayout
      ? isCompactDevice
        ? 0
        : insets.top
      : 0;
    const snapTopInset = headerSnapTopInset !== null ? headerSnapTopInset : nonHeaderSnapTopInset;

    const snapToOffsets = (() => {
      // Always use snapToOffsets when there's a header to properly account for header height
      // snapToInterval doesn't account for headers, so it causes scroll issues
      if (useLegacyLiquidGlassLayout && !hasHeader && isCompactDevice) return null;

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
    })();

    const handleHeaderLayout = (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== headerHeight) {
        // Use requestAnimationFrame to avoid blocking layout
        requestAnimationFrame(() => {
          setHeaderHeight(h);
        });
      }
    };

    const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0) {
        setMeasuredViewportHeight(prev => (prev === h ? prev : h));
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
        },
      },
      [contentScrollProgressOutput, fadeDist]
    );

    // Memoize context value to avoid unnecessary re-renders of list consumers when layout/scroll haven't changed.
    // Must be before the grid early return so hooks run in the same order every render.
    const feedScrollValue = {
      scrollOffsetYSV,
      headerHeight,
      viewportHeight: viewableAreaHeight,
      itemSpacing,
      contentScrollProgressSV,
    };

    // Grid view rendering (feed from FeedRenderer has no endCard; filter satisfies GridFeedView type)
    if (viewMode === 'grid') {
      const gridFeed = feed.filter(
        (item): item is ExtendedFeedViewPost => !('endCard' in item && item.endCard)
      );
      return (
        <GridFeedView
          feed={gridFeed}
          headerComponent={headerComponent}
          isModal={isModal}
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
        />
      );
    }

    return (
      <FeedScrollProvider value={feedScrollValue}>
        <View
          style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]}
          onLayout={handleContainerLayout}
        >
          <AnimatedFlashList
            ref={flashListRef}
            data={listData}
            renderItem={renderItem}
            keyExtractor={listKeyExtractor}
            getItemType={getListItemType}
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
            snapToAlignment={
              snapToOffsets ? undefined : useLegacyLiquidGlassLayout ? 'center' : 'start'
            }
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
            ItemSeparatorComponent={ItemSeparatorComponent}
            contentContainerStyle={[
              styles.contentContainer,
              feed.length > 0 && {
                paddingBottom: effectiveBottomNavBarHeight,
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
  itemSeparator: {
    height: FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT,
    backgroundColor: Colors.black,
  },
});

ListFeedViewComponent.displayName = 'ListFeedView';

export default ListFeedViewComponent;
