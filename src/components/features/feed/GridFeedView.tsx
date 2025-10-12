import React, { useState, useCallback, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Colors, Avatar } from '../../ui/UI';
import Icon from '../../ui/Icon';
import { extractColorsFromImage } from '../../../utils/formatting/colorUtils';
import { extractVideoUrl, extractVideoThumbnail } from '../../../utils/helpers/video';
import ProfileCache from '../../../services/cache/ProfileCache';
import ChannelCache from '../../../services/cache/ChannelCache';
import { useProfile } from '../../../services/cache/ProfileCache';
import { useChannelColors } from '../../../services/cache/ChannelCache';
import { useCurrentUser } from '../../../stores/userStore';
import { feedService } from '../../../services/FeedService';
import { BlurView } from 'expo-blur';
import { QUERY_CONSTANTS } from '../../../utils/constants';
import { FeedItem } from '../../../types';
import { isTablet, isSmallScreen, getBottomNavBarHeight } from '../../../utils/helpers';
import EmptyFeed from './EmptyFeed';
import { VideoGridItem } from './HorizontalVideoList';


const ITEM_MARGIN = 1; // Set divider thickness to 1 for both directions

interface GridFeedViewProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  isProfileLoading?: boolean;
  isProfileFeed?: boolean;
  feedOption: 'yourMix' | 'profile' | 'following' | 'likes' | 'reposts' | string;
  userDid?: string;
  onLoadMore: () => void; // Simplified callback for loading more content
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onGridItemPress?: (index: number) => void; // Callback for grid item tap
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  ListComponent?: any; // Optional custom list component
}

const GridFeedView: React.FC<GridFeedViewProps> = ({
  feed,
  headerComponent,
  refreshControl,
  backgroundColor = '#000',
  secondaryColor = '#fff',
  isProfileLoading = false,
  isProfileFeed = false,
  feedOption,
  userDid,
  onLoadMore,
  isFetchingNextPage = false,
  hasNextPage = false,
  onGridItemPress,
  isError = false,
  error,
  onRetry,
  ListComponent,
}) => {
  // Safe area removed for grid feed view
  const navigation = useRouter();

  // Determine if this is a header feed (profile, channel, etc.)
  const isHeaderFeed = (
    feedOption === 'profile' ||
    feedOption === 'likes' ||
    feedOption === 'reposts' ||
    feedOption.startsWith('at://')
  );

  // Initialize infinite scroll hook with cursor-based loading
  // Infinite scroll functionality removed - should be handled by parent component
  const onScroll = () => {};

  // Responsive grid columns and item size
  const screen = Dimensions.get('window');
  let numColumns = 4;
  if (isTablet()) {
    numColumns = 6;
  } else if (isSmallScreen()) {
    numColumns = 3;
  }
  // With borders instead of margins, items can use full width divided by columns
  const itemWidth = screen.width / numColumns;
  const itemHeight = itemWidth * (16 / 9);

  // Remove safe area insets for all grid views
  const effectiveInsets = { top: 0, bottom: 0, left: 0, right: 0 } as const;
  const bottomNavBarHeight = getBottomNavBarHeight(effectiveInsets);
  const viewableAreaHeight = screen.height - effectiveInsets.top - bottomNavBarHeight;
      // When used inside a custom container, subtract header height
  const headerHeightForTabs = ListComponent ? 280 : 0;
  const emptyComponentHeight = Math.max(0, viewableAreaHeight - headerHeightForTabs);



  // Render each grid item - optimized with background processing
  const renderGridItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    // Calculate if this is the last column or last row for spacing
    const isLastColumn = (index + 1) % numColumns === 0;
    const isLastRow = Math.floor(index / numColumns) === Math.floor((feed.length - 1) / numColumns);

    const onPress = () => {
      if (onGridItemPress) {
        onGridItemPress(index);
        return;
      }
      feedService.setCurrentFeed(feed);
             navigation.push({
          pathname: '/(modals)/feed',
          params: {
            initialUri: item.post.uri,
            initialIndex: index.toString(),
            feedOption,
            userDid,
            backgroundColor,
            secondaryColor,
          }
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
        style={[
          { width: itemWidth, height: itemHeight },
          borderStyle,
        ]}
        itemStyle={{ 
          borderRadius: 0,
          backgroundColor: 'transparent',
          padding: 0
        }}
        thumbnailStyle={{ 
          borderRadius: 0,
          backgroundColor: 'transparent'
        }}
      />
    );
  }, [onGridItemPress, feed, numColumns, itemWidth, itemHeight, navigation, feedOption, userDid, backgroundColor, secondaryColor]);

  // Combine scroll handlers for infinite scroll and other scroll events
  // Scroll handling removed - should be handled by parent component
  const handleScroll = useCallback(() => {}, []);

  // Use FlashList to render the grid with appropriate numColumns
  return (
    <View style={[styles.container, { backgroundColor }]}> 
      {(() => {
        const ListEl: any = ListComponent || FlashList;
        return (
          <ListEl
            key={`grid-${feedOption}-${userDid || 'default'}`}
            data={feed}
            renderItem={renderGridItem}
            keyExtractor={(item: FeedItem, index: number) => `grid-${item.post.uri}-${index}`}
            numColumns={numColumns}
            contentContainerStyle={[
              styles.listContent,
              feed.length === 0 && styles.emptyContentContainer,
              feed.length === 0
                ? { paddingBottom: 0, backgroundColor }
                : { paddingBottom: bottomNavBarHeight + 20, backgroundColor }
            ]}
            columnWrapperStyle={[styles.columnWrapper, { backgroundColor }]}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="never"
            bounces={false}
            ListHeaderComponent={headerComponent}
            ListEmptyComponent={
              isError ? (
                <EmptyFeed 
                  type="error" 
                  secondaryColor={secondaryColor} 
                  profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
                  onRetry={onRetry}
                  isProfileFeed={isProfileFeed || isHeaderFeed}
                  viewableAreaHeight={emptyComponentHeight}
                  feedOption={feedOption}
                />
              ) : (
                <EmptyFeed 
                  type={feedOption === 'following' ? 'no-following' : 'no-videos'} 
                  secondaryColor={secondaryColor} 
                  profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
                  isProfileFeed={isProfileFeed || isHeaderFeed}
                  viewableAreaHeight={emptyComponentHeight}
                  feedOption={feedOption}
                />
              ) as React.ReactElement
            }
            refreshControl={refreshControl as any}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            // Disable scrolling when there are no items
            scrollEnabled={feed.length > 0}
            onEndReached={hasNextPage ? onLoadMore : undefined}
            onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
            removeClippedSubviews={false}
    
          />
        );
      })()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black, // Changed back to black
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
    paddingHorizontal: 0, // Remove extra horizontal padding
  },
  emptyContentContainer: {
    flex: 1,
  },
  columnWrapper: {
    marginBottom: ITEM_MARGIN,
    backgroundColor: Colors.black, // default; overridden by prop
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
