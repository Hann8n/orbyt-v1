import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FlashList,
  FlashListRef,
  type ListRenderItemInfo,
} from "@shopify/flash-list";
import { useReportedPostsStore } from "../../../stores/reportedPostsStore";
import { LayoutAnimation } from "react-native";

import EmptyFeed from "./EmptyFeed";
import { VideoItem } from "./VideoItem";
import GridFeedView from "./GridFeedView";
import {
  isSmallScreen,
  isTablet,
  getVideoCardHeight,
  getBottomNavBarHeight,
} from "../../../utils/helpers";
import { Colors } from "../../ui/UI";
import { Loading3FillIcon } from "../../ui/Icon";
import {
  APP_CONSTANTS,
  SCROLL_CONSTANTS,
  QUERY_CONSTANTS,
  FEED_TYPES,
} from "../../../utils/constants";
import type {
  FeedItem,
  ListFeedViewProps,
  ListFeedViewRef,
} from "../../../types";
import { useFeedVisibility } from "../../../hooks";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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
          <Loading3FillIcon
            size={48}
            color={secondaryColor || Colors.white}
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
      return (
        <EmptyFeed type="error" onRetry={onRetry} {...commonProps} />
      );
    }
    if (feedOption === "following") {
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
  },
);

ListEmptyComponent.displayName = "ListEmptyComponent";

