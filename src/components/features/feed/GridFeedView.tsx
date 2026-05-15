import React, {
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  LayoutChangeEvent,
  Platform,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { Link, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import type { ListFeedViewRef, ListFeedPullToRefresh } from '../../../types';
import { Colors } from '../../../theme';
import { getVideoView, DEFAULT_VIDEO_ASPECT_RATIO } from '../../../utils/video/helpers';
import {
  APP_CONSTANTS,
  QUERY_CONSTANTS,
  SCROLL_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { buildGridSnapToOffsets } from '@/utils/feed/snapOffsets';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import * as Device from 'expo-device';
import { getViewportDimensions } from '../../../utils/device/screen';
import EmptyFeed from './EmptyFeed';
import {
  FEED_VIEW_CONSTANTS,
  IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING,
  getEmptyFeedType,
  getFeedItemKey,
  getProfileColors,
  getPullToRefreshTintColor,
  isHeaderFeed as getIsHeaderFeed,
} from './feedViewShared';
import { isIosLiquidGlassAvailable } from '@/stores/userStore';
import { FeedScrollProvider } from '../../../context/FeedScrollContext';
import type {
  FeedScrollLayoutValue,
  FeedScrollMotionValue,
} from '../../../context/FeedScrollContext';
import type { SharedValue } from 'react-native-reanimated';
import type { ComponentType, Ref } from 'react';
import type { FlashListProps } from '@shopify/flash-list';
import type { GridFeedModalZoomConfig } from '@/utils/navigation/feedModalRoute';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as ComponentType<
  FlashListProps<ExtendedFeedViewPost> & { ref?: Ref<FlashListRef<ExtendedFeedViewPost>> }
>;
const VideoGridItem: React.FC<{
  item: ExtendedFeedViewPost;
  index: number;
  onPress?: (index: number) => void;
  style?: ViewStyle;
  zoomLink?: { href: Href; onBeforeNavigate: () => void };
}> = ({ item, index, onPress, style, zoomLink }) => {
  const videoView = getVideoView(item.post.embed);
  const thumbnailUrl = videoView?.thumbnail || null;
  const shouldBlur = !!(item.contentListUI?.blur || item.contentMediaUI?.blur);

  const handlePress = () => onPress?.(index);
  const flattenedStyle = StyleSheet.flatten([styles.gridItem, style]);

  const validThumbnailUrl =
    thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim() !== ''
      ? thumbnailUrl
      : null;

  const recyclingKey = item.post?.uri || item.post?.cid || `item-${index}`;

  const cellContent = (
    <>
      {validThumbnailUrl && !shouldBlur && (
        <Image
          source={{ uri: validThumbnailUrl }}
          style={styles.thumbnail}
          contentFit="contain"
          recyclingKey={recyclingKey}
          cachePolicy="disk"
          transition={200}
        />
      )}
    </>
  );

  if (zoomLink && Platform.OS === 'ios') {
    return (
      <Link push href={zoomLink.href} asChild>
        <Pressable style={flattenedStyle} onPress={zoomLink.onBeforeNavigate}>
          <Link.AppleZoom>
            <View collapsable={false} style={styles.appleZoomSourceInner}>
              {cellContent}
            </View>
          </Link.AppleZoom>
        </Pressable>
      </Link>
    );
  }

  return (
    <NativePressable style={[styles.gridItem, style]} onPress={handlePress}>
      {cellContent}
    </NativePressable>
  );
};

VideoGridItem.displayName = 'VideoGridItem';

const gridKeyExtractor = (item: ExtendedFeedViewPost, index: number): string =>
  getFeedItemKey(item, index);

interface GridFeedViewProps {
  feed: ExtendedFeedViewPost[];
  headerComponent?: React.ReactNode;
  backgroundColor?: string;
  secondaryColor?: string;
  feedOption: 'profile' | 'following' | 'likes' | 'reposts' | string;
  userDid?: string;
  onLoadMore: () => void;
  hasNextPage?: boolean;
  onGridItemPress?: (index: number) => void;
  gridFeedModalZoomConfig?: GridFeedModalZoomConfig | null;
  isError?: boolean;
  isPaused?: boolean;
  onRetry?: () => void;
  isLoading?: boolean;
  ListComponent?: React.ComponentType<unknown> | null;
  contentScrollProgressOutput?: SharedValue<number>;
  snapTopInset: number;
  useNativeTabBottomSafeArea?: boolean;
  pullToRefresh?: ListFeedPullToRefresh;
}

const GridFeedView = forwardRef<ListFeedViewRef, GridFeedViewProps>(
  (
    {
      feed,
      headerComponent,
      backgroundColor = Colors.transparent,
      secondaryColor = Colors.neutral[50],
      feedOption,
      userDid,
      onLoadMore,
      hasNextPage = false,
      onGridItemPress,
      gridFeedModalZoomConfig,
      isError = false,
      isPaused = false,
      onRetry,
      isLoading = false,
      ListComponent,
      contentScrollProgressOutput,
      snapTopInset,
      useNativeTabBottomSafeArea = false,
      pullToRefresh,
    },
    ref
  ) => {
    const isHeaderFeed = getIsHeaderFeed(feedOption, headerComponent);
    const profileColors = getProfileColors(backgroundColor, secondaryColor);
    const flashListRef = useRef<FlashListRef<ExtendedFeedViewPost>>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [gridLayoutHeight, setGridLayoutHeight] = useState(0);
    const hasHeader = Boolean(headerComponent);
    const useScrollTracking = !ListComponent && hasHeader;
    const insets = useSafeAreaInsets();
    const viewportDimensions = getViewportDimensions(insets);
    const viewableAreaHeight = viewportDimensions.height;

    const handleGridContainerLayout = useCallback((e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0) {
        setGridLayoutHeight(prev => (prev === h ? prev : h));
      }
    }, []);

    const listViewportForEmpty = gridLayoutHeight > 0 ? gridLayoutHeight : viewableAreaHeight;
    const emptyStateHeaderDeduction = ListComponent
      ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS
      : hasHeader && headerHeight > 0
        ? headerHeight
        : 0;
    const emptyComponentHeight = Math.max(0, listViewportForEmpty - emptyStateHeaderDeduction);
    const scrollOffsetYSV = useSharedValue(0);
    const fadeDist = useScrollTracking ? SCROLL_CONSTANTS.HEADER_FADE_DISTANCE : 0;
    const contentScrollProgressSV = useDerivedValue(() =>
      fadeDist > 0 ? Math.max(0, Math.min(1, scrollOffsetYSV.value / fadeDist)) : 0
    );

    const scrollHandler = useAnimatedScrollHandler({
      onScroll: event => {
        'worklet';
        const y = event.contentOffset.y;
        /* eslint-disable react-hooks/immutability -- SharedValue.value in worklet */
        scrollOffsetYSV.value = y;
        if (contentScrollProgressOutput && fadeDist > 0) {
          contentScrollProgressOutput.value = Math.max(0, Math.min(1, y / fadeDist));
        }
        /* eslint-enable react-hooks/immutability */
      },
    });

    const handleHeaderLayout = (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== headerHeight) {
        requestAnimationFrame(() => setHeaderHeight(h));
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => {
          if (flashListRef.current) {
            flashListRef.current.scrollToTop({ animated: true });
          }
        },
      }),
      []
    );

    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isTablet =
      Device.deviceType === Device.DeviceType.TABLET || Math.min(windowWidth, windowHeight) >= 600;
    const computedColumns = (() => {
      const w = windowWidth || Dimensions.get('window').width;
      let cols = 3;
      if (w > 1200 || isTablet) {
        cols = 6;
      } else if (w > 900) {
        cols = 5;
      } else if (w > 480) {
        cols = 4;
      } else {
        cols = 3;
      }
      return Math.max(3, cols);
    })();

    const numColumns = computedColumns;
    const itemWidth = (windowWidth || Dimensions.get('window').width) / numColumns;
    const itemHeight = itemWidth / DEFAULT_VIDEO_ASPECT_RATIO;
    const itemSpacing = itemHeight + FEED_VIEW_CONSTANTS.GRID_CELL_GAP;
    const extraBottomPadding = isIosLiquidGlassAvailable
      ? IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING
      : 0;

    const gridSnapToOffsets = useMemo(() => {
      return buildGridSnapToOffsets({
        useScrollTracking,
        headerHeight,
        isHeaderFeed,
        snapTopInset,
        itemCount: feed.length,
        numColumns,
        itemSpacing,
      });
    }, [
      useScrollTracking,
      headerHeight,
      isHeaderFeed,
      snapTopInset,
      feed.length,
      numColumns,
      itemSpacing,
    ]);

    const feedItemCount = feed.length;
    const renderGridItem = useCallback(
      ({ item, index }: { item: ExtendedFeedViewPost; index: number }) => {
        const isLastColumn = (index + 1) % numColumns === 0;
        const isLastRow =
          Math.floor(index / numColumns) === Math.floor((feedItemCount - 1) / numColumns);

        const zoomLink =
          gridFeedModalZoomConfig && Platform.OS === 'ios'
            ? {
                href: gridFeedModalZoomConfig.buildHref(index),
                onBeforeNavigate: () => gridFeedModalZoomConfig.onBeforeNavigate(index),
              }
            : undefined;

        const borderStyle = {
          borderRightWidth: isLastColumn ? 0 : FEED_VIEW_CONSTANTS.GRID_CELL_GAP,
          borderBottomWidth: isLastRow ? 0 : FEED_VIEW_CONSTANTS.GRID_CELL_GAP,
          borderColor: Colors.transparent,
        };

        return (
          <VideoGridItem
            item={item}
            index={index}
            onPress={onGridItemPress}
            zoomLink={zoomLink}
            style={{
              width: itemWidth,
              height: itemHeight,
              backgroundColor: Colors.transparent,
              ...borderStyle,
            }}
          />
        );
      },
      [onGridItemPress, gridFeedModalZoomConfig, feedItemCount, numColumns, itemWidth, itemHeight]
    );

    const feedScrollMotion = useMemo<FeedScrollMotionValue | null>(() => {
      if (!useScrollTracking) return null;
      return {
        scrollOffsetYSV,
        contentScrollProgressSV,
      };
    }, [useScrollTracking, scrollOffsetYSV, contentScrollProgressSV]);

    const feedScrollLayout = useMemo<FeedScrollLayoutValue | null>(() => {
      if (!useScrollTracking) return null;
      return {
        headerHeight,
        viewportHeight: viewportDimensions.height,
        itemSpacing,
      };
    }, [useScrollTracking, headerHeight, viewportDimensions.height, itemSpacing]);

    const ListEl = ListComponent || (useScrollTracking ? AnimatedFlashList : FlashList);
    const listProps = useMemo(
      () => ({
        ...(ListComponent ? {} : { ref: flashListRef }),
        decelerationRate:
          Platform.OS === 'ios'
            ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
            : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID,
        ...(useScrollTracking
          ? {
              onScroll: scrollHandler,
              scrollEventThrottle: APP_CONSTANTS.SCROLL_THROTTLE,
              disableIntervalMomentum: true,
              snapToOffsets: gridSnapToOffsets,
            }
          : {}),
      }),
      [ListComponent, useScrollTracking, scrollHandler, gridSnapToOffsets]
    );

    const separatorStyle = {
      height: FEED_VIEW_CONSTANTS.LIST_ITEM_GAP,
      backgroundColor: Colors.transparent,
    };

    const listHeader = headerComponent ? (
      <View
        style={styles.headerWrapper}
        onLayout={useScrollTracking ? handleHeaderLayout : undefined}
      >
        {headerComponent}
        <View style={separatorStyle} />
      </View>
    ) : null;

    const listFooter = feed.length > 0 ? <View style={separatorStyle} /> : null;

    const listContent = (
      <ListEl
        {...listProps}
        key={`grid-${feedOption}-${userDid || 'default'}-cols-${numColumns}`}
        data={feed}
        renderItem={renderGridItem}
        keyExtractor={gridKeyExtractor}
        numColumns={numColumns}
        refreshControl={
          !ListComponent && pullToRefresh ? (
            <RefreshControl
              refreshing={pullToRefresh.refreshing}
              onRefresh={pullToRefresh.onRefresh}
              tintColor={getPullToRefreshTintColor(profileColors?.textColor, secondaryColor)}
              progressViewOffset={insets.top}
            />
          ) : undefined
        }
        contentContainerStyle={[
          styles.listContent,
          {
            backgroundColor: Colors.transparent,
            ...(feed.length > 0 && {
              paddingBottom: useNativeTabBottomSafeArea ? 0 : insets.bottom + extraBottomPadding,
            }),
          },
        ]}
        style={{ backgroundColor: Colors.transparent }}
        showsVerticalScrollIndicator={feed.length >= SCROLL_INDICATOR_CONSTANTS.FEED_GRID_MIN_ITEMS}
        contentInsetAdjustmentBehavior="never"
        bounces={true}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          isLoading ? (
            <View
              style={[
                styles.gridEmptyLoading,
                {
                  minHeight: emptyComponentHeight,
                  backgroundColor: Colors.transparent,
                },
              ]}
            >
              <ActivityIndicator
                size="large"
                color={profileColors?.textColor || secondaryColor || Colors.neutral[50]}
              />
            </View>
          ) : isError ? (
            <EmptyFeed
              type="error"
              secondaryColor={secondaryColor}
              profileColors={profileColors}
              onRetry={onRetry}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          ) : isPaused ? (
            <EmptyFeed
              type="no-connection"
              secondaryColor={secondaryColor}
              profileColors={profileColors}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          ) : (
            <EmptyFeed
              type={getEmptyFeedType(feedOption)}
              secondaryColor={secondaryColor}
              profileColors={profileColors}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          )
        }
        scrollEnabled={true}
        onEndReached={hasNextPage ? onLoadMore : undefined}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
      />
    );

    return (
      <View
        style={[styles.container, { backgroundColor: Colors.transparent }]}
        onLayout={handleGridContainerLayout}
      >
        {useScrollTracking && feedScrollMotion && feedScrollLayout ? (
          <FeedScrollProvider motion={feedScrollMotion} layout={feedScrollLayout}>
            {listContent}
          </FeedScrollProvider>
        ) : (
          listContent
        )}
      </View>
    );
  }
);

GridFeedView.displayName = 'GridFeedView';

const styles = StyleSheet.create({
  gridEmptyLoading: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.transparent,
  },
  headerWrapper: {
    width: '100%',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  gridItem: {
    overflow: 'hidden',
    backgroundColor: Colors.transparent,
  },
  appleZoomSourceInner: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.black,
  },
});

export default GridFeedView;
