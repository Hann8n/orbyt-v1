declare let window: any;
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScaledSize,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';

import EmptyFeed from './EmptyFeed';
import { MemoizedVideoItem } from './VideoItem';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { Colors } from '../../ui/UI';
import { preloadVideoData } from '../../../utils/helpers/video';
import { 
  APP_CONSTANTS, 
  VIEWABILITY_CONSTANTS, 
  SCROLL_CONSTANTS, 
  QUERY_CONSTANTS,
  FEED_TYPES 
} from '../../../utils/constants';
import type { FeedItem, ListFeedViewProps, ViewMode } from '../../../types';

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
  isVisible,
  viewMode,
  onViewModeChange,
  isModal = false,
  isRefreshing = false,
  isProfileLoading = false,
  onVisibleChange,
  onScroll,
  forceError = false,
  ListComponent,
}) => {
  // Hooks
  const insets = useSafeAreaInsets();
  
  // Simplified visibility state - only track the currently visible video URI
  const [visibleVideoUri, setVisibleVideoUri] = useState<string | null>(null);
  
  // Layout state
  const [headerHeight, setHeaderHeight] = useState(0);
  const [listHeight, setListHeight] = useState<number>(0);
  
  // Refs
  const flashListRef = useRef<FlashListRef<FeedItem>>(null);
  const lastScrollOffset = useRef(0);
  const positionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentVisibleVideoUri = useRef<string | null>(null);
  
  // Device detection
  const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
  const isHeaderFeed = useMemo(() => (
    feedOption === FEED_TYPES.PROFILE ||
    feedOption === FEED_TYPES.LIKES ||
    feedOption === FEED_TYPES.REPOSTS ||
    feedOption.startsWith('at://')
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

  // Optimized feed data processing - remove duplicates
  const displayFeed = useMemo(() => {
    if (isRefreshing) return [];
    
    const seenUris = new Set<string>();
    const seenCids = new Set<string>();
    
    return feed.filter((item) => {
      const uri = item.post.uri;
      const cid = item.post.cid;
      
      if (!uri || !cid) return false;
      
      const uniqueId = `${uri}_${cid}`;
      
      if (seenUris.has(uri) || seenCids.has(cid) || seenUris.has(uniqueId)) {
        return false;
      }
      
      seenUris.add(uri);
      seenCids.add(cid);
      seenUris.add(uniqueId);
      return true;
    });
  }, [feed, isRefreshing]);

  // List data with end card
  const listData = useMemo(() => {
    const base = displayFeed;
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
  }, [displayFeed, isLoading, isError, isFetchingNextPage, hasNextPage]);

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

  // Preload videos on scroll end
  const handleScrollEndPreload = useCallback(() => {
    if (displayFeed.length > 0) {
      preloadVideoData(displayFeed.map(item => item.post));
    }
  }, [displayFeed]);

  // Scroll handling
  const onScrollNative = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScroll?.(e);
  }, [onScroll]);

  // Momentum scroll end - save position and preload
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
    
    handleScrollEndPreload();
  }, [handleScrollEndPreload, onPositionChange]);

  // Optimized visibility detection - use refs to prevent re-renders
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    // Find the most visible video item (first viewable non-end-card item)
    const visibleVideoItem = viewableItems.find(item => 
      item.isViewable && 
      item.item?.post?.uri && 
      !item.item.endCard
    );
    
    if (visibleVideoItem) {
      const nextUri = visibleVideoItem.item.post.uri;
      const nextIndex = visibleVideoItem.index;
      
      // Only update if the visible video has actually changed
      if (nextUri !== currentVisibleVideoUri.current) {
        currentVisibleVideoUri.current = nextUri;
        setVisibleVideoUri(nextUri);
        onVisibleChange?.(nextIndex, nextUri);
      }
    } else if (currentVisibleVideoUri.current) {
      // No visible video found, clear state
      currentVisibleVideoUri.current = null;
      setVisibleVideoUri(null);
      onVisibleChange?.(-1, null);
    }
  }, [onVisibleChange]);

  // Render item function - simplified visibility logic
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

    // Simple visibility logic: video is visible if it's the currently visible video and the feed is visible
    const isVideoVisible = item.post.uri === visibleVideoUri && isVisible;
    
    return (
      <MemoizedVideoItem
        post={item.post}
        feedItem={item}
        isPlaying={isVideoVisible}
        handleVideoStatus={handleVideoStatus}
        height={cardHeight}
        feedOption={feedOption as 'yourMix' | 'following' | 'discover'}
        isVisible={isVideoVisible}
        moderationDecision={item.moderationDecision}
        isModal={isModal}
        index={index}
      />
    );
  }, [
    cardHeight,
    visibleVideoUri,
    feedOption,
    isVisible,
    backgroundColor,
    secondaryColor,
    handleVideoStatus,
    isModal,
  ]);

  // Item type for FlashList recycling optimization
  const getItemType = useCallback((item: FeedItem) => {
    if (item.endCard) return 'endCard';
    if (item.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
    return 'default';
  }, []);

  // Key extractor for optimal performance
  const keyExtractor = useCallback((item: FeedItem) => {
    return item.endCard ? 'end-card' : `${item.post.uri}_${item.post.cid}`;
  }, []);

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
      const foundIndex = displayFeed.findIndex(item => item?.post?.uri === initialUri);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }
    
    if (typeof targetIndex === 'number') {
      targetIndex = Math.max(0, Math.min(targetIndex, displayFeed.length - 1));
      
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
  }, [initialIndex, initialUri, displayFeed.length, listData.length, displayFeed]);

  // Orientation change handling
  useEffect(() => {
    const handleOrientationChange = ({ window }: { window: ScaledSize }) => {
      setTimeout(() => {
        if (flashListRef.current && displayFeed.length > 0 && currentVisibleVideoUri.current) {
          const currentIndex = displayFeed.findIndex(item => item.post.uri === currentVisibleVideoUri.current);
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
  }, [displayFeed.length, currentVisibleVideoUri.current, displayFeed]);

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
        overrideItemLayout={(layout, item, index) => {
          // Account for 8px total margin (4px top + 4px bottom) added to VideoCard
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
        
        // Viewability configuration - optimized for video visibility
        viewabilityConfig={{
          itemVisiblePercentThreshold: VIEWABILITY_CONSTANTS.ITEM_VISIBLE_PERCENT_THRESHOLD,
          minimumViewTime: VIEWABILITY_CONSTANTS.MINIMUM_VIEW_TIME,
          waitForInteraction: VIEWABILITY_CONSTANTS.WAIT_FOR_INTERACTION,
        }}
        
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
              <ActivityIndicator size="large" color={secondaryColor || Colors.white} />
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
          paddingBottom: displayFeed.length === 0 ? 0 : viewportDimensions.bottomNavBarHeight,
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