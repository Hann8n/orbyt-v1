import React, { useCallback, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  LayoutChangeEvent,
  Platform,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import type { ListFeedViewRef } from '../../../types';
import { Colors } from '../../../theme';
import { getVideoView, DEFAULT_VIDEO_ASPECT_RATIO } from '../../../utils/video/helpers';
import { APP_CONSTANTS, QUERY_CONSTANTS, SCROLL_CONSTANTS } from '../../../utils/constants';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import * as Device from 'expo-device';
import { getViewportDimensions } from '../../../utils/device/screen';
import EmptyFeed from './EmptyFeed';
import BlurredBackground from '../../ui/BlurredBackground';
import { hexToRGBA } from '../../../utils/formatting/colors';
import {
  FEED_VIEW_CONSTANTS,
  getEmptyFeedType,
  getFeedItemKey,
  getProfileColors,
  isHeaderFeed as getIsHeaderFeed,
} from './feedViewShared';
import { FeedScrollProvider } from '../../../context/FeedScrollContext';
import type { SharedValue } from 'react-native-reanimated';
import type { ComponentType, Ref } from 'react';
import type { FlashListProps } from '@shopify/flash-list';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as ComponentType<
  FlashListProps<ExtendedFeedViewPost> & { ref?: Ref<FlashListRef<ExtendedFeedViewPost>> }
>;

// Memoized shared video item component
const VideoGridItem: React.FC<{
  item: ExtendedFeedViewPost;
  index: number;
  onPress: (index: number) => void;
  style?: StyleProp<ViewStyle>;
  itemStyle?: StyleProp<ViewStyle>;
  thumbnailStyle?: ImageStyle;
}> = ({ item, index, onPress, style, itemStyle, thumbnailStyle }) => {
  const videoView = getVideoView(item.post.embed);
  const thumbnailUrl = videoView?.thumbnail || null;
  const shouldBlur = !!(item.contentListUI?.blur || item.contentMediaUI?.blur);

  // Simple press handler for the grid cell.
  // Keeping this as a plain function avoids unnecessary manual memoization.
  const handlePress = () => onPress(index);

  const validThumbnailUrl =
    thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim() !== ''
      ? thumbnailUrl
      : null;

  const recyclingKey = item.post?.uri || item.post?.cid || `item-${index}`;

  return (
    <Pressable style={[styles.gridItem, style, itemStyle]} onPress={handlePress}>
      <BlurredBackground thumbnailUrl={validThumbnailUrl} />
      {validThumbnailUrl && !shouldBlur && (
        <Image
          source={{ uri: validThumbnailUrl }}
          style={[styles.thumbnail, thumbnailStyle]}
          contentFit="contain"
          recyclingKey={recyclingKey}
          cachePolicy="disk"
          transition={200}
        />
      )}
    </Pressable>
  );
};

VideoGridItem.displayName = 'VideoGridItem';

const ITEM_MARGIN = 2; // Divider thickness for both grid directions

const gridKeyExtractor = (item: ExtendedFeedViewPost, _index: number): string =>
  getFeedItemKey(item);

interface GridFeedViewProps {
  feed: ExtendedFeedViewPost[];
  headerComponent?: React.ReactNode;
  backgroundColor?: string;
  secondaryColor?: string;
  isProfileFeed?: boolean;
  feedOption: 'profile' | 'following' | 'likes' | 'reposts' | string;
  userDid?: string;
  onLoadMore: () => void; // Simplified callback for loading more content
  hasNextPage?: boolean;
  onGridItemPress?: (index: number) => void; // Callback for grid item tap
  isError?: boolean;
  onRetry?: () => void;
  ListComponent?: React.ComponentType<unknown> | null; // Optional custom list component
  isModal?: boolean;
  /** When provided, grid writes scroll progress (0..1) here on UI thread for overlay/header fade. */
  contentScrollProgressOutput?: SharedValue<number>;
}

const GridFeedView = forwardRef<ListFeedViewRef, GridFeedViewProps>(
  (
    {
      feed,
      headerComponent,
      isModal = false,
      backgroundColor = Colors.black,
      secondaryColor = Colors.neutral[50],
      isProfileFeed = false,
      feedOption,
      userDid,
      onLoadMore,
      hasNextPage = false,
      onGridItemPress,
      isError = false,
      onRetry,
      ListComponent,
      contentScrollProgressOutput,
    },
    ref
  ) => {
    const effectiveBackgroundColor = backgroundColor || Colors.black;

    // Determine if this is a header feed (profile, channel, etc.)
    const isHeaderFeed = getIsHeaderFeed(feedOption, headerComponent);

    // Use profile colors when available
    const profileColors = getProfileColors(backgroundColor, secondaryColor);

    // Ref for scrolling
    const flashListRef = useRef<FlashListRef<ExtendedFeedViewPost>>(null);

    // Header height for FeedScrollContext (only when header present and using FlashList)
    const [headerHeight, setHeaderHeight] = useState(0);
    const hasHeader = Boolean(headerComponent);
    const useScrollTracking = !ListComponent && hasHeader;

    const scrollOffsetYSV = useSharedValue(0);
    const fadeDist = useScrollTracking ? SCROLL_CONSTANTS.HEADER_FADE_DISTANCE : 0;
    const contentScrollProgressSV = useDerivedValue(() => {
      'worklet';
      return fadeDist > 0 ? Math.max(0, Math.min(1, scrollOffsetYSV.value / fadeDist)) : 0;
    }, [scrollOffsetYSV, fadeDist]);

    const scrollHandler = useAnimatedScrollHandler(
      {
        onScroll: event => {
          'worklet';
          const y = event.contentOffset.y;
          /* eslint-disable react-hooks/immutability -- SharedValue mutations (scrollOffsetYSV, contentScrollProgressOutput) in useAnimatedScrollHandler worklet */
          scrollOffsetYSV.value = y;
          if (contentScrollProgressOutput && fadeDist > 0) {
            contentScrollProgressOutput.value = Math.max(0, Math.min(1, y / fadeDist));
          }
          /* eslint-enable react-hooks/immutability */
        },
      },
      [contentScrollProgressOutput, fadeDist]
    );

    const handleHeaderLayout = (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && h !== headerHeight) {
        requestAnimationFrame(() => setHeaderHeight(h));
      }
    };

    // Expose scrollToTop method
    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => {
          if (flashListRef.current) {
            // Grid always uses FlashList
            flashListRef.current.scrollToTop({ animated: true });
          }
        },
      }),
      []
    );

    // Responsive grid columns and item size
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isTablet =
      Device.deviceType === Device.DeviceType.TABLET || Math.min(windowWidth, windowHeight) >= 600;
    // Breakpoints: ensure at least 3 columns; default 3 on mobile
    // Adjust as needed: 3 (<=480), 4 (<=900), 5 (<=1200), 6 (>1200 or tablets)
    const computedColumns = (() => {
      const w = windowWidth || Dimensions.get('window').width;
      let cols = 3; // default mobile
      if (w > 1200 || isTablet) {
        cols = 6;
      } else if (w > 900) {
        cols = 5;
      } else if (w > 480) {
        cols = 4;
      } else {
        cols = 3;
      }
      // enforce minimum of 3
      return Math.max(3, cols);
    })();

    const numColumns = computedColumns;
    // With borders instead of margins, items can use full width divided by columns.
    // Cell aspect matches standard video aspect (9:16 portrait).
    const itemWidth = (windowWidth || Dimensions.get('window').width) / numColumns;
    const itemHeight = itemWidth / DEFAULT_VIDEO_ASPECT_RATIO;
    const itemSpacing = itemHeight + ITEM_MARGIN;

    // Use actual safe area insets and bottom nav bar height
    const insets = useSafeAreaInsets();
    const viewportDimensions = getViewportDimensions(isModal, isHeaderFeed, insets);
    const viewableAreaHeight = viewportDimensions.height;
    // When used inside a custom container, subtract header height
    const headerHeightForTabs = ListComponent ? FEED_VIEW_CONSTANTS.HEADER_HEIGHT_TABS : 0;
    const emptyComponentHeight = Math.max(0, viewableAreaHeight - headerHeightForTabs);

    // Render each grid item - optimized with background processing
    const renderGridItem = useCallback(
      ({ item, index }: { item: ExtendedFeedViewPost; index: number }) => {
        // Calculate if this is the last column or last row for spacing
        const isLastColumn = (index + 1) % numColumns === 0;
        const isLastRow =
          Math.floor(index / numColumns) === Math.floor((feed.length - 1) / numColumns);

        const onPress = () => onGridItemPress?.(index);

        // Create border styles - only show borders on the inside of the grid
        const borderStyle = {
          borderRightWidth: isLastColumn ? 0 : ITEM_MARGIN,
          borderBottomWidth: isLastRow ? 0 : ITEM_MARGIN,
          borderColor: effectiveBackgroundColor,
        };

        return (
          <VideoGridItem
            item={item}
            index={index}
            onPress={onPress}
            style={[
              { width: itemWidth, height: itemHeight, backgroundColor: effectiveBackgroundColor },
              borderStyle,
            ]}
            itemStyle={styles.gridItemOverride}
            thumbnailStyle={styles.thumbnailOverride}
          />
        );
      },
      [onGridItemPress, feed, numColumns, itemWidth, itemHeight, effectiveBackgroundColor]
    );

    const feedScrollValue = useScrollTracking
      ? {
          scrollOffsetYSV,
          headerHeight,
          viewportHeight: viewportDimensions.height,
          itemSpacing,
          contentScrollProgressSV,
        }
      : null;

    const ListEl = ListComponent || (useScrollTracking ? AnimatedFlashList : FlashList);
    const listProps = (() => {
      const base: Record<string, unknown> = ListComponent ? {} : { ref: flashListRef };
      if (useScrollTracking) {
        const gridSnapOffset = Math.max(0, headerHeight - insets.top);
        base.onScroll = scrollHandler;
        base.scrollEventThrottle = APP_CONSTANTS.SCROLL_THROTTLE;
        base.snapToOffsets = headerHeight > 0 ? [0, gridSnapOffset] : [0];
        base.decelerationRate =
          Platform.OS === 'ios'
            ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
            : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID;
        base.disableIntervalMomentum = true;
      }
      return base;
    })();

    const listHeader = headerComponent ? (
      <View
        style={styles.headerWrapper}
        onLayout={useScrollTracking ? handleHeaderLayout : undefined}
      >
        {headerComponent}
        <View style={[styles.headerSeparator, { backgroundColor: effectiveBackgroundColor }]} />
      </View>
    ) : null;

    const listContent = (
      <ListEl
        {...listProps}
        key={`grid-${feedOption}-${userDid || 'default'}-cols-${numColumns}`}
        data={feed}
        renderItem={renderGridItem}
        keyExtractor={gridKeyExtractor}
        numColumns={numColumns}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: viewportDimensions.bottomNavBarHeight,
            backgroundColor: effectiveBackgroundColor,
          },
        ]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        bounces={true}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isError ? (
            <EmptyFeed
              type="error"
              secondaryColor={secondaryColor}
              profileColors={profileColors}
              onRetry={onRetry}
              isProfileFeed={isProfileFeed || isHeaderFeed}
              viewableAreaHeight={emptyComponentHeight}
              feedOption={feedOption}
            />
          ) : (
            <EmptyFeed
              type={getEmptyFeedType(feedOption)}
              secondaryColor={secondaryColor}
              profileColors={profileColors}
              isProfileFeed={isProfileFeed || isHeaderFeed}
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
      <View style={[styles.container, { backgroundColor: effectiveBackgroundColor }]}>
        {useScrollTracking && feedScrollValue ? (
          <FeedScrollProvider value={feedScrollValue}>{listContent}</FeedScrollProvider>
        ) : (
          listContent
        )}
      </View>
    );
  }
);

