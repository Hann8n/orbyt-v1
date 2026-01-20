import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
  memo,
} from 'react';
import {
  View,
  Dimensions,
  StyleSheet,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScaledSize,
  InteractionManager,
  LayoutChangeEvent,
  type RefreshControlProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';

import EmptyFeed from './EmptyFeed';
import { VideoItem } from './VideoItem';
import GridFeedView from './GridFeedView';
import {
  isSmallScreen,
  isTablet,
  getVideoCardHeight,
  getBottomNavBarHeight,
} from '../../../utils/device/screen';
import { Colors } from '../../ui/UI';
import { Loading3FillIcon } from '../../ui/Icon';
import {
  APP_CONSTANTS,
  SCROLL_CONSTANTS,
  QUERY_CONSTANTS,
  FEED_TYPES,
} from '../../../utils/constants';
import type { FeedListItem, EndCardItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { useFeedVisibility } from '../../../hooks';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Constants
const CONSTANTS = {
  SEPARATOR_HEIGHT: 5, // Height of black separator between items
  HEADER_HEIGHT_TABS: 280,
  HEADER_BLOCKING_THRESHOLD: 250, // Header blocks playback if scroll is less than 250px from top
} as const;

// Memoized empty component to prevent recreation on every render
interface ListEmptyComponentProps {
  isLoading: boolean;
  effectiveIsError: boolean;
  feedOption: string;
  secondaryColor?: string;
  profileColors?: { backgroundColor: string; textColor: string };
  isHeaderFeed: boolean;
  emptyComponentHeight: number;
  backgroundColor?: string;
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
    backgroundColor,
    onRetry,
  }) => {
    if (isLoading) {
      return (
        <View
          style={[
            styles.centeredLoadingContainer,
            { backgroundColor: backgroundColor || Colors.black },
          ]}
        >
          <Loading3FillIcon
            size={48}
            color={profileColors?.textColor || secondaryColor || Colors.white}
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
    if (feedOption === 'following') {
      return <EmptyFeed type="no-following" {...commonProps} />;
    }
    return <EmptyFeed type="no-videos" {...commonProps} />;
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
      prevProps.backgroundColor === nextProps.backgroundColor &&
      prevProps.onRetry === nextProps.onRetry
    );
  }
);

ListEmptyComponent.displayName = 'ListEmptyComponent';

const ListFeedViewComponent = forwardRef<ListFeedViewRef, ListFeedViewProps>(
  (
    {
      feed,
      headerComponent,
      refreshControl,
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
      onViewModeChange,
      isModal = false,
      onScroll,
      onVerticalScroll,
      forceError = false,
      ListComponent,
      targetScrollIndex,
    },
    ref
  ) => {
    // Hooks
    const insets = useSafeAreaInsets();

    // Layout state
    const [headerHeight, setHeaderHeight] = useState(0);
    const listHeightRef = useRef<number>(0);

    // Refs
    const flashListRef = useRef<FlashListRef<FeedListItem>>(null);

    // Removed cache optimization to avoid setState in effects
    // Computing offsets directly is fast enough for the use case

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
    // Track current scroll offset for header blocking
    const currentScrollOffsetRef = useRef<number>(0);

    // Device detection
    const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
    const isHeaderFeed = useMemo(
      () =>
        feedOption === FEED_TYPES.PROFILE ||
        feedOption === FEED_TYPES.LIKES ||
        feedOption === FEED_TYPES.REPOSTS ||
        (feedOption && feedOption.startsWith('at://')) ||
        (feedOption && feedOption.startsWith('hashtag:orbyt-channel-')) ||
        Boolean(headerComponent),
      [feedOption, headerComponent]
    );

    // Viewport calculations
    const viewportDimensions = useMemo(() => {
      const { width, height } = Dimensions.get('window');
      const bottomNavBarHeight = getBottomNavBarHeight(insets);

      const viewportHeight = isSmallDevice ? height : height - bottomNavBarHeight - insets.top;

      return {
        width,
        height: viewportHeight,
        effectiveInsets: insets,
        bottomNavBarHeight,
        isFullScreen: isSmallDevice,
      };
    }, [isSmallDevice, insets]);

    // Card height calculation
    const cardHeight = useMemo(() => {
      if (isSmallDevice) {
        return viewportDimensions.height;
      }
      return getVideoCardHeight(viewportDimensions.effectiveInsets);
    }, [viewportDimensions.height, viewportDimensions.effectiveInsets, isSmallDevice]);

    const { onViewableItemsChanged, viewabilityConfig, activeItemIndexRef, extraData, canPlay } =
      useFeedVisibility({
        isActive: Boolean(isVisible),
      });

    // Track scroll-based blocking state (updated by scroll handler)
    // Initialize to true if header exists (assume at top on mount)
    const [scrollBasedBlocking, setScrollBasedBlocking] = useState(() => Boolean(headerComponent));
    const prevHeaderComponentRef = useRef(headerComponent);

    // Reset scroll offset ref when header component changes (refs are safe in effects)
    // State reset is handled in scroll handler to avoid setState in effect
    useEffect(() => {
      const prev = prevHeaderComponentRef.current;
      prevHeaderComponentRef.current = headerComponent;
      if (prev !== headerComponent) {
        currentScrollOffsetRef.current = 0;
      }
    }, [headerComponent]);

    // Compute final blocking state in render
    const isHeaderBlockingPlayback = useMemo(() => {
      if (!headerComponent || !isVisible || viewMode !== 'list') {
        return false;
      }
      return scrollBasedBlocking;
    }, [headerComponent, isVisible, viewMode, scrollBasedBlocking]);

    // Memoize profileColors to prevent recreation on every render
    const profileColors = useMemo(
      () =>
        secondaryColor
          ? {
              backgroundColor: backgroundColor || '#000',
              textColor: secondaryColor,
            }
          : undefined,
      [backgroundColor, secondaryColor]
    );

    // Track reported posts for filtering
    // Subscribe to the store to react to changes
    const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);

    // Filter feed to remove reported posts and filtered posts
    // Moderation flags are already computed at feed level (in useFeed hook)
    // FlashList's maintainVisibleContentPosition handles item changes smoothly - no LayoutAnimation needed
    const filteredFeed = useMemo(() => {
      return feed.filter(item => {
        if ('endCard' in item && item.endCard) return true;
        const feedItem = item as ExtendedFeedViewPost;
        const uri = feedItem.post.uri;
        // Filter out reported posts
        if (reportedPostUris.has(uri)) return false;
        // Filter out posts marked for filtering (flags computed in useFeed)
        // Check if item has shouldFilter flag (from ExtendedFeedViewPost)
        if (feedItem.shouldFilter) return false;
        return true;
      });
    }, [feed, reportedPostUris]);

    // List data with end card
    // FlashList's maintainVisibleContentPosition will handle position preservation
    // Reanimated layout animations handle smooth removal of reported posts and addition of new items
    const listData = useMemo(() => {
      const shouldAppendEndCard =
        !isLoading && !isError && !isFetchingNextPage && !hasNextPage && filteredFeed.length > 0;

      if (shouldAppendEndCard) {
        return [
          ...filteredFeed,
          {
            post: { uri: 'end-card', cid: 'end-card' },
            endCard: true,
          } as EndCardItem,
        ];
      }
      return filteredFeed;
    }, [filteredFeed, isLoading, isError, isFetchingNextPage, hasNextPage]);

    // Error handling
    const effectiveIsError = forceError || isError;

    // Scroll to index function
    const scrollToIndex = useCallback(
      (targetIndex: number) => {
        if (!flashListRef.current || targetIndex < 0 || targetIndex >= listData.length) return;

        try {
          flashListRef.current.scrollToIndex({
            index: targetIndex,
            animated: false,
            viewPosition: 0.5,
          });
        } catch (_error) {
          // Handle scroll errors gracefully
        }
      },
      [listData.length]
    );

    // Scroll handling - optimized to reduce work on scroll thread
    const onScrollNative = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = e.nativeEvent.contentOffset.y;
        // Track current scroll offset for state initialization
        currentScrollOffsetRef.current = offsetY;

        // Update header blocking state: block if scroll is less than threshold from top
        // Also handle header component changes (reset handled in scroll handler to avoid setState in effect)
        if (!headerComponent) {
          if (scrollBasedBlocking) {
            setScrollBasedBlocking(false);
          }
        } else {
          const isBlocking = offsetY < CONSTANTS.HEADER_BLOCKING_THRESHOLD;
          if (isBlocking !== scrollBasedBlocking) {
            setScrollBasedBlocking(isBlocking);
          }
        }

        // Forward vertical scroll offset to parent (for header animations, etc.)
        if (onVerticalScroll) {
          onVerticalScroll(offsetY);
        }
        // Call external onScroll if provided (but don't block scroll thread)
        if (onScroll) {
          onScroll(e);
        }
      },
      [onScroll, onVerticalScroll, headerComponent, scrollBasedBlocking]
    );

    // Render item function - optimized to reduce dependencies and rerenders
    const renderItem = useCallback(
      ({ item, index }: ListRenderItemInfo<FeedListItem>) => {
        const canPlayWithHeader = canPlay && !isHeaderBlockingPlayback;
        // Use ref directly for immediate access (no React state delay)
        const isCentered = index === activeItemIndexRef.current;
        // Video is "visible" for tracking if centered - maintains tracking even when feed is inactive
        // Dim video when header is blocking (treat as non-visible for dimming, but still tracked)
        // allowPlayback controls actual playback based on canPlay state
        const isVideoVisible = isCentered && !isHeaderBlockingPlayback;

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

        // item is ExtendedFeedViewPost here
        const feedItem = item as ExtendedFeedViewPost;
        // Get moderation flags from feed item (computed at feed level)
        const shouldBlur = feedItem.shouldBlur ?? false;

        return (
          <VideoItem
            feedItem={feedItem}
            post={feedItem.post}
            height={cardHeight}
            feedOption={feedOption as 'following' | 'discover'}
            isVisible={isVideoVisible}
            allowPlayback={isCentered && canPlayWithHeader}
            shouldBlur={shouldBlur}
            isModal={isModal}
            index={index}
          />
        );
      },
      [
        cardHeight,
        feedOption,
        canPlay,
        isModal,
        secondaryColor,
        isHeaderBlockingPlayback,
        activeItemIndexRef, // Stable ref, included for completeness
        // profileColors removed - unnecessary dependency
      ]
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
    const keyExtractor = useCallback((item: FeedListItem, _index: number) => {
      if ('endCard' in item && item.endCard) return 'end-card';
      return `${item.post.uri}:${item.post.cid}`;
    }, []);

    // Stable overrideItemLayout callback - no margins needed, using ItemSeparatorComponent instead
    const overrideItemLayout = useCallback(
      (
        layout: { span?: number },
        _item: FeedListItem,
        _index: number,
        _maxColumns: number,
        _extraData?: unknown
      ) => {
        // FlashList docs: layout.span is the only property we modify
        layout.span = cardHeight;
      },
      [cardHeight]
    );

    // Separator component for black gaps between items
    // Must be a component function, not a JSX element
    const ItemSeparator = useCallback(() => {
      return <View style={{ height: CONSTANTS.SEPARATOR_HEIGHT, backgroundColor: Colors.black }} />;
    }, []);

    // FlashList's native viewability handles item detection automatically
    // maintainVisibleContentPosition preserves scroll position, so the visible item
    // at that position will be detected by the viewability callback

    // Unified item press handler for grid feeds
    // Uses FlashList's native scrollToIndex when switching to list view
    const handleGridItemPress = useCallback(
      (index: number) => {
        if (viewMode === 'grid' && onViewModeChange && index >= 0 && index < feed.length) {
          onViewModeChange('list');

          // Move to background thread
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              scrollToIndex(index);
            }, APP_CONSTANTS.GRID_TO_LIST_DELAY);
          });
        }
      },
      [feed.length, viewMode, onViewModeChange, scrollToIndex]
    );

    // Handle targetScrollIndex prop - scrolls to target on initial mount only
    const hasScrolledToTargetRef = useRef(false);
    useEffect(() => {
      if (
        targetScrollIndex !== null &&
        targetScrollIndex !== undefined &&
        viewMode === 'list' &&
        listData.length > 0 &&
        !hasScrolledToTargetRef.current &&
        flashListRef.current
      ) {
        const targetIndex = Math.max(0, Math.min(targetScrollIndex, listData.length - 1));
        // Move to background thread
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            flashListRef.current?.scrollToIndex({
              index: targetIndex,
              animated: false,
              viewPosition: 0.5,
            });
            hasScrolledToTargetRef.current = true;
          }, APP_CONSTANTS.GRID_TO_LIST_DELAY);
        });
      }
    }, [targetScrollIndex, viewMode, listData.length]);

    // Orientation change handling - moved to background thread
    const handleOrientationChange = useCallback(
      (_event: { window: ScaledSize }) => {
        // Move to background thread to avoid blocking UI
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            const currentActiveIndex = activeItemIndexRef.current;
            if (flashListRef.current && feed.length > 0 && currentActiveIndex >= 0) {
              try {
                flashListRef.current.scrollToIndex({
                  index: currentActiveIndex,
                  animated: false,
                  viewPosition: 0.5,
                });
              } catch (_error) {
                // Handle scroll errors gracefully
              }
            }
          }, APP_CONSTANTS.ORIENTATION_CHANGE_DELAY);
        });
      },
      [activeItemIndexRef, feed]
    );

    useEffect(() => {
      const subscription = Dimensions.addEventListener('change', handleOrientationChange);
      return () => subscription?.remove();
    }, [handleOrientationChange]);

    // Calculate viewport dimensions for list view (always compute to avoid conditional hooks)
    const viewableAreaHeight = viewportDimensions.height;
    const headerHeightForTabs = useMemo(
      () => (ListComponent ? CONSTANTS.HEADER_HEIGHT_TABS : 0),
      [ListComponent]
    );
    const emptyComponentHeight = useMemo(
      () => Math.max(0, viewableAreaHeight - headerHeightForTabs),
      [viewableAreaHeight, headerHeightForTabs]
    );

    // Snapping configuration - memoized to prevent recalculation (always compute)
    // FlashList's ItemSeparatorComponent adds spacing between items, so we need to account for it
    // Total spacing from start of one item to start of next = cardHeight + separatorHeight
    const itemSpacing = useMemo(() => cardHeight + CONSTANTS.SEPARATOR_HEIGHT, [cardHeight]);
    const snapToIntervalValue = useMemo(() => itemSpacing, [itemSpacing]);

    // Custom snap offsets - memoized to prevent recalculation
    // Use snapToInterval for small devices (full screen displays)
    // Exclude safe area when in modal mode
    const topInset = useMemo(() => (isModal ? 0 : insets.top), [insets.top, isModal]);
    const hasHeader = useMemo(() => Boolean(headerComponent), [headerComponent]);

    const snapToOffsets = useMemo(() => {
      if (isSmallDevice) return null;

      const offsets: number[] = hasHeader ? [0] : [];

      for (let i = 0; i < listData.length; i++) {
        if (hasHeader && headerHeight > 0 && cardHeight > 0) {
          const base = Math.max(0, headerHeight - topInset);
          offsets.push(base + i * itemSpacing);
        } else {
          offsets.push(i * itemSpacing - topInset);
        }
      }

      return offsets;
    }, [
      headerHeight,
      cardHeight,
      listData.length,
      topInset,
      isSmallDevice,
      hasHeader,
      itemSpacing,
    ]);

    // Stable layout callbacks to prevent recreation (always compute)
    const handleListLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== listHeightRef.current) {
        listHeightRef.current = h;
        // No state update needed - just track for comparison
      }
    }, []);

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

    // Grid view rendering
    if (viewMode === 'grid') {
      // Filter out endCard items for grid view (only ExtendedFeedViewPost needed)
      const gridFeed = feed.filter((item): item is ExtendedFeedViewPost => {
        return !('endCard' in item && item.endCard);
      });

      return (
        <GridFeedView
          feed={gridFeed}
          headerComponent={headerComponent}
          refreshControl={refreshControl}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          isProfileFeed={isHeaderFeed}
          feedOption={feedOption}
          userDid={userDid}
          onLoadMore={onLoadMore}
          hasNextPage={hasNextPage}
          onGridItemPress={handleGridItemPress}
          isError={effectiveIsError}
          onRetry={onRetry}
          ListComponent={ListComponent}
          onVerticalScroll={onVerticalScroll}
        />
      );
    }

    // Main render
    return (
      <View
        style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]}
        onLayout={handleListLayout}
      >
        <FlashList
          ref={flashListRef}
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          extraData={extraData}
          overrideItemLayout={overrideItemLayout}
          ListHeaderComponent={
            headerComponent ? (
              <View onLayout={handleHeaderLayout}>
                {headerComponent}
                {listData.length > 0 && !('endCard' in listData[0] && listData[0].endCard) && (
                  <View
                    style={{ height: CONSTANTS.SEPARATOR_HEIGHT, backgroundColor: Colors.black }}
                  />
                )}
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
          // Event handlers
          onScroll={onScrollNative}
          onEndReached={onLoadMore}
          onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // Scroll behavior
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
          bounces={true}
          directionalLockEnabled={true}
          maintainVisibleContentPosition={{
            autoscrollToTopThreshold: undefined,
          }}
          // Pull to refresh - disabled in modal mode
          refreshControl={
            isModal || !refreshControl
              ? undefined
              : (refreshControl as React.ReactElement<RefreshControlProps>)
          }
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
              backgroundColor={backgroundColor}
              onRetry={onRetry}
            />
          }
          // Item separator for black gaps between cards
          ItemSeparatorComponent={ItemSeparator}
          // Content container styling
          contentContainerStyle={[
            styles.contentContainer,
            { backgroundColor: backgroundColor || 'transparent' },
            feed.length > 0 && {
              paddingBottom: viewportDimensions.bottomNavBarHeight,
            },
          ]}
        />
      </View>
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
    minHeight: SCREEN_HEIGHT,
  },
  contentContainer: {
    backgroundColor: Colors.black,
  },
});

ListFeedViewComponent.displayName = 'ListFeedView';

export default ListFeedViewComponent;
