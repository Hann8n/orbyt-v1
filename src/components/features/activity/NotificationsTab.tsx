import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import { useRouter, useFocusEffect } from 'expo-router';
import { useInfiniteQuery, useQueryClient, useQuery } from '@tanstack/react-query';

import ProfileCache, { profileKeys } from '../../../services/cache/ProfileCache';
import { Avatar, Icon, Colors } from '../../../components/ui/UI';
import { Loading3FillIcon } from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight, formatHandle } from '../../../utils/helpers';
import { feedService } from '../../../services/FeedService';
import { formatRelativeDate } from '../../ui/RelativeDate';

// Import radar.gif for empty notifications state
const RadarGif = require('../../../assets/radar.gif');

// Custom empty state for notifications
const EmptyNotifications = () => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyContent}>
      <Image source={RadarGif} style={styles.radarGif} />
       <Text style={styles.emptyText}>no recent notifications</Text>
    </View>
  </View>
);

const NotificationLoading = () => (
  <View style={styles.loadingContainer}>
    <Loading3FillIcon size={48} color={Colors.white} />
  </View>
);

// Divider component for notifications
const NotificationDivider = () => (
  <View style={styles.divider} />
);

// Helper function to extract thumbnail from post embed
const getPostThumbnail = (post: any): string | null => {
  if (!post) return null;
  
  // Check for embed (singular) or embeds (plural) array
  const embed = post?.embed || (post?.embeds && post.embeds[0]) || null;
  if (!embed) return null;
  
  // Video posts
  if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
    return embed.thumbnail || null;
  } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    if (embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view') {
      return embed.media?.thumbnail || null;
    }
  }
  
  // Image posts - get first image
  if (embed.$type === 'app.bsky.embed.images' || embed.$type === 'app.bsky.embed.images#view') {
    return embed.images?.[0]?.fullsize || embed.images?.[0]?.thumb || null;
  } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    if (embed.media?.$type === 'app.bsky.embed.images' || embed.media?.$type === 'app.bsky.embed.images#view') {
      return embed.media?.images?.[0]?.fullsize || embed.media?.images?.[0]?.thumb || null;
    }
  }
  
  // External link posts
  if (embed.$type === 'app.bsky.embed.external' || embed.$type === 'app.bsky.embed.external#view') {
    return embed.thumb || null;
  }
  
  // Quoted posts - check if the quoted post has a thumbnail
  if (embed.$type === 'app.bsky.embed.record' || embed.$type === 'app.bsky.embed.record#view') {
    if (embed.record?.embeds?.[0]) {
      return getPostThumbnail({ embed: embed.record.embeds[0] });
    }
    // Also check if record has a value with embeds
    if (embed.record?.value?.embed) {
      return getPostThumbnail({ embed: embed.record.value.embed });
    }
  }
  
  return null;
};

