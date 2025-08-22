declare let window: any;
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// Use plain FlashList (animated wrapper removed)
import EmptyFeed from './EmptyFeed';
import { MemoizedVideoItem } from './VideoItem';
import WatchHistory from '../../../services/WatchHistory';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { useClearView } from '@stores/uiStore';
import { usePlaybackStore } from '@stores/playbackStore';
import { Colors } from '../../ui/UI';
import { preloadVideoData } from '../../../utils/helpers/video';


// Simplified config - using FlashList's native optimizations
const SCROLL_THROTTLE = 16; // Standard React Native throttling

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export interface FeedItem {
  post: {
    embed?: {
      $type: string;
      mime?: string;
      playlist?: string | string[];
      media?: {
        $type: string;
        playlist?: string | string[];
      };
    };
    uri: string;
    cid: string;
    author?: {
      avatar?: string;
      displayName?: string;
      handle?: string;
    };
    repostedBy?: {
      avatar?: string;
      displayName?: string;
      handle?: string;
    };
  };
  shouldCache?: boolean;
  uniqueKey?: string;
  reason?: {
    $type?: string;
    by?: {
      avatar?: string;
      displayName?: string;
      handle?: string;
    };
  };
  moderationDecision?: ModerationDecision;
  endCard?: boolean;
}