const ListFeedView = forwardRef<ListFeedViewRef, ListFeedViewProps>(
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
    ref,
  ) => {
    // Hooks
    const insets = useSafeAreaInsets();

    // Layout state
    const [headerHeight, setHeaderHeight] = useState(0);
    const listHeightRef = useRef<number>(0);

    // Refs
    const flashListRef = useRef<FlashListRef<FeedItem>>(null);
    
    // Cache for incremental snapToOffsets calculation
    const snapOffsetsCacheRef = useRef<{
      offsets: number[] | null;
      length: number;
      headerHeight: number;
      cardHeight: number;
      topInset: number;
      isSmallDevice: boolean;
      hasHeader: boolean;
    } | null>(null);

    // Expose scrollToTop method
    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => {
          flashListRef.current?.scrollToTop({ animated: true });
        },
      }),
      [],
    );
    const lastScrollOffset = useRef(0);
    const positionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const [isHeaderBlockingPlayback, setIsHeaderBlockingPlayback] =
      useState(false);
    // Track current scroll offset to initialize blocking state correctly
    const currentScrollOffsetRef = useRef<number>(0);
    // Track blocking state in ref to avoid state updates on every scroll
    const isHeaderBlockingRef = useRef<boolean>(false);
    // Track requestAnimationFrame ID for header blocking updates
    const headerBlockingUpdateFrameRef = useRef<number | null>(null);

    // Device detection
    const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
    const isHeaderFeed = useMemo(
      () =>
        feedOption === FEED_TYPES.PROFILE ||
        feedOption === FEED_TYPES.LIKES ||
        feedOption === FEED_TYPES.REPOSTS ||
        (feedOption && feedOption.startsWith("at://")) ||
        (feedOption && feedOption.startsWith("hashtag:orbyt-channel-")) ||
        Boolean(headerComponent),
      [feedOption, headerComponent],
    );

    // Viewport calculations
    const viewportDimensions = useMemo(() => {
      const { width, height } = Dimensions.get("window");
      const bottomNavBarHeight = getBottomNavBarHeight(insets);

      const viewportHeight = isSmallDevice
        ? height
        : height - bottomNavBarHeight - insets.top;

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
    }, [
      viewportDimensions.height,
      viewportDimensions.effectiveInsets,
      isSmallDevice,
    ]);

    const {
      onViewableItemsChanged,
      viewabilityConfig,
      activeItemIndexRef,
      extraData,
      canPlay,
    } = useFeedVisibility({
      isActive: Boolean(isVisible),
    });

    // Simplified header blocking logic: block playback if scroll is less than threshold from top
    // This is consistent across all header feeds (profiles, channels, etc.)
    // Initialize blocking state based on current scroll position when feed becomes visible
    useEffect(() => {
      if (!isHeaderFeed) {
        setIsHeaderBlockingPlayback(false);
        currentScrollOffsetRef.current = 0;
        return;
      }

      if (!isVisible || viewMode !== "list") {
        setIsHeaderBlockingPlayback(false);
        return;
      }

      // When feed becomes visible, check current scroll position and set blocking state
      // Default to blocking (true) for header feeds - safer default until we get scroll event
      // The first scroll event will update this correctly based on actual scroll position
      const currentOffset = currentScrollOffsetRef.current;
      // If we have a tracked scroll position, use it; otherwise default to blocking (safer)
      const isBlocking = currentOffset === 0 || currentOffset < CONSTANTS.HEADER_BLOCKING_THRESHOLD;
      isHeaderBlockingRef.current = isBlocking;
      setIsHeaderBlockingPlayback(isBlocking);
    }, [isHeaderFeed, isVisible, viewMode]);

    // Memoize profileColors to prevent recreation on every render
    const profileColors = useMemo(
      () =>
        secondaryColor
          ? {
              backgroundColor: backgroundColor || "#000",
              textColor: secondaryColor,
            }
          : undefined,
      [backgroundColor, secondaryColor],
    );

    // Track reported posts for animated removal
    // Subscribe to the store to react to changes
    const reportedPostUris = useReportedPostsStore((state) => state.reportedPostUris);
    const previousFeedLengthRef = useRef<number>(0);
    const previousFilteredLengthRef = useRef<number>(0);

    // Filter feed to remove reported posts
    const filteredFeed = useMemo(() => {
      return feed.filter((item) => {
        if (item.endCard) return true;
        return !reportedPostUris.has(item.post.uri);
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
        !isLoading &&
        !isError &&
        !isFetchingNextPage &&
        !hasNextPage &&
        filteredFeed.length > 0;

      if (shouldAppendEndCard) {
        return [
          ...filteredFeed,
          {
            post: { uri: "end-card", cid: "end-card" },
            endCard: true,
          } as FeedItem,
        ];
      }
      return filteredFeed;
    }, [filteredFeed, isLoading, isError, isFetchingNextPage, hasNextPage]);

    // Error handling
    const effectiveError = forceError
      ? new Error("Forced error for testing")
      : error;
    const effectiveIsError = forceError || isError;

    // Scroll to index function
    const scrollToIndex = useCallback(
      (targetIndex: number) => {
        if (
          !flashListRef.current ||
          targetIndex < 0 ||
          targetIndex >= listData.length
        )
          return;

        try {
          flashListRef.current.scrollToIndex({
            index: targetIndex,
            animated: false,
            viewPosition: 0.5,
          });
        } catch (error) {
          // Handle scroll errors gracefully
        }
      },
      [listData.length],
    );

    // Scroll handling - optimized to reduce work on scroll thread
    const onScrollNative = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = e.nativeEvent.contentOffset.y;
        // Track current scroll offset for state initialization
        currentScrollOffsetRef.current = offsetY;
        
        // Simplified header blocking: block if scroll is less than threshold from top
        // Use ref to track state and only update React state when it changes
        if (isHeaderFeed) {
          const isBlocking = offsetY < CONSTANTS.HEADER_BLOCKING_THRESHOLD;
          
          // Only update state if blocking state actually changed
          if (isBlocking !== isHeaderBlockingRef.current) {
            isHeaderBlockingRef.current = isBlocking;
            
            // Clear any pending animation frame
            if (headerBlockingUpdateFrameRef.current !== null) {
              cancelAnimationFrame(headerBlockingUpdateFrameRef.current);
            }
            
            // Use requestAnimationFrame for immediate next frame update (better than setTimeout)
            headerBlockingUpdateFrameRef.current = requestAnimationFrame(() => {
              setIsHeaderBlockingPlayback(isBlocking);
              headerBlockingUpdateFrameRef.current = null;
            });
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
      [onScroll, onVerticalScroll, isHeaderFeed],
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
      [onPositionChange],
    );

    // Render item function - optimized to reduce dependencies and rerenders
    const renderItem = useCallback(
      ({ item, index }: ListRenderItemInfo<FeedItem>) => {
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

        return (
          <VideoItem
            post={item.post}
            feedItem={item}
            height={cardHeight}
            feedOption={feedOption as "following" | "discover"}
            isVisible={isVideoVisible}
            allowPlayback={isCentered && canPlayWithHeader}
            moderationDecision={item.moderationDecision}
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
        extraData, // Triggers re-render when active item changes (via FlashList extraData)
        secondaryColor,
        profileColors,
        isHeaderBlockingPlayback,
        activeItemIndexRef, // Stable ref, included for completeness
      ],
    );

    // Item type for FlashList recycling optimization
    const getItemType = useCallback((item: FeedItem) => {
      if (item.endCard) return "endCard";
      if (item.post?.embed?.$type === "app.bsky.embed.record#view")
        return "video";
      return "default";
    }, []);

    // Key extractor with stable keys (no index) for FlashList v2 maintainVisibleContentPosition
    // Index-based keys cause issues when new items are added because existing items get new keys
    const keyExtractor = useCallback((item: FeedItem, _index: number) => {
      return item.endCard ? "end-card" : `${item.post.uri}:${item.post.cid}`;
    }, []);

    // Stable overrideItemLayout callback to prevent recreation
    const itemHeightWithMargin = cardHeight + CONSTANTS.ITEM_MARGIN;
    const overrideItemLayout = useCallback(
      (layout: { span?: number }, _item: FeedItem, _index: number, _maxColumns: number, _extraData?: unknown) => {
        // Account for item margin added to VideoCard
        // FlashList docs: layout.span is the only property we modify
        layout.span = itemHeightWithMargin;
      },
      [itemHeightWithMargin],
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
        if (
          viewMode === "grid" &&
          onViewModeChange &&
          index >= 0 &&
          index < feed.length
        ) {
          onViewModeChange("list");

          // Move to background thread
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              scrollToIndex(index);
            }, APP_CONSTANTS.GRID_TO_LIST_DELAY);
          });
        }
      },
      [feed.length, viewMode, onViewModeChange, scrollToIndex],
    );

    // Handle targetScrollIndex prop - scrolls to target on initial mount only
    const hasScrolledToTargetRef = useRef(false);
    useEffect(() => {
      if (
        targetScrollIndex !== null &&
        targetScrollIndex !== undefined &&
        viewMode === "list" &&
        listData.length > 0 &&
        !hasScrolledToTargetRef.current &&
        flashListRef.current
      ) {
        const targetIndex = Math.max(
          0,
          Math.min(targetScrollIndex, listData.length - 1),
        );
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
              } catch (error) {
                // Handle scroll errors gracefully
              }
            }
          }, APP_CONSTANTS.ORIENTATION_CHANGE_DELAY);
        });
      },
      [activeItemIndexRef, feed],
    );

    useEffect(() => {
      const subscription = Dimensions.addEventListener(
        "change",
        handleOrientationChange,
      );
      return () => subscription?.remove();
    }, [handleOrientationChange]);

    // Grid view rendering
    if (viewMode === "grid") {
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

    const viewableAreaHeight = viewportDimensions.height;
    const headerHeightForTabs = useMemo(
      () => (ListComponent ? CONSTANTS.HEADER_HEIGHT_TABS : 0),
      [ListComponent],
    );
    const emptyComponentHeight = useMemo(
      () => Math.max(0, viewableAreaHeight - headerHeightForTabs),
      [viewableAreaHeight, headerHeightForTabs],
    );

    // Snapping configuration - memoized to prevent recalculation
    const snapToIntervalValue = useMemo(
      () => cardHeight + CONSTANTS.ITEM_MARGIN,
      [cardHeight],
    );

    // Custom snap offsets - optimized with incremental calculation
    const topInset = viewportDimensions.effectiveInsets.top;
    const hasHeader = Boolean(headerComponent);
    const snapToOffsets = useMemo(() => {
      const itemHeightWithMargin = cardHeight + CONSTANTS.ITEM_MARGIN;
      const currentLength = listData.length;
      const cache = snapOffsetsCacheRef.current;

      // Helper: calculate offset for item at index
      const getOffset = (i: number): number => {
        if (hasHeader && headerHeight > 0 && cardHeight > 0) {
          const base = Math.max(0, headerHeight - (!isSmallDevice ? topInset : 0));
          return base + i * itemHeightWithMargin;
        }
        return i * itemHeightWithMargin - topInset;
      };

      // Check if layout changed
      const layoutChanged = !cache ||
        cache.headerHeight !== headerHeight ||
        cache.cardHeight !== cardHeight ||
        cache.topInset !== topInset ||
        cache.isSmallDevice !== isSmallDevice ||
        cache.hasHeader !== hasHeader;

      // Full recalculation when layout changes
      if (layoutChanged || !cache) {
        if (isSmallDevice && !hasHeader) return null;
        const offsets: number[] = hasHeader ? [0] : [];
        for (let i = 0; i < currentLength; i++) {
          offsets.push(getOffset(i));
        }
        snapOffsetsCacheRef.current = {
          offsets,
          length: currentLength,
          headerHeight,
          cardHeight,
          topInset,
          isSmallDevice,
          hasHeader,
        };
        return offsets;
      }

      // Incremental update when only length changes
      const { offsets: cachedOffsets, length: prevLength } = cache;
      if (!cachedOffsets || currentLength === prevLength) return cachedOffsets;

      if (currentLength > prevLength) {
        // Append new offsets
        const newOffsets = [...cachedOffsets];
        for (let i = prevLength; i < currentLength; i++) {
          newOffsets.push(getOffset(i));
        }
        snapOffsetsCacheRef.current = { ...cache, offsets: newOffsets, length: currentLength };
        return newOffsets;
      }

      // Slice when items removed
      const targetLength = currentLength + (hasHeader ? 1 : 0);
      const newOffsets = cachedOffsets.slice(0, targetLength);
      snapOffsetsCacheRef.current = { ...cache, offsets: newOffsets, length: currentLength };
      return newOffsets;
    }, [headerComponent, headerHeight, cardHeight, listData.length, topInset, isSmallDevice, hasHeader]);

    // Stable layout callbacks to prevent recreation
    // Use ref instead of state to avoid rerenders
    const handleListLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== listHeightRef.current) {
        listHeightRef.current = h;
        // No state update needed - just track for comparison
      }
    }, []);

    const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== headerHeight) {
        // Use requestAnimationFrame to avoid blocking layout
        requestAnimationFrame(() => {
          setHeaderHeight(h);
        });
      }
    }, [headerHeight]);

    // Main render
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: backgroundColor || Colors.black },
        ]}
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
            headerComponent ? (
              <View onLayout={handleHeaderLayout}>
                {headerComponent}
              </View>
            ) : null
          }
          // FlashList performance optimizations
          overrideItemLayout={overrideItemLayout}
          // Snapping configuration
          pagingEnabled={false}
          {...(snapToOffsets
            ? { snapToOffsets }
            : {
                snapToInterval: snapToIntervalValue,
                snapToAlignment: "center" as const,
              })}
          decelerationRate={
            Platform.OS === "ios"
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
          // New videos are added to subsequent pages without disrupting current view
          // disabled: false (default) ensures scroll position is preserved
          // autoscrollToTopThreshold: undefined prevents auto-scrolling when new items are added at top
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
          contentContainerStyle={{
            // Force black between items so margins render as black
            backgroundColor: Colors.black,
            paddingBottom:
              feed.length === 0 ? 0 : viewportDimensions.bottomNavBarHeight,
          }}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredLoadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: SCREEN_HEIGHT,
  },
});

export default ListFeedView;