GridFeedView.displayName = 'GridFeedView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  headerWrapper: {
    width: '100%',
  },
  headerSeparator: {
    height: FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT,
    backgroundColor: Colors.black,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
    paddingHorizontal: 0,
  },
  gridItem: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 0,
    backgroundColor: Colors.black,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  itemOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    // backgroundColor: 'rgba(0, 0, 0, 0.5)', // Remove the grey bar background
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: hexToRGBA(Colors.black, 0.5),
    borderRadius: BORDER_RADIUS.SMALL,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  authorAvatar: {
    width: 18,
    height: 18,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  authorName: {
    color: Colors.neutral[50],
    fontSize: 10,
    flex: 1,
    fontFamily: 'Figtree-Medium',
  },
  repostIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: hexToRGBA(Colors.black, 0.6),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomLeftRadius: 4,
  },
  repostText: {
    color: Colors.neutral[50],
    fontSize: 9,
    fontFamily: 'Figtree-Regular',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  warningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: hexToRGBA(Colors.black, 0.95),
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    padding: 12,
  },
  warningText: {
    color: Colors.neutral[50],
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  // removed topDivider to eliminate gap under header
  warningIcon: {
    // Centered by parent container
  },
  blurText: {
    color: Colors.neutral[50],
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
    fontFamily: 'Figtree-Medium',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  showAnywayButton: {
    backgroundColor: hexToRGBA(Colors.neutral[50], 0.2),
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 8,
    paddingHorizontal: 12, // reduced for tighter fit
    marginTop: 8,
    borderWidth: 1,
    borderColor: hexToRGBA(Colors.neutral[50], 0.3),
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    minWidth: 64,
    maxWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  showAnywayButtonText: {
    color: Colors.neutral[50],
    fontSize: 15,
    fontFamily: 'Figtree-Medium',
    fontWeight: '600',
    textAlign: 'center',
  },
  gridItemOverride: {
    borderRadius: 0,
    padding: 0,
  },
  thumbnailOverride: {
    borderRadius: 0,
  },
});

export default GridFeedView;