// Notification item component that can use hooks
const NotificationItem: React.FC<{ 
  item: any; 
  navigation: any; 
  queryClient: any;
  postDataMap: Map<string, any>;
}> = ({ item, navigation, queryClient, postDataMap }) => {
  const { reason, author, post, reasonSubject, indexedAt } = item;
  
  // Determine if this is a post-related notification
  const isPostAction = ['like', 'repost', 'reply', 'quote', 'mention'].includes(reason);
  const postUri = post?.uri || reasonSubject;
  
  // Get post data from the batch-fetched map (passed from parent)
  const fetchedPost = postUri ? postDataMap.get(postUri) : undefined;
  
  // Use fetched post or existing post data
  const postData = post || fetchedPost;
  
  // Try to get thumbnail from post data and determine post type
  let thumbnail: string | null = null;
  let isVideoThumbnail = false;
  if (isPostAction && postData) {
    thumbnail = getPostThumbnail(postData);
    
    // Check if this is a video post for thumbnail styling
    const embed = postData?.embed;
    if (embed) {
      if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
        isVideoThumbnail = true;
      } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
        if (embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view') {
          isVideoThumbnail = true;
        }
      }
    }
  }
  
  // Determine the post type label (video vs post)
  const postTypeLabel = isVideoThumbnail ? 'video' : 'post';
  
  let actionText = '';
  switch (reason) {
    case 'like':
      actionText = `liked your ${postTypeLabel}`;
      break;
    case 'repost':
      actionText = `reshared your ${postTypeLabel}`;
      break;
    case 'follow':
      actionText = 'followed you';
      break;
    case 'mention':
      actionText = 'mentioned you';
      break;
    case 'reply':
      actionText = 'replied to your post';
      break;
    case 'quote':
      actionText = 'quoted your post';
      break;
    case 'starterpack-joined':
      actionText = 'joined your starter pack';
      break;
    case 'verified':
      actionText = 'verified you';
      break;
    case 'unverified':
      actionText = 'unverified you';
      break;
    default:
      actionText = `performed action: ${reason}`;
  }

  const handlePress = async () => {
    // For post-related actions, check if it's a video post
    if (isPostAction && postUri) {
      try {
        // Use fetched post or fetch it again
        const finalPostData = postData || await AtprotoService.getPost(postUri);
        if (!finalPostData) {
          // Fallback to profile if post fetch fails
          if (author?.handle) {
            const handle = author.handle.trim();
            if (handle) {
              navigation.push(`/profile/${handle}`);
            }
          }
          return;
        }
        
        // Check if this is a video post
        const isVideoPost = () => {
          const embed = finalPostData?.embed;
          if (!embed) return false;
          
          if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
            return true;
          } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
            return embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view';
          }
          return false;
        };
        
        // For video posts, open in feed modal
        if (isVideoPost()) {
          // Create a feed item with the post data
          const feedItem = {
            post: {
              uri: finalPostData.uri,
              cid: finalPostData.cid,
              author: finalPostData.author,
              record: finalPostData.record,
              embed: finalPostData.embed,
              replyCount: finalPostData.replyCount,
              repostCount: finalPostData.repostCount,
              likeCount: finalPostData.likeCount,
              indexedAt: finalPostData.indexedAt,
            },
            uniqueKey: finalPostData.uri,
            moderationDecision: finalPostData.moderationDecision,
          };
          
          // Set the current feed with just this post
          feedService.setCurrentFeed([feedItem]);
          
          // Navigate to feed modal
          navigation.push({
            pathname: '/(modals)/feed',
            params: {
              feedOption: 'search',
              userDid: undefined,
              backgroundColor: 'transparent',
              secondaryColor: Colors.white,
              searchQuery: '',
              hasNextPage: 'false',
              isFetchingNextPage: 'false',
            }
          });
        } else {
          // For non-video posts (text, images, links), open in Bluesky app
          const { openPostInBluesky } = await import('../../../utils/blueskyLinks');
          await openPostInBluesky(postUri);
        }
      } catch (error) {
        // Fallback to profile on error
        if (author?.handle) {
          const handle = author.handle.trim();
          if (handle) {
            navigation.push(`/profile/${handle}`);
          }
        }
      }
    } else {
      // For profile-related actions, navigate to profile
      if (author?.handle) {
        const handle = author.handle.trim();
        // Prefetch profile using React Query before navigation
        queryClient.prefetchQuery({
          queryKey: profileKeys.detail(handle),
          queryFn: () => ProfileCache.getProfile(handle),
          staleTime: ProfileCache.cacheExpiry
        }).finally(() => {
          // Navigate regardless of prefetch success
          const target = handle.trim();
          if (target) { 
            navigation.push(`/profile/${target}`); 
          }
        });
      }
    }
  };

  // Separate handler for profile navigation
  const handleProfilePress = () => {
    if (author?.handle) {
      const handle = author.handle.trim();
      // Prefetch profile using React Query before navigation
      queryClient.prefetchQuery({
        queryKey: profileKeys.detail(handle),
        queryFn: () => ProfileCache.getProfile(handle),
        staleTime: ProfileCache.cacheExpiry
      }).finally(() => {
        // Navigate regardless of prefetch success
        const target = handle.trim();
        if (target) { 
          navigation.push(`/profile/${target}`); 
        }
      });
    }
  };

  return (
    <View style={styles.notificationItem}>
      <TouchableOpacity onPress={handleProfilePress} activeOpacity={0.7}>
        <Avatar
          uri={author?.avatar}
          type="profile"
          size={50}
          showRing={true}
          style={styles.profileImage}
        />
      </TouchableOpacity>
      <View style={styles.notificationContent}>
        <TouchableOpacity onPress={handleProfilePress} activeOpacity={0.7}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={styles.authorName}>
              {formatHandle(author.handle) || 'Unknown user'}
            </Text>
            {author.handle && (
              <VerificationBadge 
                handle={author.handle} 
                textSize={14} 
                textColor={Colors.white}
              />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={{ flex: 1 }}>
          <View style={styles.actionRow}>
            <Text style={styles.actionText}>
              {actionText}
            </Text>
            {indexedAt && (
              <Text style={styles.timeText}>
                {formatRelativeDate(indexedAt)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
      {thumbnail && (
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
          <Image
            source={{ uri: thumbnail }}
            style={isVideoThumbnail ? styles.thumbnailVideo : styles.thumbnailPhoto}
            resizeMode="cover"
            onError={() => {
              // Silently fail - image just won't display
              if (__DEV__) {
                console.log('Thumbnail failed to load:', thumbnail);
              }
            }}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const NotificationsTab: React.FC = () => {
  const navigation = useRouter();
  const [isScrolling, setIsScrolling] = useState(false);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Initialize current user for ProfileCache on mount
  useEffect(() => {
    const initializeCache = async () => {
      try {
        const currentUser = await AtprotoService.getCurrentUser();
        if (currentUser?.did) {
          ProfileCache.setCurrentUserHandle(currentUser.handle);
        }
      } catch (error) {
      }
    };
    
    initializeCache();
  }, []);

  // Mark notifications as seen when the tab is focused
  useFocusEffect(
    useCallback(() => {
      // Update seen status when notifications tab is focused
      AtprotoService.updateNotificationSeen()
        .then(() => {
          // Invalidate unread count query after successfully marking as seen
          queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
        })
        .catch(() => {
          // Silently fail - seen status update is not critical
          // Still try to refresh the count in case it changed
          queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
        });
    }, [queryClient])
  );

  // Improved infinite query implementation - includes all notification types
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['notifications', 'all'],
    queryFn: async ({ pageParam }) => {
      const response = await AtprotoService.listNotifications(pageParam as string | null);
      return response;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Flatten notifications from all pages
  const notifications = useMemo(() => {
    return data?.pages.flatMap(page => page.notifications) || [];
  }, [data]);
  
  // Batch prefetch all author profiles for better performance
  useEffect(() => {
    if (notifications.length > 0) {
      // Extract all unique profiles from notifications and batch prefetch them
      ProfileCache.batchPrefetchFromFeed(notifications).catch(error => {
      });
    }
  }, [notifications]);

  // Extract unique post URIs that need to be fetched (notifications without post data)
  const postUrisToFetch = useMemo(() => {
    const uris = new Set<string>();
    for (const notification of notifications) {
      const isPostAction = ['like', 'repost', 'reply', 'quote', 'mention'].includes(notification.reason);
      const postUri = notification.post?.uri || notification.reasonSubject;
      // Only add if it's a post action, has a URI, and doesn't already have post data
      if (isPostAction && postUri && !notification.post) {
        uris.add(postUri);
      }
    }
    return Array.from(uris);
  }, [notifications]);

  // Batch fetch all posts needed for notifications
  const { data: postDataMap = new Map() } = useQuery({
    queryKey: ['notification-posts-batch', postUrisToFetch.join(',')],
    queryFn: async () => {
      if (__DEV__) {
        console.log(`[NotificationsTab] Batch fetching ${postUrisToFetch.length} unique posts`);
      }
      return AtprotoService.getPosts(postUrisToFetch);
    },
    enabled: postUrisToFetch.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const renderNotificationContent = useCallback(({ item }: { item: any }) => {
    return (
      <NotificationItem 
        item={item} 
        navigation={navigation} 
        queryClient={queryClient}
        postDataMap={postDataMap}
      />
    );
  }, [navigation, queryClient, postDataMap]);

  const handleScrollBeginDrag = useCallback(() => {
    setIsScrolling(true);
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    setTimeout(() => setIsScrolling(false), 200);
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    setTimeout(() => setIsScrolling(false), 100);
  }, []);

  // Improved preloadNextPage logic similar to CommentSection
  const preloadNextPage = useCallback(
    (currentOffset: number, contentHeight: number, containerHeight: number) => {
      const isCloseToBottom = (contentHeight - currentOffset - containerHeight) / contentHeight < 0.25;
      if (isCloseToBottom && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  // Optimized viewabilityConfig
  const viewabilityConfig = useMemo(
    () => ({
      viewAreaCoveragePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    []
  );

  // Create loading items for initial load
  const loadingItems = useMemo(() => {
    return Array(1).fill(0); // Just show one loading spinner
  }, []);

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <EmptyFeed 
          type="no-connection" 
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.listContainer}
      contentContainerStyle={{
        paddingHorizontal: 15,
        paddingBottom: bottomNavBarHeight + 5,
      }}
      data={isLoading ? loadingItems : notifications}
      renderItem={isLoading ? () => <NotificationLoading /> : renderNotificationContent}
      keyExtractor={(item, index) => isLoading ? `loading-${index}` : item.uri || `notification-${index}`}
      ItemSeparatorComponent={NotificationDivider}
      onScroll={({ nativeEvent }) => {
        const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
        preloadNextPage(contentOffset.y, contentSize.height, layoutMeasurement.height);
      }}
      scrollEventThrottle={16}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={async () => {
            try {
              await refetch();
            } catch (error) {
            }
          }}
          tintColor={Colors.white}
        />
      }
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={Platform.OS === 'android'}
      maxToRenderPerBatch={10}
      windowSize={21}
      initialNumToRender={15}
      updateCellsBatchingPeriod={30}
      maintainVisibleContentPosition={{ 
        disabled: false, 
        autoscrollToTopThreshold: undefined 
      }}
      viewabilityConfig={viewabilityConfig}
      ListEmptyComponent={!isLoading ? (
        <EmptyNotifications />
      ) : null}
      ListFooterComponent={isFetchingNextPage ? (
        <View style={styles.loadingMoreContainer}>
          <Loading3FillIcon size={24} color={Colors.white} />
        </View>
      ) : null}
    />
  );
};

export default NotificationsTab;

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.darkGray,
    marginLeft: 62, // Align with content (50px avatar + 12px margin)
    marginRight: -15, // Extend to right edge, ignoring 15px padding
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
    justifyContent: 'flex-start',
    marginRight: 10,
  },
  thumbnailVideo: {
    width: 45,
    height: 80, // 9:16 aspect ratio (45/80 = 0.5625)
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.darkGray,
  },
  thumbnailPhoto: {
    width: 60,
    height: 60, // 1:1 aspect ratio for photo posts
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.darkGray,
  },
  authorName: {
    color: Colors.white,
    fontSize: 18,
    marginBottom: 2,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  actionText: {
    color: Colors.mutedGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  timeText: {
    color: Colors.gray,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
    marginLeft: 4,
  },
  errorContainer: {
    flex: 1,
    padding: 20,
  },
  loadingMoreContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100, // Space below header
    paddingBottom: 100, // Space above bottom nav bar
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 60,
  },
  emptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarGif: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
});
