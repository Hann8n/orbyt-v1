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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';
import { LayoutAnimation } from 'react-native';

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
import type { UIFeedItem, ListFeedViewProps, ListFeedViewRef } from '../../../types';
import { useFeedVisibility } from '../../../hooks';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Constants
const CONSTANTS = {
  ITEM_MARGIN: 6, // 3px top + 3px bottom
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
          <Loading3FillIcon size={48} color={secondaryColor || Colors.white} />
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
      error,
      onRetry,
      onPositionChange,
      isVisible = true,
      viewMode,
      onViewModeChange,
      isModal = false,
      isProfileLoading = false,
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
    const flashListRef = useRef<FlashListRef<UIFeedItem>>(null);

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
    const lastScrollOffset = useRef(0);
    const positionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track current scroll offset
    const currentScrollOffsetRef = useRef<number>(0);
    // Track requestAnimationFrame ID for header blocking updates
    const headerBlockingUpdateFrameRef = useRef<number | null>(null);

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

    // Track reported posts for animated removal
    // Subscribe to the store to react to changes
    const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);
    const previousFeedLengthRef = useRef<number>(0);
    const previousFilteredLengthRef = useRef<number>(0);

    // Filter feed to remove reported posts and filtered posts
    // Moderation flags are already computed at feed level (in useFeed hook)
    const filteredFeed = useMemo(() => {
      return feed.filter(item => {
        if (item.endCard) return true;
        const uri = item.post.uri;
        // Filter out reported posts
        if (reportedPostUris.has(uri)) return false;
        // Filter out posts marked for filtering (flags computed in useFeed)
        // Check if item has shouldFilter flag (from ExtendedFeedViewPost)
        if (item.shouldFilter) return false;
        return true;
      });
    }, [feed, reportedPostUris]);

    // Prepare layout animation when items are added or removed
    useEffect(() => {
      const currentLength = filteredFeed.length;
      const previousLength = previousFilteredLengthRef.current;

      // Only prepare animation if length changed (items added or removed)
      // Skip on initial mount (previousLength === 0)
      if (previousLength > 0 && currentLength !== previousLength) {
        // Use React Native's LayoutAnimation for smooth transitions
        LayoutAnimation.configureNext({
          duration: 300,
          create: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
          update: {
            type: LayoutAnimation.Types.easeInEaseOut,
          },
          delete: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
        });
      }

      previousFilteredLengthRef.current = currentLength;
      previousFeedLengthRef.current = feed.length;
    }, [filteredFeed.length, feed.length]);

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
          } as UIFeedItem,
        ];
      }
      return filteredFeed;
    }, [filteredFeed, isLoading, isError, isFetchingNextPage, hasNextPage]);

    // Error handling
    const effectiveError = forceError ? new Error('Forced error for testing') : error;
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

    // Momentum scroll end - save position (moved to background thread)
    const onMomentumScrollEnd = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = e.nativeEvent.contentOffset.y;
        lastScrollOffset.current = offsetY;

        // Move position saving to background thread to avoid blocking scroll
        if (positionSaveTimeout.current) {
          clearTimeout(positionSaveTimeout.current);
        }
        positionSaveTimeout.current = setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            if (
              onPositionChange &&
              Math.abs(offsetY - lastScrollOffset.current) >
                SCROLL_CONSTANTS.POSITION_CHANGE_THRESHOLD
            ) {
              onPositionChange(offsetY);
            }
          });
        }, APP_CONSTANTS.POSITION_SAVE_DELAY);
      },
      [onPositionChange]
    );

    // Render item function - optimized to reduce dependencies and rerenders
    const renderItem = useCallback(
      ({ item, index }: ListRenderItemInfo<UIFeedItem>) => {
        const canPlayWithHeader = canPlay && !isHeaderBlockingPlayback;
        // Use ref directly for immediate access (no React state delay)
        const isCentered = index === activeItemIndexRef.current;
        // Video is "visible" for tracking if centered - maintains tracking even when feed is inactive
        // Dim video when header is blocking (treat as non-visible for dimming, but still tracked)
        // allowPlayback controls actual playback based on canPlay state
        const isVideoVisible = isCentered && !isHeaderBlockingPlayback;

        if (item.endCard) {
          return (
            <EmptyFeed
              type="end"
              secondaryColor={secondaryColor}
              profileColors={profileColors}
              viewableAreaHeight={cardHeight}
              feedOption={feedOption}
            />
          );
        }

        // Get moderation flags from feed item (computed at feed level)
        const shouldBlur = item.shouldBlur ?? false;

        return (
          <VideoItem
            post={item.post}
            feedItem={item}
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
        profileColors,
        isHeaderBlockingPlayback,
        activeItemIndexRef, // Stable ref, included for completeness
      ]
    );

    // Item type for FlashList recycling optimization
    const getItemType = useCallback((item: UIFeedItem) => {
      if (item.endCard) return 'endCard';
      if (item.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
      return 'default';
    }, []);

    // Key extractor with stable keys (no index) for FlashList v2 maintainVisibleContentPosition
    // Index-based keys cause issues when new items are added because existing items get new keys
    const keyExtractor = useCallback((item: UIFeedItem, _index: number) => {
      return item.endCard ? 'end-card' : `${item.post.uri}:${item.post.cid}`;
    }, []);

    // Stable overrideItemLayout callback to prevent recreation
    const itemHeightWithMargin = cardHeight + CONSTANTS.ITEM_MARGIN;
    const overrideItemLayout = useCallback(
      (
        layout: { span?: number },
        _item: UIFeedItem,
        _index: number,
        _maxColumns: number,
        _extraData?: unknown
      ) => {
        // Account for item margin added to VideoCard
        // FlashList docs: layout.span is the only property we modify
        layout.span = itemHeightWithMargin;
      },
      [itemHeightWithMargin]
    );

    // Cleanup timeout and animation frame refs to prevent memory leaks
    useEffect(() => {
      return () => {
        if (positionSaveTimeout.current) {
          clearTimeout(positionSaveTimeout.current);
          positionSaveTimeout.current = null;
        }
        if (headerBlockingUpdateFrameRef.current !== null) {
          cancelAnimationFrame(headerBlockingUpdateFrameRef.current);
          headerBlockingUpdateFrameRef.current = null;
        }
      };
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
    const snapToIntervalValue = useMemo(() => cardHeight + CONSTANTS.ITEM_MARGIN, [cardHeight]);

    // Custom snap offsets - computed directly each render (simple enough to not need caching)
    const topInset = viewportDimensions.effectiveInsets.top;
    const hasHeader = Boolean(headerComponent);

    // Calculate snap offsets directly (no caching to avoid setState in effects)
    const snapToOffsets = useMemo(() => {
      if (isSmallDevice && !hasHeader) return null;

      const itemHeightWithMargin = cardHeight + CONSTANTS.ITEM_MARGIN;
      const currentLength = listData.length;

      // Helper: calculate offset for item at index
      const getOffset = (i: number): number => {
        if (hasHeader && headerHeight > 0 && cardHeight > 0) {
          const base = Math.max(0, headerHeight - (!isSmallDevice ? topInset : 0));
          return base + i * itemHeightWithMargin;
        }
        return i * itemHeightWithMargin - topInset;
      };

      // Compute all offsets
      const offsets: number[] = hasHeader ? [0] : [];
      for (let i = 0; i < currentLength; i++) {
        offsets.push(getOffset(i));
      }
      return offsets;
    }, [headerHeight, cardHeight, listData.length, topInset, isSmallDevice, hasHeader]);

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
      return (
        <GridFeedView
          feed={feed}
          headerComponent={headerComponent}
          refreshControl={refreshControl}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          isProfileLoading={isProfileLoading}
          isProfileFeed={isHeaderFeed}
          feedOption={feedOption}
          userDid={userDid}
          onLoadMore={onLoadMore}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          onGridItemPress={handleGridItemPress}
          isError={effectiveIsError}
          error={effectiveError}
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
          ListHeaderComponent={
            headerComponent ? <View onLayout={handleHeaderLayout}>{headerComponent}</View> : null
          }
          // FlashList performance optimizations
          overrideItemLayout={overrideItemLayout}
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
          onMomentumScrollEnd={onMomentumScrollEnd}
          onEndReached={onLoadMore}
          onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // Scroll behavior
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
          bounces={true}
          directionalLockEnabled={true}
          // FlashList v2: Maintain scroll position when content changes
          maintainVisibleContentPosition={{
            disabled: false,
            autoscrollToTopThreshold: undefined,
          }}
          // Pull to refresh
          refreshControl={refreshControl as any}
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
          // Content container styling
          contentContainerStyle={[
            styles.contentContainer,
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
