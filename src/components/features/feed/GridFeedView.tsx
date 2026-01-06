import React, { useCallback, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  type ViewStyle,
  type ImageStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import type { ListFeedViewRef } from '../../../types';
import { Colors } from '../../ui/UI';
import { extractVideoThumbnail } from '../../../utils/video/helpers';
import { feedService } from '../../../services/FeedService';
import { BlurView } from 'expo-blur';
import { QUERY_CONSTANTS } from '../../../utils/constants';
import type { UIFeedItem } from '../../../types';
import { isTablet, getBottomNavBarHeight } from '../../../utils/device/screen';
import EmptyFeed from './EmptyFeed';
import BlurredThumbnailBackground from '../../ui/BlurredThumbnailBackground';

// Memoized shared video item component
const VideoGridItem: React.FC<{
  item: UIFeedItem;
  index: number;
  onPress: (index: number) => void;
  style?: ViewStyle | ViewStyle[];
  itemStyle?: ViewStyle;
  thumbnailStyle?: ImageStyle;
}> = React.memo(({ item, index, onPress, style, itemStyle, thumbnailStyle }) => {
  const thumbnailUrl = extractVideoThumbnail(item.post.embed);

  // Get shouldBlur flag from feed item (computed at feed level)
  const feedItem = item as any;
  const shouldBlur = feedItem.shouldBlur ?? false;

  const handlePress = useCallback(() => onPress(index), [onPress, index]);

  const validThumbnailUrl =
    thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim() !== ''
      ? thumbnailUrl
      : null;

  // Use post URI or CID as unique recycling key to prevent image flashing during scroll
  const recyclingKey = item.post?.uri || item.post?.cid || `item-${index}`;

  return (
    <Pressable style={[styles.gridItem, style, itemStyle]} onPress={handlePress}>
      <BlurredThumbnailBackground thumbnailUrl={validThumbnailUrl} recyclingKey={recyclingKey} />
      {validThumbnailUrl && (
        <Image
          source={{ uri: validThumbnailUrl }}
          style={[styles.thumbnail, thumbnailStyle]}
          contentFit="contain"
          recyclingKey={recyclingKey}
          cachePolicy="disk"
          transition={200}
        />
      )}
      {shouldBlur && (
        <BlurView
          intensity={100}
          tint="dark"
          style={styles.blurOverlay}
          experimentalBlurMethod="dimezisBlurView"
        />
      )}
    </Pressable>
  );
});

const ITEM_MARGIN = 1; // Set divider thickness to 1 for both directions

interface GridFeedViewProps {
  feed: UIFeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  isProfileLoading?: boolean;
  isProfileFeed?: boolean;
  feedOption: 'profile' | 'following' | 'likes' | 'reposts' | string;
  userDid?: string;
  onLoadMore: () => void; // Simplified callback for loading more content
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onGridItemPress?: (index: number) => void; // Callback for grid item tap
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  ListComponent?: React.ComponentType<unknown> | null; // Optional custom list component
  onVerticalScroll?: (scrollY: number) => void;
}

const GridFeedView = forwardRef<ListFeedViewRef, GridFeedViewProps>(
  (
    {
      feed,
      headerComponent,
      refreshControl,
      backgroundColor = '#000',
      secondaryColor = '#fff',
      isProfileLoading: _isProfileLoading = false,
      isProfileFeed = false,
      feedOption,
      userDid,
      onLoadMore,
      isFetchingNextPage: _isFetchingNextPage = false,
      hasNextPage = false,
      onGridItemPress,
      isError = false,
      error: _error,
      onRetry,
      ListComponent,
      onVerticalScroll,
    },
    ref
  ) => {
    // Safe area removed for grid feed view
    const navigation = useRouter();

    // Determine if this is a header feed (profile, channel, etc.)
    const isHeaderFeed: boolean = Boolean(
      feedOption === 'profile' ||
      feedOption === 'likes' ||
      feedOption === 'reposts' ||
      (feedOption && feedOption.startsWith('at://'))
    );

    // Initialize infinite scroll hook with cursor-based loading
    // Infinite scroll functionality removed - should be handled by parent component

    // Refs for scrolling
    const scrollViewRef = useRef<ScrollView>(null);
    const flashListRef = useRef<FlashListRef<UIFeedItem>>(null);

    // Expose scrollToTop method
    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => {
          if (feed.length === 0 && scrollViewRef.current) {
            // Empty state uses ScrollView
            scrollViewRef.current.scrollTo({ y: 0, animated: true });
          } else if (flashListRef.current) {
            // Grid content uses FlashList
            flashListRef.current.scrollToOffset({ offset: 0, animated: true });
          }
        },
      }),
      [feed.length]
    );

    // Responsive grid columns and item size
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    // Breakpoints: ensure at least 3 columns; default 3 on mobile
    // Adjust as needed: 3 (<=480), 4 (<=900), 5 (<=1200), 6 (>1200 or tablets)
    const computedColumns = useMemo(() => {
      const w = windowWidth || Dimensions.get('window').width;
      let cols = 3; // default mobile
      if (w > 1200 || isTablet()) {
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
    }, [windowWidth]);

    const numColumns = computedColumns;
    // With borders instead of margins, items can use full width divided by columns
    const itemWidth = (windowWidth || Dimensions.get('window').width) / numColumns;
    const itemHeight = itemWidth * (16 / 9);

    // Use actual safe area insets and bottom nav bar height
    const insets = useSafeAreaInsets();
    const effectiveInsets = {
      top: insets.top || 0,
      bottom: insets.bottom || 0,
      left: insets.left || 0,
      right: insets.right || 0,
    } as const;
    const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);
    const viewableAreaHeight =
      (windowHeight || Dimensions.get('window').height) - effectiveInsets.top - bottomNavBarHeight;
    // When used inside a custom container, subtract header height
    const headerHeightForTabs = ListComponent ? 280 : 0;
    const emptyComponentHeight = Math.max(0, viewableAreaHeight - headerHeightForTabs);

    // Render each grid item - optimized with background processing
    const renderGridItem = useCallback(
      ({ item, index }: { item: UIFeedItem; index: number }) => {
        // Calculate if this is the last column or last row for spacing
        const isLastColumn = (index + 1) % numColumns === 0;
        const isLastRow =
          Math.floor(index / numColumns) === Math.floor((feed.length - 1) / numColumns);

        const onPress = () => {
          if (onGridItemPress) {
            onGridItemPress(index);
            return;
          }
          feedService.setCurrentFeed(
            feed as unknown as import('../../../services/api/types').ExtendedFeedViewPost[]
          );
          navigation.push({
            pathname: '/(modals)/feed',
            params: {
              feedOption,
              userDid,
              backgroundColor,
              secondaryColor,
            },
          });
        };

        // Create border styles - only show borders on the inside of the grid
        const borderStyle = {
          borderRightWidth: isLastColumn ? 0 : ITEM_MARGIN,
          borderBottomWidth: isLastRow ? 0 : ITEM_MARGIN,
          borderColor: 'transparent', // Transparent borders
        };

        return (
          <VideoGridItem
            item={item}
            index={index}
            onPress={onPress}
            style={[{ width: itemWidth, height: itemHeight }, borderStyle]}
            itemStyle={{
              borderRadius: 0,
              backgroundColor: 'transparent',
              padding: 0,
            }}
            thumbnailStyle={{
              borderRadius: 0,
              backgroundColor: 'transparent',
            }}
          />
        );
      },
      [
        onGridItemPress,
        feed,
        numColumns,
        itemWidth,
        itemHeight,
        navigation,
        feedOption,
        userDid,
        backgroundColor,
        secondaryColor,
      ]
    );

    // Combine scroll handlers for infinite scroll and header scroll progress updates
    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (onVerticalScroll && event?.nativeEvent?.contentOffset) {
          onVerticalScroll(event.nativeEvent.contentOffset.y || 0);
        }
      },
      [onVerticalScroll]
    );

    // Use FlashList to render the grid with appropriate numColumns
    return (
      <View style={[styles.container, { backgroundColor }]}>
        {feed.length === 0 ? (
          // Empty state: Use ScrollView for proper pull-to-refresh support
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
            refreshControl={refreshControl as any}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {headerComponent && <View style={styles.headerWrapper}>{headerComponent}</View>}
            {isError ? (
              <EmptyFeed
                type="error"
                secondaryColor={secondaryColor}
                profileColors={
                  secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined
                }
                onRetry={onRetry}
                isProfileFeed={isProfileFeed || isHeaderFeed}
                viewableAreaHeight={emptyComponentHeight}
                feedOption={feedOption}
              />
            ) : (
              <EmptyFeed
                type={feedOption === 'following' ? 'no-following' : 'no-videos'}
                secondaryColor={secondaryColor}
                profileColors={
                  secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined
                }
                isProfileFeed={isProfileFeed || isHeaderFeed}
                viewableAreaHeight={emptyComponentHeight}
                feedOption={feedOption}
              />
            )}
          </ScrollView>
        ) : (
          // Grid content: Use FlashList with header inside
          (() => {
            const ListEl = ListComponent || FlashList;
            // Only attach ref if using FlashList (not custom ListComponent)
            const listProps = ListComponent ? {} : { ref: flashListRef };
            return (
              <ListEl
                {...listProps}
                key={`grid-${feedOption}-${userDid || 'default'}-cols-${numColumns}`}
                data={feed}
                renderItem={renderGridItem}
                keyExtractor={(item: UIFeedItem) => {
                  // Use URI and CID for stable keys to prevent recycling issues
                  if (item.post?.cid && item.post?.uri) {
                    return `${item.post.uri}:${item.post.cid}`;
                  }
                  return item.post?.uri || `item-${Math.random()}`;
                }}
                numColumns={numColumns}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: effectiveInsets.bottom + bottomNavBarHeight, backgroundColor },
                ]}
                showsVerticalScrollIndicator={false}
                contentInsetAdjustmentBehavior="never"
                bounces={true}
                ListHeaderComponent={
                  headerComponent ? (
                    <View style={styles.headerWrapper}>{headerComponent}</View>
                  ) : null
                }
                refreshControl={refreshControl as any}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                scrollEnabled={true}
                onEndReached={hasNextPage ? onLoadMore : undefined}
                onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              />
            );
          })()
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  headerWrapper: {
    width: '100%',
    backgroundColor: 'transparent',
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
    backgroundColor: Colors.black, // Changed back to black
    // All margins for dividers are set dynamically in renderGridItem
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
    backgroundColor: 'rgba(0,0,0,0.5)', // Add subtle background only behind author row
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
    color: Colors.white,
    fontSize: 10,
    flex: 1,
    fontFamily: 'Firma-Medium',
  },
  repostIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomLeftRadius: 4,
  },
  repostText: {
    color: Colors.white,
    fontSize: 9,
    fontFamily: 'Firma-Regular',
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
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    padding: 12,
  },
  warningText: {
    color: Colors.white,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  // removed topDivider to eliminate gap under header
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    padding: 32,
  },
  warningIcon: {
    // Centered by parent container
  },
  blurText: {
    color: Colors.white,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
    fontFamily: 'Firma-Medium',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  showAnywayButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 8,
    paddingHorizontal: 12, // reduced for tighter fit
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
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
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default GridFeedView;
