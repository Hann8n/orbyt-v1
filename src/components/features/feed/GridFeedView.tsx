import React, { useCallback, useEffect, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Dimensions, 
  Image, 
  Text,
  ActivityIndicator,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { FeedItem } from './ListFeedView';
import EmptyFeed from './EmptyFeed';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import VerificationBadge from '../verification/VerificationBadge';
import { extractVideoUrl, extractVideoThumbnail } from '../../../utils/helpers/video';
import { Avatar } from '../../ui/UI';
import { isSmallScreen, isTablet, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import { setCurrentFeed } from '../../../services/FeedStore';

const ITEM_MARGIN = 1; // Set divider thickness to 1 for both directions

interface GridFeedViewProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  isProfileLoading?: boolean;
  isProfileFeed?: boolean;
  feedOption: 'yourMix' | 'profile' | 'following' | 'author' | 'likes' | 'reposts' | string;
  userDid?: string;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onGridItemPress?: (index: number) => void; // Callback for grid item tap
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

const GridFeedView: React.FC<GridFeedViewProps> = ({
  feed,
  headerComponent,
  refreshControl,
  backgroundColor = 'transparent',
  secondaryColor = '#fff',
  isProfileLoading = false,
  isProfileFeed = false,
  feedOption,
  userDid,
  onEndReached,
  isFetchingNextPage = false,
  hasNextPage = false,
  onGridItemPress,
  isError = false,
  error,
  onRetry,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Responsive grid columns and item size
  const screen = Dimensions.get('window');
  let numColumns = 4;
  if (isTablet()) {
    numColumns = 6;
  } else if (isSmallScreen()) {
    numColumns = 3;
  }
  const itemWidth = (screen.width - (ITEM_MARGIN * (numColumns - 1))) / numColumns;
  const itemHeight = itemWidth * (16 / 9);

  // Restore bottomNavBarHeight and viewableAreaHeight for use in FlatList and EmptyFeed
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const viewableAreaHeight = screen.height - insets.top - bottomNavBarHeight;

  /**
   * Reset state when feed option changes to ensure independent behavior
   */
  useEffect(() => {
    // Clear video preloading for the previous feed
    VideoPreloadManager.clearUnneededVideos([]);
  }, [feedOption, userDid]);

  // Pre-process videos for streaming support - moved to background
  useEffect(() => {
    // For videos in the feed, preload them using streaming
    const processNewVideos = () => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const videosToPreload: string[] = [];
            
            // Collect videos for batch streaming
            for (const item of feed) {
              if (!item?.post?.uri) continue;
              
              // Extract the video URL from the post embed
              const videoUrl = extractVideoUrl(item.post.embed);
              if (videoUrl) {
                // Collect for batch streaming preload
                videosToPreload.push(videoUrl);
              }
            }
            
            // Use batch streaming preload for all grid videos with low priority
            if (videosToPreload.length > 0) {
              // Split into smaller chunks to prevent main thread blocking
              const chunkSize = 5;
              for (let i = 0; i < videosToPreload.length; i += chunkSize) {
                const chunk = videosToPreload.slice(i, i + chunkSize);
                setTimeout(() => {
                  VideoPreloadManager.batchAddToPreloadQueue(
                    chunk,
                    [] // No priority for grid videos
                  );
                }, i * 50); // Stagger chunk processing
              }
            }
          } catch (error) {
            console.warn('Error processing grid videos in background:', error);
          }
        }, 0);
      });
    };
    
    processNewVideos();
  }, [feed]);

  // Render each grid item - optimized with background processing
  const renderGridItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    // Skip non-video posts
    const videoUrl = extractVideoUrl(item.post.embed);
    const thumbnailUrl = extractVideoThumbnail(item.post.embed);
    if (!videoUrl) return null;
    
    // Check if it's a repost
    const isRepost = item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost';

    // Handle press: use the callback provided by parent
    const handlePress = () => {
      setCurrentFeed(feed);
      navigation.navigate('FeedModal', {
        initialUri: item.post.uri,
        initialIndex: index, // keep for fallback
        feedOption,
        userDid,
        backgroundColor,
        secondaryColor,
      });
    };

    // Check if this item should be blurred due to moderation
    const shouldBlur = item.moderationDecision?.blur;
    


    // Calculate if this is the last column or last row
    const isLastColumn = (index + 1) % numColumns === 0;
    const isLastRow = Math.floor(index / numColumns) === Math.floor((feed.length - 1) / numColumns);
    const isFirstColumn = index % numColumns === 0;
    const isFirstRow = index < numColumns;
    return (
      <TouchableOpacity
        style={[
          styles.gridItem,
          { width: itemWidth, height: itemHeight },
          !isLastColumn && { marginRight: ITEM_MARGIN },
          !isLastRow && { marginBottom: ITEM_MARGIN },
          isFirstColumn && { marginLeft: ITEM_MARGIN },
          isFirstRow && { marginTop: ITEM_MARGIN },
        ]}
        activeOpacity={0.7}
        onPress={handlePress}
      >
        {/* Video preview - use video URL directly */}
        <Image
          source={{ uri: thumbnailUrl || videoUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
          defaultSource={require('../../../assets/Vector_Normal_Grey.png')}
        />
        
        {/* Warning overlay for moderated content */}
        {shouldBlur && (
          <View style={styles.warningOverlay}>
            <Text style={styles.warningText}>
              {item.moderationDecision?.reason || 'Content Warning'}
            </Text>
          </View>
        )}
        
        {/* Overlay with author info removed as requested */}
      </TouchableOpacity>
    );
  }, [onGridItemPress, extractVideoUrl, feed, numColumns, itemWidth, itemHeight]);

  // Handle end reached in background
  const handleEndReachedBackground = useCallback(() => {
    if (onEndReached) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            onEndReached();
          } catch (error) {
            console.warn('Error in background end reached handler:', error);
          }
        }, 0);
      });
    }
  }, [onEndReached]);

  // Use FlatList to render the grid with appropriate numColumns
  return (
    <View style={[styles.container, { backgroundColor }]}> 
      <View style={styles.topDivider} />
      <FlatList
        key={`grid-${feedOption}-${userDid || 'default'}`}
        data={feed}
        renderItem={renderGridItem}
        keyExtractor={(item, index) => `grid-${item.post.uri}-${index}`}
        numColumns={numColumns}
        contentContainerStyle={[
          styles.listContent,
          feed.length === 0 && styles.emptyContentContainer,
          { paddingBottom: bottomNavBarHeight + 20, backgroundColor: 'transparent' }
        ]}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={headerComponent ? <View>{headerComponent}</View> : null}
        ListEmptyComponent={
          isProfileLoading ? (
            <View style={[styles.loadingContainer, { backgroundColor }]}> 
            </View>
          ) : isError ? (
            <EmptyFeed 
              type="error" 
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || 'transparent', textColor: secondaryColor } : undefined}
              feedKey={`grid-${feedOption}-${userDid || 'default'}`}
              onRetry={onRetry}
              isProfileFeed={isProfileFeed}
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
            />
          ) : (
            <EmptyFeed 
              type={feedOption === 'following' ? 'no-following' : 'no-videos'} 
              secondaryColor={secondaryColor} 
              profileColors={secondaryColor ? { backgroundColor: backgroundColor || 'transparent', textColor: secondaryColor } : undefined}
              feedKey={`grid-${feedOption}-${userDid || 'default'}`}
              isProfileFeed={isProfileFeed}
              viewableAreaHeight={viewableAreaHeight}
              feedOption={feedOption}
            />
          ) as React.ReactElement
        }
        refreshControl={refreshControl as any}
        onEndReached={handleEndReachedBackground}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={secondaryColor} />
            </View>
          ) : null
        }
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Changed from '#000' to transparent
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
    backgroundColor: 'transparent', // Ensure transparent gaps
  },
  gridItem: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 0, // Square corners
    backgroundColor: 'transparent', // Changed from '#000' to transparent
    // All margins for dividers are set dynamically in renderGridItem
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 0, // Square corners
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
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  authorAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  authorName: {
    color: '#fff',
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
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Firma-Regular',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
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
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  topDivider: {
    width: '100%',
    height: ITEM_MARGIN,
    backgroundColor: 'transparent', // Changed from '#000' to transparent
  },
});

export default GridFeedView;
