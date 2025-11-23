declare let window: any;
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Dimensions,
  StyleSheet,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScaledSize,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';

import EmptyFeed from './EmptyFeed';
import { VideoItem } from './VideoItem';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import { Colors } from '../../ui/UI';
import { Loading3FillIcon } from '../../ui/Icon';
import { preloadVideoData } from '../../../utils/helpers/video';
import { 
  APP_CONSTANTS, 
  SCROLL_CONSTANTS, 
  QUERY_CONSTANTS,
  FEED_TYPES 
} from '../../../utils/constants';
import type { FeedItem, ListFeedViewProps, ViewMode } from '../../../types';
import { useFeedVisibility } from '../../../hooks';
import { useVisibilityCoreStore } from '../../../core/visibility';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const ListFeedView: React.FC<ListFeedViewProps> = ({
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
  initialPosition,
  initialIndex,
  initialUri,
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
}) => {
  // Hooks
  const insets = useSafeAreaInsets();
  
  // Layout state
  const [headerHeight, setHeaderHeight] = useState(0);
  const [listHeight, setListHeight] = useState<number>(0);
  
  // Refs
  const flashListRef = useRef<FlashListRef<FeedItem>>(null);
  const lastScrollOffset = useRef(0);
  const positionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeaderVisibilityRef = useRef(0);
  
  // Device detection
  const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
  const isHeaderFeed = useMemo(() => (
    feedOption === FEED_TYPES.PROFILE ||
    feedOption === FEED_TYPES.LIKES ||
    feedOption === FEED_TYPES.REPOSTS ||
    (feedOption && feedOption.startsWith('at://'))
  ), [feedOption]);

  // Viewport calculations
  const viewportDimensions = useMemo(() => {
    const { width, height } = Dimensions.get('window');
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
  }, [viewportDimensions.height, viewportDimensions.effectiveInsets, isSmallDevice]);

  const scopedVisibilityKey = visibilityKey ?? feedOption;

  const {
    onViewableItemsChanged,
    viewabilityConfig,
    activeItemUri,
    canPlay,
    isFeedActive,
    isVideoVisible: isVideoVisibleHelper,
  } = useFeedVisibility({
    scopeKey: scopedVisibilityKey,
    isActive: Boolean(isVisible),
    resetOnActivate: false,
    resetOnDeactivate: false,
  });
  const setFeedHeaderVisibility = useVisibilityCoreStore((state) => state.setFeedHeaderVisibility);

  const updateHeaderVisibility = useCallback((visiblePercent: number) => {
    if (!scopedVisibilityKey || !isHeaderFeed) {
      return;
    }

    const clamped = Math.max(0, Math.min(1, visiblePercent));
    const previous = lastHeaderVisibilityRef.current;
    const previousBlocking = previous >= 0.5;
    const nextBlocking = clamped >= 0.5;
    const delta = Math.abs(previous - clamped);

    // Ignore jitter when we are clearly on the same side of the threshold
    if (!previousBlocking && !nextBlocking && delta < 0.05) {
      return;
    }
    if (previousBlocking && nextBlocking && delta < 0.05) {
      return;
    }

    lastHeaderVisibilityRef.current = clamped;
    setFeedHeaderVisibility(scopedVisibilityKey, clamped);
  }, [scopedVisibilityKey, isHeaderFeed, setFeedHeaderVisibility]);

  useEffect(() => {
    if (!scopedVisibilityKey) {
      return;
    }

    if (!isHeaderFeed) {
      if (lastHeaderVisibilityRef.current !== 0) {
        lastHeaderVisibilityRef.current = 0;
        setFeedHeaderVisibility(scopedVisibilityKey, 0);
      }
      return;
    }

    if (!isVisible || viewMode !== 'list') {
      updateHeaderVisibility(0);
      return;
    }

    if (headerHeight > 0 && lastHeaderVisibilityRef.current === 0) {
      updateHeaderVisibility(1);
    }
  }, [scopedVisibilityKey, isHeaderFeed, isVisible, viewMode, headerHeight, updateHeaderVisibility, setFeedHeaderVisibility]);

  useEffect(() => () => {
    if (!scopedVisibilityKey) {
      return;
    }
    lastHeaderVisibilityRef.current = 0;
    setFeedHeaderVisibility(scopedVisibilityKey, 0);
  }, [scopedVisibilityKey, setFeedHeaderVisibility]);

  const initialVisibilityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPrimedVisibleItemRef = useRef(false);

  const visibleFeed = useMemo(() => {
    return isRefreshing ? [] : feed;
  }, [feed, isRefreshing]);

  // List data with end card
  const listData = useMemo(() => {
    const base = visibleFeed;
    const shouldAppendEndCard = !isLoading && !isError && !isFetchingNextPage && !hasNextPage && base.length > 0;
    
    if (shouldAppendEndCard) {
      return [
        ...base,
        {
          post: { uri: 'end-card', cid: 'end-card' } as any,
          endCard: true,
        } as FeedItem,
      ];
    }
    return base;
  }, [visibleFeed, isLoading, isError, isFetchingNextPage, hasNextPage]);

  // Error handling
  const effectiveError = forceError ? new Error('Forced error for testing') : error;
  const effectiveIsError = forceError || isError;

  // Callbacks
  const handleVideoStatus = useCallback((uri: string, status: string) => {
    // Simple status handling - no complex logging needed
  }, []);

  // Scroll to index function
  const scrollToIndex = useCallback((targetIndex: number) => {
    if (!flashListRef.current || targetIndex < 0 || targetIndex >= listData.length) return;
    
    try {
      flashListRef.current.scrollToIndex({ 
        index: targetIndex, 
        animated: true,
        viewPosition: 0.5
      });
    } catch (error) {
      // Handle scroll errors gracefully
    }
  }, [listData.length]);

  // Scroll handling
  const onScrollNative = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isHeaderFeed && headerHeight > 0) {
      const offsetY = Math.max(0, e.nativeEvent.contentOffset.y);
      const clampedOffset = Math.min(headerHeight, offsetY);
      const visibleHeight = Math.max(0, headerHeight - clampedOffset);
      const visibilityRatio = headerHeight > 0 ? visibleHeight / headerHeight : 0;
      updateHeaderVisibility(visibilityRatio);
    }
    onScroll?.(e);
  }, [onScroll, isHeaderFeed, headerHeight, updateHeaderVisibility]);

  // Momentum scroll end - save position only
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    
    // Debounce position saving
    if (positionSaveTimeout.current) {
      clearTimeout(positionSaveTimeout.current);
    }
    positionSaveTimeout.current = setTimeout(() => {
      if (onPositionChange && Math.abs(offsetY - lastScrollOffset.current) > SCROLL_CONSTANTS.POSITION_CHANGE_THRESHOLD) {
        onPositionChange(offsetY);
      }
    }, APP_CONSTANTS.POSITION_SAVE_DELAY);
    lastScrollOffset.current = offsetY;
  }, [onPositionChange]);

  // Render item function - simplified visibility logic with preloading for adjacent videos
  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<FeedItem>) => {
    if (item.endCard) {
      return (
        <EmptyFeed
          type="end"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { 
            backgroundColor: backgroundColor || '#000', 
            textColor: secondaryColor 
          } : undefined}
          viewableAreaHeight={cardHeight}
          feedOption={feedOption}
        />
      );
    }

    const isVideoVisible = isVideoVisibleHelper(item.post.uri) && canPlay;
    
    // Determine if this is an adjacent video that should be preloaded
    const isAdjacentVideo = activeItemIndex >= 0 && 
                           Math.abs(index - activeItemIndex) === 1;
    const shouldPreload = isAdjacentVideo && canPlay;
    
    return (
      <VideoItem
        key={`${item.post.uri}_${index}`}
        post={item.post}
        feedItem={item}
        handleVideoStatus={handleVideoStatus}
        height={cardHeight}
        feedOption={feedOption as 'following' | 'discover'}
        isVisible={isVideoVisible}
        allowPlayback={canPlay}
        moderationDecision={item.moderationDecision}
        isModal={isModal}
        index={index}
        shouldPreload={shouldPreload}
      />
    );
  }, [
    cardHeight,
    activeItemUri,
    activeItemIndex,
    feedOption,
    canPlay,
    isFeedActive,
    backgroundColor,
    secondaryColor,
    handleVideoStatus,
    isModal,
    isVideoVisibleHelper,
  ]);

  // Item type for FlashList recycling optimization
  const getItemType = useCallback((item: FeedItem) => {
    if (item.endCard) return 'endCard';
    if (item.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
    return 'default';
  }, []);

  // Key extractor with compound keys to force component recreation
  const keyExtractor = useCallback((item: FeedItem, index: number) => {
    return item.endCard ? 'end-card' : `${item.post.uri}_${index}_${item.post.cid}`;
  }, []);

  useEffect(() => {
    return () => {
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
    if (viewMode !== 'list') return;
    if (listData.length === 0) return;
    if (activeItemUri) return;
    if (hasPrimedVisibleItemRef.current) return;

    const firstPlayableIndex = listData.findIndex((item) => !item.endCard && item?.post?.uri);
    if (firstPlayableIndex < 0) return;

    const candidate = listData[firstPlayableIndex];
    const viewToken: ViewToken = {
      item: candidate,
      key: candidate.endCard ? `end-card-${firstPlayableIndex}` : candidate.post.uri,
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
  }, [isVisible, isFeedActive, viewMode, listData, activeItemUri, onViewableItemsChanged]);

  // Grid item press handler
  const handleGridItemPress = useCallback((index: number) => {
    if (viewMode === 'grid' && onViewModeChange && index >= 0 && index < feed.length) {
      onViewModeChange('list');
      
      setTimeout(() => {
        scrollToIndex(index);
      }, APP_CONSTANTS.GRID_TO_LIST_DELAY);
    }
  }, [feed.length, viewMode, onViewModeChange, scrollToIndex]);

  // Initial positioning
  useEffect(() => {
    if (!flashListRef.current || listData.length === 0) return;

    let targetIndex = initialIndex;
    if (initialUri) {
      const foundIndex = visibleFeed.findIndex(item => item?.post?.uri === initialUri);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }
    
    if (typeof targetIndex === 'number') {
      targetIndex = Math.max(0, Math.min(targetIndex, visibleFeed.length - 1));
      
      setTimeout(() => {
        try {
          flashListRef.current?.scrollToIndex({ 
            index: targetIndex!, 
            animated: false,
            viewPosition: 0.5
          });
        } catch (error) {
          // Handle scroll errors gracefully
        }
      }, APP_CONSTANTS.INITIAL_SCROLL_DELAY);
    }
  }, [initialIndex, initialUri, visibleFeed.length, listData.length, visibleFeed]);

  // Orientation change handling
  useEffect(() => {
    const handleOrientationChange = ({ window }: { window: ScaledSize }) => {
      setTimeout(() => {
        if (flashListRef.current && visibleFeed.length > 0 && activeItemUri) {
          const currentIndex = visibleFeed.findIndex(item => item.post.uri === activeItemUri);
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
    };

    const subscription = Dimensions.addEventListener('change', handleOrientationChange);
    return () => subscription?.remove();
  }, [activeItemUri, visibleFeed]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (positionSaveTimeout.current) {
        clearTimeout(positionSaveTimeout.current);
      }
    };
  }, []);

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
      />
    );
  }

  const viewableAreaHeight = viewportDimensions.height;
  const headerHeightForTabs = useMemo(() => (ListComponent ? 280 : 0), [ListComponent]);
  const emptyComponentHeight = Math.max(0, viewableAreaHeight - headerHeightForTabs);

  // Snapping configuration
  const snapToIntervalValue = cardHeight + 6; // Account for 6px total margin (3px top + 3px bottom)

  // Custom snap offsets for header feeds
  const snapToOffsets = useMemo(() => {
    if (!headerComponent || headerHeight <= 0 || cardHeight <= 0) return null;
    const offsets: number[] = [];
    // Allow resting at the very top (header fully visible)
    offsets.push(0);
    // Base offset that centers the first item - account for 8px total margin
    const itemHeightWithMargin = cardHeight + 6;
    const centerCorrection = Math.max(0, Math.round((listHeight - itemHeightWithMargin) / 2));
    const base = Math.max(0, headerHeight - centerCorrection);
    const itemCount = listData.length;
    for (let i = 0; i < itemCount; i++) {
      offsets.push(base + i * itemHeightWithMargin);
    }
    return offsets;
  }, [headerComponent, headerHeight, cardHeight, listHeight, listData.length]);

  // Main render
  return (
    <View 
      style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]} 
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== listHeight) setListHeight(h);
      }}
    > 
      <FlashList
        ref={flashListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ListHeaderComponent={headerComponent ? (
          <View onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== headerHeight) setHeaderHeight(h);
          }}>
            {headerComponent}
          </View>
        ) : null}
        
        // FlashList performance optimizations
        removeClippedSubviews={true}
        drawDistance={cardHeight * 2} // Optimize draw distance for better performance
        estimatedItemSize={cardHeight + 6} // Better item size estimation
        overrideItemLayout={(layout, item, index) => {
          // Account for 6px total margin (3px top + 3px bottom from VideoItem marginVertical: 3)
          layout.span = cardHeight + 6;
        }}
        
        // Snapping configuration
        pagingEnabled={false}
        {...(snapToOffsets
          ? { snapToOffsets }
          : { snapToInterval: snapToIntervalValue, snapToAlignment: 'center' as const }
        )}
        decelerationRate={Platform.OS === 'ios' ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID}
        scrollEventThrottle={APP_CONSTANTS.SCROLL_THROTTLE}
        
        // Event handlers
        onScroll={onScrollNative}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onEndReached={onLoadMore}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        
        // Scroll behavior
        scrollEnabled={listData.length > 0}
        showsVerticalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled={true}
        initialScrollIndex={typeof initialIndex === 'number' ? initialIndex : undefined}
        
        // Prevent horizontal interference
        alwaysBounceVertical={false}
        alwaysBounceHorizontal={false}
        
        // Empty state components
        ListEmptyComponent={
          isLoading ? (
            <View style={[styles.centeredLoadingContainer, { backgroundColor: backgroundColor || Colors.black }]}>
              <Loading3FillIcon size={48} color={secondaryColor || Colors.white} />
            </View>
          ) : effectiveIsError ? (
            <EmptyFeed 
              type="error"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { 
                backgroundColor: backgroundColor || '#000', 
                textColor: secondaryColor 
              } : undefined}
              onRetry={onRetry}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          ) : feedOption === 'following' ? (
            <EmptyFeed 
              type="no-following"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { 
                backgroundColor: backgroundColor || '#000', 
                textColor: secondaryColor 
              } : undefined}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          ) : (
            <EmptyFeed 
              type="no-videos"
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { 
                backgroundColor: backgroundColor || '#000', 
                textColor: secondaryColor 
              } : undefined}
              isProfileFeed={isHeaderFeed}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          )
        }
        
        // Content container styling
        contentContainerStyle={{
          backgroundColor: backgroundColor || Colors.black,
          paddingBottom: visibleFeed.length === 0 ? 0 : viewportDimensions.bottomNavBarHeight,
        }}
      />
      
    </View>
  );
};

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
  clearViewExitButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default ListFeedView;
