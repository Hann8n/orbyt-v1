declare let window: any;
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Animated,
  View,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Text,
  ScaledSize,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, SharedValue, runOnJS } from 'react-native-reanimated';
import EmptyFeed from './EmptyFeed';
import { MemoizedVideoItem } from './VideoItem';

import WatchHistory from '../../../services/WatchHistory';
import { extractVideoUrl } from '../../../utils/helpers/video';
import GridFeedView from './GridFeedView';
import { isSmallScreen, isTablet, getVideoCardHeight, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';

import Icon from '../../ui/Icon';
import { useClearView } from '../../../services/ClearViewContext';
import FeedDebugger from '../../../utils/helpers/FeedDebuger';
import AccountManager from '../../../services/storage/AccountManager';
import { Colors } from '../../ui/UI';

// Unified video snapping system
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
  ListComponent?: any;
  useAnimatedScroll?: boolean;
  

}

// Unified snapping constants
const PREPARE_BUFFER = 1;
const CACHE_BUFFER = 2;
const STREAMING_ENABLED = true;

// Pure function component for CellRenderer
const CellRenderer = React.memo(({ children, style }: { children: React.ReactNode; style?: any }) => {
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      {children}
    </View>
  );
});

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
  ListComponent,
  useAnimatedScroll = true,

}) => {
  const { isClearViewMode, toggleClearViewMode, setClearViewMode } = useClearView();
  const isSmallDevice = isSmallScreen() || isTablet();
  const insets = useSafeAreaInsets();
  const [isFeedDebugEnabled, setIsFeedDebugEnabled] = useState<boolean>(false);
  
  // Unified device detection
  const isHeaderFeed = (
    feedOption === 'profile' ||
    feedOption === 'likes' ||
    feedOption === 'reposts' ||
    feedOption.startsWith('at://')
  );
  
  const isCollapsibleTabView = ListComponent && (
    ListComponent.name === 'TabsFlatList' || 
    ListComponent.displayName === 'TabsFlatList' ||
    (typeof ListComponent === 'function' && ListComponent.toString().includes('TabsFlatList'))
  );
  
  // Unified viewport calculations - Restored original 9:16 card design with proper safe area handling
  const viewportDimensions = useMemo(() => {
    const { width, height } = Dimensions.get('window');
    
    // Calculate effective insets - All feeds need safe areas
    const effectiveInsets = insets;
    const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);
    
    // Calculate viewport height (area available for videos)
    let viewportHeight: number;
    
    if (isModal) {
      // Modal: use full screen height
      viewportHeight = height;
    } else if (isSmallDevice) {
      // Small devices: use full screen height
      viewportHeight = height;
    } else {
      // Large devices: use proper card height that allows seeing previous/next videos
      viewportHeight = height - bottomNavBarHeight - effectiveInsets.top;
    }
    
    return {
      width,
      height: viewportHeight,
      effectiveInsets,
      bottomNavBarHeight,
      isFullScreen: isModal || isSmallDevice,
    };
  }, [isHeaderFeed, isModal, isSmallDevice, insets]);
  
  // Unified card height calculation - Use 9:16 cards in modal to allow adjacent peeks
  const cardHeight = useMemo(() => {
    const screen = Dimensions.get('window');
    const nineBySixteenHeight = Math.round((screen.width * 16) / 9);
    if (isModal) {
      // In modal, use 9:16 card height capped by available viewport height
      return Math.min(viewportDimensions.height, nineBySixteenHeight);
    }
    if (isSmallDevice) {
      // Small devices: use full screen height
      return viewportDimensions.height;
    }
    // Large devices: use proper card height that maintains uniform spacing
    return getVideoCardHeight(viewportDimensions.effectiveInsets);
  }, [viewportDimensions.height, viewportDimensions.effectiveInsets, isModal, isSmallDevice]);

  // Center padding so items are visually centered while allowing peeks above/below
  const centerPadding = useMemo(() => {
    if (!isModal) return 0;
    const pad = Math.max(0, Math.floor((viewportDimensions.height - cardHeight) / 2));
    return pad;
  }, [isModal, viewportDimensions.height, cardHeight]);
  
  // Clear feed when refreshing
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

  // Force error state if enabled
  const forcedError = forceError ? new Error('Forced error for testing purposes') : null;
  const forcedIsError = forceError || isError;
  const forcedErrorState = forceError ? forcedError : error;

  // Unified state management
  const [isScrubbing, _setIsScrubbing] = useState(false);
  const setIsScrubbing = useCallback((val: boolean) => _setIsScrubbing(val), []);

  useEffect(() => {
    if (onScrubbingChange) onScrubbingChange(isScrubbing);
  }, [isScrubbing, onScrubbingChange]);

  const [visibleVideo, setVisibleVideo] = useState<string | null>(null);
  const [visibleIndex, setVisibleIndex] = useState<number>(0);
  const [visibleRange, setVisibleRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: 2,
  });
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);

  // Unified refs
  const flatListRef = useRef<Animated.FlatList>(null);
  const userScrolled = useRef<boolean>(false);
  const lastOffset = useRef(0);
  const currentScrollOffset = useRef<number>(0);
  const lastSavedPosition = useRef<number>(0);
  const positionSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollYShared = useSharedValue(0);
  const lastScrollInfoRef = useRef({ scrollY: 0, progress: 0, nearEnd: false });
  const [debugScrollInfo, setDebugScrollInfo] = useState<{ scrollY: number; scrollProgress: number; isNearEnd: boolean }>({ scrollY: 0, scrollProgress: 0, isNearEnd: false });
  
  const visibleVideoRef = useRef<string | null>(null);
  const visibleIndexRef = useRef<number>(0);

  // Unified infinite scroll handler
  const infiniteScrollHandler = onScroll || (() => {});

  // Unified video status handler
  const handleVideoStatus = useCallback((uri: string, status: string) => {
    if (status === 'ready' && uri === visibleVideoRef.current) {
      // Only update if this is the currently visible video
    }
  }, []);

  // Unified overlay visibility logic
  const shouldShowOverlay = useCallback((index: number) => {
    if (!scrollDirection) {
      return index === visibleIndexRef.current;
    }
    
    if (scrollDirection === 'down') {
      return index >= visibleIndexRef.current;
    } else {
      return index <= visibleIndexRef.current;
    }
  }, [scrollDirection]);

  // Unified viewable items changed handler
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length === 0) return;

    const firstVisibleItem = viewableItems[0];
    const newVisibleVideo = firstVisibleItem?.item?.post?.uri || null;
    const newVisibleIndex = firstVisibleItem?.index || 0;
    
    if (newVisibleVideo !== visibleVideoRef.current || newVisibleIndex !== visibleIndexRef.current) {
      visibleVideoRef.current = newVisibleVideo;
      visibleIndexRef.current = newVisibleIndex;
      
      setVisibleVideo(newVisibleVideo);
      setVisibleIndex(newVisibleIndex);

      if (typeof onVisibleChange === 'function') {
        onVisibleChange(newVisibleIndex, newVisibleVideo);
      }
    }

    const minIndex = Math.min(...viewableItems.map(item => item.index));
    const maxIndex = Math.max(...viewableItems.map(item => item.index));
    
    setVisibleRange({ min: minIndex, max: maxIndex });
  }, [onVisibleChange]);

  // Unified scroll handler
  const handleScroll = useCallback((event: any) => {
    infiniteScrollHandler(event);
    
    const y = event.nativeEvent.contentOffset.y;
    

    
    scrollYShared.value = y;
    currentScrollOffset.current = y;
    
    // Update debug scroll info
    try {
      const { contentSize, layoutMeasurement } = event.nativeEvent;
      const contentHeight = contentSize?.height || 0;
      const screenHeight = layoutMeasurement?.height || 1;
      const maxScrollY = Math.max(1, contentHeight - screenHeight);
      const progress = Math.min(Math.max(y / maxScrollY, 0), 1);
      const nearEnd = progress >= 0.9;
      const last = lastScrollInfoRef.current;
      if (Math.abs(last.scrollY - y) > 50 || Math.abs(last.progress - progress) > 0.05 || last.nearEnd !== nearEnd) {
        lastScrollInfoRef.current = { scrollY: y, progress, nearEnd } as any;
        setDebugScrollInfo({ scrollY: y, scrollProgress: progress, isNearEnd: nearEnd });
      }
    } catch {}
    
    // Track scroll direction
    const delta = y - lastOffset.current;
    if (Math.abs(delta) > 10) {
      const newDirection = delta > 0 ? 'down' : 'up';
      if (newDirection !== scrollDirection) {
        setScrollDirection(newDirection);
      }
    }
    lastOffset.current = y;
    
    onVerticalScroll?.(y);
    
    if (!userScrolled.current) {
      userScrolled.current = true;
    }
  }, [infiniteScrollHandler, scrollYShared, onVerticalScroll, scrollDirection, viewportDimensions.effectiveInsets.top]);

  // Unified momentum scroll end handler
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    
    if (onPositionChange) {
      if (Math.abs(offsetY - lastSavedPosition.current) > 50) {
        onPositionChange(offsetY);
        lastSavedPosition.current = offsetY;
      }
    }
    
    lastOffset.current = offsetY;
    currentScrollOffset.current = offsetY;
    setScrollDirection(null);
  }, [onPositionChange]);

  // Debug polling
  useEffect(() => {
    let mounted = true;
    const apply = async () => {
      try {
        const globalVal = (global as any)?.__ORBYT_FEED_DEBUG_OVERLAY__;
        if (typeof globalVal === 'boolean') {
          if (mounted) setIsFeedDebugEnabled(globalVal);
        } else {
          const stored = await AccountManager.getFeedDebugOverlayEnabled();
          if (mounted) setIsFeedDebugEnabled(stored);
        }
      } catch {}
    };
    apply();
    const id = setInterval(apply, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Unified render item
  const renderItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    const isActive = item.post.uri === visibleVideoRef.current;
    const shouldPreload = index >= visibleRange.min - CACHE_BUFFER && index <= visibleRange.max + CACHE_BUFFER;
    const shouldShowVideoOverlay = shouldShowOverlay(index);
    const isItemVisible = (index === visibleIndexRef.current) && isVisible;
    
    return (
      <MemoizedVideoItem
        key={`${item.post.uri}-${index}`}
        post={item.post}
        feedItem={item}
        isPlaying={isActive && isItemVisible}
        handleVideoStatus={handleVideoStatus}
        height={cardHeight}
        shouldPreload={shouldPreload}
        scrollY={scrollYShared}
        feedOption={feedOption as 'yourMix' | 'following' | 'discover'}
        isVisible={isItemVisible}
        moderationDecision={item.moderationDecision}
        isModal={isModal}
        onScrubbingChange={setIsScrubbing}

      />
    );
  }, [
    cardHeight, 
    visibleRange.min, 
    visibleRange.max, 
    feedOption, 
    scrollYShared, 
    isVisible, 
    handleVideoStatus,
    shouldShowOverlay,
    isModal,
    setIsScrubbing,

  ]);

  // Watch history logic
  useEffect(() => {
    if (visibleVideoRef.current && feedOption === 'yourMix') {
      WatchHistory.addToWatchHistory(visibleVideoRef.current);
    }
  }, [visibleVideoRef.current, feedOption]);

  // Unified getItemLayout function
  const getItemLayout = useCallback((_: any, index: number) => {
    try {
      const safeIndex = Math.max(0, index || 0);
      
      // For all cases, use simple card height calculation
      return {
        length: cardHeight,
        offset: cardHeight * safeIndex,
        index: safeIndex,
      };
    } catch (error) {
      console.warn('Error calculating item layout:', error);
      return {
        length: cardHeight,
        offset: cardHeight * (index || 0),
        index: index || 0,
      };
    }
  }, [cardHeight]);

  // Handle grid item press
  const handleGridItemPress = useCallback((index: number) => {
    if (viewMode === 'grid' && onViewModeChange && index >= 0 && index < feed.length) {
      try {
        onViewModeChange('list');
        
        setTimeout(() => {
          if (flatListRef.current) {
            try {
              const targetOffset = cardHeight * index;
              
              flatListRef.current.scrollToOffset({ offset: targetOffset, animated: true });
              
              setTimeout(() => {
                const targetVideo = feed[index]?.post?.uri;
                if (targetVideo) {
                  visibleVideoRef.current = targetVideo;
                  visibleIndexRef.current = index;
                  setVisibleVideo(targetVideo);
                  setVisibleIndex(index);
                }
              }, 500);
              
            } catch (error) {
              console.warn('Error scrolling to grid item:', error);
            }
          }
        }, 100);
      } catch (error) {
        console.warn('Error handling grid item press:', error);
      }
    }
  }, [feed.length, cardHeight, viewMode, onViewModeChange]);

  // Find shouldDisablePlayback for the visible video
  let debugShouldDisablePlayback = false;
  if (feed[visibleIndexRef.current]) {
    debugShouldDisablePlayback = (feed[visibleIndexRef.current].moderationDecision?.blur === true);
  }

  // Set initial visible index and video on mount (for modal)
  useEffect(() => {
    let targetIndex = initialIndex;
    if (isModal && initialUri && Array.isArray(displayFeed)) {
      const foundIndex = displayFeed.findIndex((item: any) => item?.post?.uri === initialUri);
      if (foundIndex !== -1) {
        targetIndex = foundIndex;
      }
    }
    if (isModal && typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex < displayFeed.length) {
      visibleIndexRef.current = targetIndex;
      visibleVideoRef.current = displayFeed[targetIndex]?.post?.uri || null;
      setVisibleIndex(targetIndex);
      setVisibleVideo(displayFeed[targetIndex]?.post?.uri || null);
      if (flatListRef.current) {
        flatListRef.current.scrollToIndex({ index: targetIndex, animated: false });
      }
    }
  }, [isModal, initialIndex, initialUri, displayFeed.length]);

  // Handle orientation/screen size changes
  useEffect(() => {
    const onChange = ({ window }: { window: ScaledSize }) => {
      setTimeout(() => {
        if (flatListRef.current && displayFeed.length > 0) {
          flatListRef.current.scrollToIndex({
            index: visibleIndexRef.current,
            animated: false,
            viewPosition: 0,
          });
        }
      }, 50);
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => { sub?.remove(); };
  }, [displayFeed.length]);

  // Render grid view if viewMode is 'grid'
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
        onGridItemPress={undefined}
        isError={isError}
        error={error}
        onRetry={onRetry}
      />
    );
  }

  // Calculate viewable area height for empty states
  const viewableAreaHeight = viewportDimensions.height;

  // Render list view (default)
  return (
    <View style={{ flex: 1, backgroundColor: Colors.black }}>
      {(typeof window !== 'undefined' && (window as any).__LIST_FEED_DEBUG__ === true) && (
        <View style={{
          position: 'absolute',
          top: 40,
          left: 10,
          zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: 10,
          borderRadius: 8,
          maxWidth: 320,
        }}>
          <Text style={{ color: Colors.white, fontSize: 12 }}>scrollY: {Math.round(currentScrollOffset.current)}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>isHeaderFeed: {String(isHeaderFeed)}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>visibleIndex: {visibleIndexRef.current}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>visibleVideo: {visibleVideoRef.current}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>isCollapsibleTabView: {String(isCollapsibleTabView)}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>cardHeight: {cardHeight}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>viewportHeight: {viewportDimensions.height}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>isModal: {String(isModal)}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>isSmallDevice: {String(isSmallDevice)}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>shouldDisablePlayback: {String(debugShouldDisablePlayback)}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>forceError: {String(forceError)}</Text>
          <Text style={{ color: Colors.white, fontSize: 12 }}>forcedIsError: {String(forcedIsError)}</Text>
        </View>
      )}
      {(() => {
        const ListEl: any = ListComponent || Animated.FlatList;
        const scrollProps = ListComponent
          ? { onScroll: handleScroll, scrollEventThrottle: 16 }
          : {
              onScroll: Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true, listener: handleScroll }
              ),
              // Reduce JS scroll event frequency to lower overhead
              scrollEventThrottle: 16 as const,
            };
        return (
          <ListEl
            ref={flatListRef}
            key={`${feedOption}-${userDid || 'default'}`}
            data={displayFeed}
            renderItem={renderItem}
            keyExtractor={(item: FeedItem, index: number) => `${item.post.uri}_${item.post.cid}_${index}`}
            // Unified snapping: use pagingEnabled for all cases
            pagingEnabled={true}
            // Use snapToInterval for consistent snapping across all devices
            snapToInterval={cardHeight}
            decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.85}
            removeClippedSubviews={true}
            windowSize={5}
            maxToRenderPerBatch={2}
            updateCellsBatchingPeriod={50}
            initialNumToRender={2}
            showsVerticalScrollIndicator={false}
            {...scrollProps}
            directionalLockEnabled={true}
            alwaysBounceVertical={false}
            scrollEnabled={!isScrubbing}
            nestedScrollEnabled={true}
            onMomentumScrollEnd={onMomentumScrollEnd}
            CellRendererComponent={CellRenderer}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{
              itemVisiblePercentThreshold: 50,
              minimumViewTime: 0,
            }}
            getItemLayout={getItemLayout}
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.centeredLoadingContainer}>
                  <ActivityIndicator size="large" color={secondaryColor || Colors.white} />
                </View>
              ) : forcedIsError ? (
                <EmptyFeed 
                  type="error"
                  secondaryColor={secondaryColor} 
                  profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
                  onRetry={onRetry}
                  isProfileFeed={isHeaderFeed}
                  viewableAreaHeight={viewableAreaHeight}
                  feedOption={feedOption}
                />
              ) : feedOption === 'following' ? (
                <EmptyFeed 
                  type="no-following"
                  secondaryColor={secondaryColor} 
                  profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
                  isProfileFeed={isHeaderFeed}
                  viewableAreaHeight={viewableAreaHeight}
                  feedOption={feedOption}
                />
              ) : (
                <EmptyFeed 
                  type="no-videos"
                  secondaryColor={secondaryColor} 
                  profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
                  isProfileFeed={isHeaderFeed}
                  viewableAreaHeight={viewableAreaHeight}
                  feedOption={feedOption}
                />
              )
            }
            ListHeaderComponent={headerComponent}
            refreshControl={refreshControl as any}
            style={[
              styles.flatList,
              {
                backgroundColor: Colors.black,
              },
            ]}
            contentContainerStyle={[
              styles.contentContainer,
              displayFeed.length === 0 && styles.emptyContentContainer,
              displayFeed.length === 0
                ? { flex: 1, paddingBottom: 0 }
                : (isModal
                    ? { paddingTop: centerPadding, paddingBottom: centerPadding }
                    : { paddingBottom: viewportDimensions.bottomNavBarHeight }
                  ),
            ]}
            ListFooterComponent={
              !isLoading && !isError && !isFetchingNextPage && !hasNextPage && displayFeed.length > 0 ? (
                <EmptyFeed
                  type="end"
                  secondaryColor={secondaryColor}
                  profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
                  viewableAreaHeight={120}
                  feedOption={feedOption}
                />
              ) : null
            }
          />
        );
      })()}
      {isFeedDebugEnabled && (
        <FeedDebugger
          feedOption={feedOption}
          userDid={userDid}
          isVisible={true}
          scrollInfo={{
            scrollY: debugScrollInfo.scrollY,
            scrollProgress: debugScrollInfo.scrollProgress,
            isNearEnd: debugScrollInfo.isNearEnd,
          }}
        />
      )}
      
      {/* Zen Exit Button */}
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
  flatList: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 0,
    margin: 0,
  },
  emptyContentContainer: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.black,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: Dimensions.get('window').height,
    backgroundColor: Colors.black,
  },
  feedLoadingContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearViewExitButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ListFeedView; 