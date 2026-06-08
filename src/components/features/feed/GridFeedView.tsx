import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  Platform,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  type ViewStyle,
  type ScrollViewProps,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { Link, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedReaction,
  useAnimatedRef,
  useScrollOffset,
} from 'react-native-reanimated';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import type { ListFeedViewRef, ListFeedPullToRefresh } from '../../../types';
import { Colors } from '../../../theme';
import { getVideoView, DEFAULT_VIDEO_ASPECT_RATIO } from '../../../utils/video/helpers';
import {
  QUERY_CONSTANTS,
  SCROLL_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { getViewportDimensions } from '../../../utils/device/screen';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
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
import type { SharedValue } from 'react-native-reanimated';
import type { Ref } from 'react';
import type { GridFeedModalZoomConfig } from '@/utils/navigation/feedModalRoute';
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

  const handlePress = useCallback(() => onPress?.(index), [onPress, index]);
  const flattenedStyle = useMemo(() => StyleSheet.flatten([styles.gridItem, style]), [style]);

  const validThumbnailUrl =
    thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim() !== ''
      ? thumbnailUrl
      : null;

  const recyclingKey = item.post?.uri || item.post?.cid || `item-${index}`;
  const imageSource = useMemo(
    () => (validThumbnailUrl ? { uri: validThumbnailUrl } : null),
    [validThumbnailUrl]
  );

  const cellContent = (
    <>
      {imageSource && !shouldBlur && (
        <Image
          source={imageSource}
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
    <NativePressable style={flattenedStyle} onPress={handlePress}>
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
  useNativeTabBottomSafeArea?: boolean;
  pullToRefresh?: ListFeedPullToRefresh;
}

function GridFeedView({
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
  useNativeTabBottomSafeArea = false,
  pullToRefresh,
  ref,
}: GridFeedViewProps & { ref?: Ref<ListFeedViewRef> }) {
  'use no memo';
  const isHeaderFeed = getIsHeaderFeed(feedOption, headerComponent);
  const profileColors = getProfileColors(backgroundColor, secondaryColor);
  const flashListRef = useRef<FlashListRef<ExtendedFeedViewPost>>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [gridLayoutHeight, setGridLayoutHeight] = useState(0);
  const useScrollTracking = !ListComponent && isHeaderFeed;
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
    : isHeaderFeed && headerHeight > 0
      ? headerHeight
      : 0;
  const emptyComponentHeight = Math.max(0, listViewportForEmpty - emptyStateHeaderDeduction);

  const animatedScrollRef = useAnimatedRef<Animated.ScrollView>();
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => <Animated.ScrollView ref={animatedScrollRef} {...props} />,
    []
  );
  const scrollOffsetYSV = useScrollOffset(animatedScrollRef);

  useAnimatedReaction(
    () => scrollOffsetYSV.value,
    y => {
      if (contentScrollProgressOutput) {
        contentScrollProgressOutput.set(
          Math.max(0, Math.min(1, y / SCROLL_CONSTANTS.HEADER_FADE_DISTANCE))
        );
      }
    },
    [contentScrollProgressOutput]
  );

  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) {
      setHeaderHeight(prev => (prev === h ? prev : h));
    }
  }, []);

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

  const { screenWidth: windowWidth, isTablet } = useDeviceLayout();
  const computedColumns = (() => {
    let cols = 3;
    if (windowWidth > 1200 || isTablet) {
      cols = 6;
    } else if (windowWidth > 900) {
      cols = 5;
    } else if (windowWidth > 480) {
      cols = 4;
    } else {
      cols = 3;
    }
    return Math.max(3, cols);
  })();

  const numColumns = computedColumns;
  const itemWidth = windowWidth / numColumns;
  const itemHeight = itemWidth / DEFAULT_VIDEO_ASPECT_RATIO;
  const extraBottomPadding = isIosLiquidGlassAvailable ? IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING : 0;

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

  const ListEl = ListComponent || FlashList;
  const listProps = useMemo(
    () => ({
      ...(ListComponent ? {} : { ref: flashListRef }),
      decelerationRate:
        Platform.OS === 'ios'
          ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
          : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID,
      // Header feeds keep the animated scroll ref so the header-fade reaction receives offset.
      ...(useScrollTracking ? { renderScrollComponent } : {}),
    }),
    [ListComponent, useScrollTracking, renderScrollComponent]
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
      {listContent}
    </View>
  );
}

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
