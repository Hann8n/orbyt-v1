declare let window: any;
import React, {
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
  ViewToken,
  InteractionManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FlashList,
  FlashListRef,
  type ListRenderItemInfo,
} from "@shopify/flash-list";

import EmptyFeed from "./EmptyFeed";
import { VideoItem } from "./VideoItem";
import GridFeedView from "./GridFeedView";
import {
  isSmallScreen,
  isTablet,
  getVideoCardHeight,
  getBottomNavBarHeight,
} from "../../../utils/helpers";
import type { ModerationDecision } from "../../../services/ModerationTypes";
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
  ViewMode,
  ListFeedViewRef,
} from "../../../types";
import { useFeedVisibility } from "../../../hooks";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Constants
const CONSTANTS = {
  ITEM_MARGIN: 6, // 3px top + 3px bottom
  HEADER_HEIGHT_TABS: 280,
  SNAP_THRESHOLD: 0.5,
  VISIBILITY_JITTER_THRESHOLD: 0.05,
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
      isRefreshing = false,
      isProfileLoading = false,
      onScroll,
      forceError = false,
      ListComponent,
      visibilityKey,
      targetScrollIndex,
      dataUpdatedAt = 0,
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
    const lastHeaderVisibilityRef = useRef(0);
    const [isHeaderBlockingPlayback, setIsHeaderBlockingPlayback] =
      useState(false);

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

    const scopedVisibilityKey = visibilityKey ?? feedOption;

    const {
      onViewableItemsChanged,
      viewabilityConfig,
      activeItemUri,
      activeItemIndex,
      canPlay,
      isFeedActive,
      reset: resetFeedVisibility,
    } = useFeedVisibility({
      scopeKey: scopedVisibilityKey,
      isActive: Boolean(isVisible),
      resetOnActivate: false,
      resetOnDeactivate: false,
    });

    const updateHeaderVisibility = useCallback(
      (visiblePercent: number) => {
        if (!isHeaderFeed) {
          return;
        }

        const clamped = Math.max(0, Math.min(1, visiblePercent));
        const previous = lastHeaderVisibilityRef.current;
        const previousBlocking = previous >= CONSTANTS.SNAP_THRESHOLD;
        const nextBlocking = clamped >= CONSTANTS.SNAP_THRESHOLD;
        const delta = Math.abs(previous - clamped);

        // If crossing the blocking threshold, update immediately
        const isThresholdCrossing = previousBlocking !== nextBlocking;

        // For non-threshold-crossing updates, apply jitter filtering
        if (!isThresholdCrossing) {
          // Ignore jitter when we are clearly on the same side of the threshold
          if (
            !previousBlocking &&
            !nextBlocking &&
            delta < CONSTANTS.VISIBILITY_JITTER_THRESHOLD
          ) {
            return;
          }
          if (
            previousBlocking &&
            nextBlocking &&
            delta < CONSTANTS.VISIBILITY_JITTER_THRESHOLD
          ) {
            return;
          }
        }

        lastHeaderVisibilityRef.current = clamped;
        setIsHeaderBlockingPlayback(nextBlocking);
      },
      [isHeaderFeed],
    );

    useEffect(() => {
      if (!isHeaderFeed) {
        if (lastHeaderVisibilityRef.current !== 0) {
          lastHeaderVisibilityRef.current = 0;
          setIsHeaderBlockingPlayback(false);
        }
        return;
      }

      if (!isVisible || viewMode !== "list") {
        updateHeaderVisibility(0);
        return;
      }

      if (headerHeight > 0 && lastHeaderVisibilityRef.current === 0) {
        updateHeaderVisibility(1);
      }
    }, [
      isHeaderFeed,
      isVisible,
      viewMode,
      headerHeight,
      updateHeaderVisibility,
    ]);

    useEffect(
      () => () => {
        lastHeaderVisibilityRef.current = 0;
        setIsHeaderBlockingPlayback(false);
      },
      [],
    );

    const initialVisibilityTimeout = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    const hasPrimedVisibleItemRef = useRef(false);

    // When the underlying feed identity changes (e.g., profile tabs: posts/likes/reposts),
    // reset visibility so the new feed can prime its centered item cleanly.
    useEffect(() => {
      // Reset global feed visibility entry
      resetFeedVisibility();
      // Reset local header and priming state
      lastHeaderVisibilityRef.current = 0;
      setIsHeaderBlockingPlayback(false);
      hasPrimedVisibleItemRef.current = false;
    }, [resetFeedVisibility, feedOption, userDid]);

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

    // List data with end card
    // FlashList's maintainVisibleContentPosition will handle position preservation
    const listData = useMemo(() => {
      const base = feed;
      const shouldAppendEndCard =
        !isLoading &&
        !isError &&
        !isFetchingNextPage &&
        !hasNextPage &&
        base.length > 0;

      if (shouldAppendEndCard) {
        return [
          ...base,
          {
            post: { uri: "end-card", cid: "end-card" } as any,
            endCard: true,
          } as FeedItem,
        ];
      }
      return base;
    }, [feed, isLoading, isError, isFetchingNextPage, hasNextPage]);

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
        // Only calculate header visibility if needed
        // Calculate directly without requestAnimationFrame for immediate updates
        if (isHeaderFeed && headerHeight > 0) {
          const offsetY = e.nativeEvent.contentOffset.y;
          const clampedOffset = Math.min(headerHeight, Math.max(0, offsetY));
          const visibleHeight = Math.max(0, headerHeight - clampedOffset);
          const visibilityRatio = headerHeight > 0 ? visibleHeight / headerHeight : 0;
          updateHeaderVisibility(visibilityRatio);
        }
        // Call external onScroll if provided (but don't block scroll thread)
        if (onScroll) {
          onScroll(e);
        }
      },
      [onScroll, isHeaderFeed, headerHeight, updateHeaderVisibility],
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
        const isCentered = index === activeItemIndex;

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

        // Use center index as the single source of truth for "visible" video
        const isVideoVisible = isCentered && canPlayWithHeader;

        return (
          <VideoItem
            post={item.post}
            feedItem={item}
            height={cardHeight}
            feedOption={feedOption as "following" | "discover"}
            isVisible={isVideoVisible}
            allowPlayback={isVideoVisible}
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
        activeItemIndex,
        secondaryColor,
        profileColors,
        isHeaderBlockingPlayback,
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
      (layout: any) => {
        // Account for item margin added to VideoCard
        layout.span = itemHeightWithMargin;
      },
      [itemHeightWithMargin],
    );

    // Comprehensive cleanup for all timeout refs to prevent memory leaks
    useEffect(() => {
      return () => {
        if (positionSaveTimeout.current) {
          clearTimeout(positionSaveTimeout.current);
          positionSaveTimeout.current = null;
        }
        if (initialVisibilityTimeout.current) {
          clearTimeout(initialVisibilityTimeout.current);
          initialVisibilityTimeout.current = null;
        }
        hasPrimedVisibleItemRef.current = false;
      };
    }, []);

    useEffect(() => {
      if (activeItemUri) {
        hasPrimedVisibleItemRef.current = true;
      }
    }, [activeItemUri]);

    // Prime initial visible item only on first mount when feed is visible
    useEffect(() => {
      if (!isVisible || !isFeedActive) return;
      if (viewMode !== "list") return;
      if (listData.length === 0) return;
      if (activeItemUri) return;
      if (hasPrimedVisibleItemRef.current) return;

      const firstPlayableIndex = listData.findIndex(
        (item) => !item.endCard && item?.post?.uri,
      );
      if (firstPlayableIndex < 0) return;

      const candidate = listData[firstPlayableIndex];
      const viewToken: ViewToken = {
        item: candidate,
        key: candidate.endCard
          ? `end-card-${firstPlayableIndex}`
          : candidate.post.uri,
        index: firstPlayableIndex,
        isViewable: true,
        section: undefined,
      };

      if (initialVisibilityTimeout.current) {
        clearTimeout(initialVisibilityTimeout.current);
      }

      initialVisibilityTimeout.current = setTimeout(() => {
        onViewableItemsChanged({ viewableItems: [viewToken] });
        hasPrimedVisibleItemRef.current = true;
      }, 0);
    }, [
      isVisible,
      isFeedActive,
      viewMode,
      listData,
      activeItemUri,
      onViewableItemsChanged,
    ]);

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
      ({ window }: { window: ScaledSize }) => {
        // Move to background thread to avoid blocking UI
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            if (flashListRef.current && feed.length > 0 && activeItemUri) {
              const currentIndex = feed.findIndex(
                (item) => item.post.uri === activeItemUri,
              );
              if (currentIndex >= 0) {
                try {
                  flashListRef.current.scrollToIndex({
                    index: currentIndex,
                    animated: false,
                    viewPosition: 0.5,
                  });
                } catch (error) {
                  // Handle scroll errors gracefully
                }
              }
            }
          }, APP_CONSTANTS.ORIENTATION_CHANGE_DELAY);
        });
      },
      [activeItemUri, feed],
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

    // Custom snap offsets for header feeds and non-header feeds
    // Memoized with stable dependencies to prevent recalculation on every render
    const snapToOffsets = useMemo(() => {
      const itemHeightWithMargin = cardHeight + CONSTANTS.ITEM_MARGIN;

      if (headerComponent && headerHeight > 0 && cardHeight > 0) {
        // Header feeds: snap at top (header visible) and then align items between bars
        const offsets: number[] = [];
        offsets.push(0); // Allow resting at the very top (header fully visible)

        // For feeds with headers, align first video item between status and bottom bars
        // after scrolling past the header
        const topInset = viewportDimensions.effectiveInsets.top;
        const base = Math.max(0, headerHeight - topInset);

        const itemCount = listData.length;
        for (let i = 0; i < itemCount; i++) {
          offsets.push(base + i * itemHeightWithMargin);
        }
        return offsets;
      }

      // Non-header feeds: align videos between status bar and bottom bar
      if (!isSmallDevice) {
        const offsets: number[] = [];
        const topInset = viewportDimensions.effectiveInsets.top;
        const itemCount = listData.length;

        for (let i = 0; i < itemCount; i++) {
          // Start offset accounts for status bar
          offsets.push(i * itemHeightWithMargin - topInset);
        }
        return offsets;
      }

      return null;
    }, [
      headerComponent,
      headerHeight,
      cardHeight,
      listData.length,
      viewportDimensions.effectiveInsets.top,
      viewportDimensions.bottomNavBarHeight,
      isSmallDevice,
    ]);

    // Stable layout callbacks to prevent recreation
    // Use ref instead of state to avoid rerenders
    const handleListLayout = useCallback((e: any) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== listHeightRef.current) {
        listHeightRef.current = h;
        // No state update needed - just track for comparison
      }
    }, []);

    const handleHeaderLayout = useCallback((e: any) => {
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
          ListHeaderComponent={
            headerComponent ? (
              <View onLayout={handleHeaderLayout}>
                {headerComponent}
              </View>
            ) : null
          }
          // FlashList performance optimizations
          removeClippedSubviews={true}
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
