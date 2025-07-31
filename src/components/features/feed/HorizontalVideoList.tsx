import React, { useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Text,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { FeedItem } from './ListFeedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import { extractVideoUrl, extractVideoThumbnail } from '../../../utils/helpers/video';
import { isVideoBlurred } from '../../../services/FeedStore';

// Shared video item component (factored out from GridFeedView)
export const VideoGridItem: React.FC<{
  item: FeedItem;
  index: number;
  onPress: (index: number) => void;
  style?: any;
}> = ({ item, index, onPress, style }) => {
  const videoUrl = extractVideoUrl(item.post.embed);
  const thumbnailUrl = extractVideoThumbnail(item.post.embed);
  if (!videoUrl) return null;
  const shouldBlur = isVideoBlurred(item.post.uri, !!item.moderationDecision?.blur);
  return (
    <TouchableOpacity
      style={[styles.gridItem, style]}
      activeOpacity={0.7}
      onPress={() => onPress(index)}
    >
      <Image
        source={{ uri: thumbnailUrl || videoUrl }}
        style={styles.thumbnail}
        resizeMode="cover"
        defaultSource={require('../../../assets/Vector_Normal_Grey.png')}
      />
      {shouldBlur && (
        <View style={styles.warningOverlay}>
          <Text style={styles.warningText}>
            {item.moderationDecision?.reason || 'Content Warning'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

interface HorizontalVideoListProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  isProfileLoading?: boolean;
  isProfileFeed?: boolean;
  feedOption: string;
  userDid?: string;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onVideoItemPress: (index: number) => void;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

const ITEM_HEIGHT = 180;
const ITEM_WIDTH = 110;
const ITEM_MARGIN = 8;

const HorizontalVideoList: React.FC<HorizontalVideoListProps> = ({
  feed,
  headerComponent,
  refreshControl,
  backgroundColor = '#000',
  secondaryColor = '#fff',
  isProfileLoading = false,
  isProfileFeed = false,
  feedOption,
  userDid,
  onEndReached,
  isFetchingNextPage = false,
  hasNextPage = false,
  onVideoItemPress,
  isError = false,
  error,
  onRetry,
}) => {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    VideoPreloadManager.clearUnneededVideos([]);
  }, [feedOption, userDid]);

  useEffect(() => {
    const processNewVideos = () => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const videosToPreload: string[] = [];
            for (const item of feed) {
              if (!item?.post?.uri) continue;
              const videoUrl = extractVideoUrl(item.post.embed);
              if (videoUrl) {
                videosToPreload.push(videoUrl);
              }
            }
            if (videosToPreload.length > 0) {
              const chunkSize = 5;
              for (let i = 0; i < videosToPreload.length; i += chunkSize) {
                const chunk = videosToPreload.slice(i, i + chunkSize);
                setTimeout(() => {
                  VideoPreloadManager.batchAddToPreloadQueue(chunk, []);
                }, i * 50);
              }
            }
          } catch (error) {
            console.warn('Error processing horizontal videos in background:', error);
          }
        }, 0);
      });
    };
    processNewVideos();
  }, [feed]);

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <VideoGridItem
        item={item}
        index={index}
        onPress={onVideoItemPress}
        style={{ marginRight: ITEM_MARGIN }}
      />
    ),
    [onVideoItemPress]
  );

  return (
    <View style={[styles.container, { backgroundColor, height: ITEM_HEIGHT + 16 }]}> {/* 16 for padding */}
      <FlatList
        key={`horizontal-${feedOption}-${userDid || 'default'}`}
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item, index) => `horizontal-${item.post.uri}-${index}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalListContent}
        ListHeaderComponent={headerComponent ? <View>{headerComponent}</View> : null}
        refreshControl={refreshControl as any}
        onEndReached={onEndReached}
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
        initialNumToRender={10}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: '100%',
  },
  horizontalListContent: {
    paddingLeft: 12,
    paddingRight: 12,
    alignItems: 'center',
    minHeight: ITEM_HEIGHT + 8,
  },
  gridItem: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    backgroundColor: '#111',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
    padding: 3,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1c1c1c',
    borderRadius: 11,
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default HorizontalVideoList;