interface ListFeedViewProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  feedOption: 'yourMix' | 'following' | 'discover' | 'profile' | 'likes' | 'reposts' | string;
  userDid?: string;
  onLoadMore: () => void;
  isFetchingNextPage: boolean;
  hasNextPage?: boolean;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onPositionChange?: (position: number) => void;
  initialPosition?: number;
  initialIndex?: number;
  initialUri?: string;
  isVisible?: boolean;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  isModal?: boolean;
  onVerticalScroll?: (scrollY: number) => void;
  isRefreshing?: boolean;
  isProfileLoading?: boolean;
  onVisibleChange?: (index: number, video: string | null) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  onScroll?: (event: { nativeEvent: any }) => void;
  forceError?: boolean;
  ListComponent?: any; // Optional custom list component
}

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
  onVerticalScroll,
  isRefreshing = false,
  isProfileLoading = false,
  onVisibleChange,
  onScrubbingChange,
  onScroll,
  forceError = false,
  ListComponent, // Optional custom list component
}) => {
  // Hooks
  const { isClearViewMode, toggleClearViewMode } = useClearView();
  const insets = useSafeAreaInsets();
  
  // Simplified state management
  const [visibleVideo, setVisibleVideo] = useState<string | null>(null);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [headerListHeight, setHeaderListHeight] = useState(0);
  const [listLayoutHeight, setListLayoutHeight] = useState<number>(0);
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);
  
  // Device detection
  const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
  const isHeaderFeed = useMemo(() => (
    feedOption === 'profile' ||
    feedOption === 'likes' ||
    feedOption === 'reposts' ||
    feedOption.startsWith('at://')
  ), [feedOption]);

  // Refs for performance
  const flashListRef = useRef<FlashListRef<FeedItem>>(null);
  const lastOffset = useRef(0);
  const positionSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Playback control
  const pauseAllVideos = usePlaybackStore(state => state.pauseAllVideos);

  // Simple scroll handling with header visibility detection
  const onScrollNative = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = e.nativeEvent;
    const offsetY = contentOffset?.y || 0;
    
    // Handle header visibility for header feeds
    if (headerComponent && isHeaderFeed) {
      const headerThreshold = 50;
      const newHeaderVisible = offsetY <= headerThreshold;
      
      if (newHeaderVisible !== isHeaderVisible) {
        setIsHeaderVisible(newHeaderVisible);
        
        // Pause videos when header becomes visible
        if (newHeaderVisible && visibleVideo) {
          setVisibleVideo(null);
          setVisibleIndex(-1);
          onVisibleChange?.(-1, null);
          pauseAllVideos();
        }
      }
    }
    
    // Pass to parent components with throttling to prevent interference
    onScroll?.(e);
    onVerticalScroll?.(offsetY);
  }, [headerComponent, isHeaderFeed, isHeaderVisible, visibleVideo, onVisibleChange, pauseAllVideos, onScroll, onVerticalScroll]);



  // Viewport calculations with memoization
  const viewportDimensions = useMemo(() => {
    const { width, height } = Dimensions.get('window');
    const bottomNavBarHeight = getBottomNavBarHeight(insets);
    
    let viewportHeight: number;
    if (isSmallDevice) {
      viewportHeight = height;
    } else {
      viewportHeight = height - bottomNavBarHeight - insets.top;
    }
    
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

  // Optimized feed data processing
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
  const handleScrubbingChange = useCallback((scrubbing: boolean) => {
    setIsScrubbing(scrubbing);
    onScrubbingChange?.(scrubbing);
  }, [onScrubbingChange]);

  const handleVideoStatus = useCallback((uri: string, status: string) => {
    // Simple status handling - no logging needed
  }, []);



  // Simple scroll to index function
  const scrollToIndex = useCallback((targetIndex: number) => {
    if (!flashListRef.current || targetIndex < 0 || targetIndex >= listData.length) return;
    
    flashListRef.current.scrollToIndex({ 
      index: targetIndex, 
      animated: true,
      viewPosition: 0.5
    });
  }, [listData.length]);

  // Preload on scroll end for upcoming videos
  const handleScrollEndPreload = useCallback(() => {
    if (displayFeed.length > 0) {
      preloadVideoData(displayFeed.map(item => item.post));
    }
  }, [displayFeed]);

  // Momentum end: rely on FlashList's viewability for visibility
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    
    // Debounce position saving with shorter timeout for better responsiveness
    if (positionSaveTimeout.current) {
      clearTimeout(positionSaveTimeout.current);
    }
    positionSaveTimeout.current = setTimeout(() => {
      if (onPositionChange && Math.abs(offsetY - lastOffset.current) > 30) {
        onPositionChange(offsetY);
      }
    }, 300); // Reduced timeout for more responsive position saving
    lastOffset.current = offsetY;
    
    handleScrollEndPreload();
  }, [handleScrollEndPreload, onPositionChange]);

  // Simplified viewability detection
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    // Find the first viewable video item
    const visibleVideoItem = viewableItems.find(item => 
      item.isViewable && 
      item.item?.post?.uri && 
      !item.item.endCard
    );
    
    if (visibleVideoItem) {
      const nextUri = visibleVideoItem.item.post.uri;
      const nextIndex = visibleVideoItem.index;
      
      if (nextUri !== visibleVideo) {
        console.log('[ListFeedView] Setting visible video:', nextUri, 'index:', nextIndex);
        setVisibleVideo(nextUri);
        setVisibleIndex(nextIndex);
        onVisibleChange?.(nextIndex, nextUri);
        
        // Add to watch history asynchronously
        if (feedOption === 'yourMix') {
          setTimeout(() => WatchHistory.addToWatchHistory(visibleVideoItem.item), 0);
        }
      }
    }
  }, [visibleVideo, feedOption, onVisibleChange]);

  // Initialize first video when feed loads (simplified)
  useEffect(() => {
    if (displayFeed.length > 0 && isVisible) {
      // Always set the first video as visible when feed is visible
      const firstVideo = displayFeed[0];
      if (firstVideo && firstVideo.post.uri) {
        setVisibleVideo(firstVideo.post.uri);
        setVisibleIndex(0);
        onVisibleChange?.(0, firstVideo.post.uri);
      }
      
      // Preload video data
      preloadVideoData(displayFeed.map(item => item.post));
    } else if (!isVisible && visibleVideo) {
      // Clear visibility when feed is not visible
      setVisibleVideo(null);
      setVisibleIndex(-1);
      onVisibleChange?.(-1, null);
    }
  }, [displayFeed, isVisible, onVisibleChange]);

  // Remove the complex fallback effect

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

    // Simple visibility check
    const isActiveVideo = item.post.uri === visibleVideo;
    const shouldPlay = isActiveVideo && isVisible && !isScrubbing;
    
    return (
      <MemoizedVideoItem
        post={item.post}
        feedItem={item}
        isPlaying={shouldPlay}
        handleVideoStatus={handleVideoStatus}
        height={cardHeight}
        feedOption={feedOption as 'yourMix' | 'following' | 'discover'}
        isVisible={shouldPlay}
        moderationDecision={item.moderationDecision}
        onScrubbingChange={handleScrubbingChange}
        isModal={isModal}
        index={index}
      />
    );
  }, [
    cardHeight,
    visibleVideo,
    isScrubbing,
    feedOption,
    isVisible,
    backgroundColor,
    secondaryColor,
    handleVideoStatus,
    handleScrubbingChange,
    isModal,
  ]);

  // Optimized item type for FlashList recycling
  const getItemType = useCallback((item: FeedItem) => {
    if (item.endCard) return 'endCard';
    if (item.post?.embed?.$type === 'app.bsky.embed.record#view') return 'video';
    return 'default';
  }, []);

  // Key extractor with better performance
  const keyExtractor = useCallback((item: FeedItem) => {
    return item.endCard ? 'end-card' : `${item.post.uri}_${item.post.cid}`;
  }, []);

  // Grid item press handler
  const handleGridItemPress = useCallback((index: number) => {
    if (viewMode === 'grid' && onViewModeChange && index >= 0 && index < feed.length) {
      onViewModeChange('list');
      
      setTimeout(() => {
        scrollToIndex(index);
      }, 100);
    }
  }, [feed.length, viewMode, onViewModeChange, scrollToIndex]);

  // Watch history effect
  useEffect(() => {
    if (visibleVideo && feedOption === 'yourMix') {
      WatchHistory.addToWatchHistory(visibleVideo);
    }
  }, [visibleVideo, feedOption]);

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
        } catch {}
      }, 50);
    }
  }, [initialIndex, initialUri, displayFeed.length, listData.length, displayFeed]);

  // Improved orientation change handling
  useEffect(() => {
    const handleOrientationChange = ({ window }: { window: ScaledSize }) => {
      setTimeout(() => {
        if (flashListRef.current && displayFeed.length > 0) {
          flashListRef.current.scrollToIndex({
            index: visibleIndex,
            animated: false,
            viewPosition: 0.5,
          });
        }
      }, 100);
    };

    const subscription = Dimensions.addEventListener('change', handleOrientationChange);
    return () => subscription?.remove();
  }, [displayFeed.length, visibleIndex]);

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

  // Simplified snapping: use snapToInterval for consistent center snapping
  const snapToIntervalValue = cardHeight;

  // Custom snap offsets for header feeds
  const snapToOffsets = useMemo(() => {
    if (!headerComponent || headerListHeight <= 0 || cardHeight <= 0) return null;
    const offsets: number[] = [];
    // Allow resting at the very top (header fully visible)
    offsets.push(0);
    // Base offset that centers the first item
    const centerCorrection = Math.max(0, Math.round((listLayoutHeight - cardHeight) / 2));
    const base = Math.max(0, headerListHeight - centerCorrection);
    const itemCount = listData.length;
    for (let i = 0; i < itemCount; i++) {
      offsets.push(base + i * cardHeight);
    }
    return offsets;
  }, [headerComponent, headerListHeight, cardHeight, listLayoutHeight, listData.length]);

  // Main render - unified approach for feeds with or without headers
  return (
    <View 
      style={[styles.container, { backgroundColor: backgroundColor || Colors.black }]} 
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== listLayoutHeight) setListLayoutHeight(h);
      }}
    > 
      {/* FlashList implementation with center snapping */}
      <FlashList
        ref={flashListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ListHeaderComponent={headerComponent ? (
          <View onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== headerListHeight) setHeaderListHeight(h);
          }}>
            {headerComponent}
          </View>
        ) : null}
        
        // FlashList performance optimizations for smooth scrolling
        removeClippedSubviews={true}
        overrideItemLayout={(layout, item, index) => {
          layout.span = cardHeight;
        }}
        
        // Optimized snapping configuration
        pagingEnabled={false}
        {...(snapToOffsets
          ? { snapToOffsets }
          : { snapToInterval: snapToIntervalValue, snapToAlignment: 'center' as const }
        )}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
        scrollEventThrottle={SCROLL_THROTTLE}
        
        onScroll={onScrollNative}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.8}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
          minimumViewTime: 0,
          waitForInteraction: false,
        }}
        
        // Disable scrolling when empty; otherwise respect scrubbing lock
        scrollEnabled={!isScrubbing && listData.length > 0}
        showsVerticalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled={true}
        initialScrollIndex={typeof initialIndex === 'number' ? initialIndex : undefined}
        
        // Optimize for vertical scrolling only to prevent horizontal interference
        alwaysBounceVertical={false}
        alwaysBounceHorizontal={false}
        
        // Components
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
        
        // FlashList only supports padding and backgroundColor in contentContainerStyle
        contentContainerStyle={{
          backgroundColor: backgroundColor || Colors.black,
          paddingBottom: displayFeed.length === 0 ? 0 : viewportDimensions.bottomNavBarHeight,
        }}
      />
      
      {/* Clear view exit button */}
      {isClearViewMode && (
        <TouchableOpacity 
          style={styles.clearViewExitButton}
          onPress={toggleClearViewMode}
          activeOpacity={0.7}
        >
          <Icon 
            name="zen" 
            size={24} 
            color={Colors.white} 
          />
        </TouchableOpacity>
      )}
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
    borderRadius: 22,
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