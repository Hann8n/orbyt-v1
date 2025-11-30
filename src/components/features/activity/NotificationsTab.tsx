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
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient, useQuery } from '@tanstack/react-query';

import ProfileCache, { profileKeys } from '../../../services/cache/ProfileCache';
import { Avatar, Icon, Colors } from '../../../components/ui/UI';
import { Loading3FillIcon } from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight } from '../../../utils/helpers';
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
}> = ({ item, navigation, queryClient }) => {
  const { reason, author, post, reasonSubject, indexedAt } = item;
  
  // Determine if this is a post-related notification
  const isPostAction = ['like', 'repost', 'reply', 'quote', 'mention'].includes(reason);
  const postUri = post?.uri || reasonSubject;
  
  // Fetch post data for thumbnails if we have a post URI but no post data
  const { data: fetchedPost } = useQuery({
    queryKey: ['notification-post', postUri],
    queryFn: async () => {
      if (!postUri || post) return null; // Don't fetch if we already have post data
      try {
        const postData = await AtprotoService.getPost(postUri);
        return postData;
      } catch (error) {
        if (__DEV__) {
          console.log('Failed to fetch post for thumbnail:', postUri, error);
        }
        return null;
      }
    },
    enabled: isPostAction && !!postUri && !post, // Only fetch if we need it and don't have it
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
  
  // Use fetched post or existing post data
  const postData = post || fetchedPost;
  
  // Try to get thumbnail from post data
  let thumbnail: string | null = null;
  if (isPostAction && postData) {
    thumbnail = getPostThumbnail(postData);
  }
  
  let actionText = '';
  switch (reason) {
    case 'like':
      actionText = 'liked your post';
      break;
    case 'repost':
      actionText = 'reshared your post';
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
    // For post-related actions, navigate to feed modal
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
          shouldCache: true,
          uniqueKey: finalPostData.uri,
          moderationDecision: finalPostData.moderationDecision,
        };
        
        // Set the current feed with just this post
        feedService.setCurrentFeed([feedItem]);
        
        // Navigate to feed modal
        navigation.push({
          pathname: '/(modals)/feed',
          params: {
            initialIndex: 0,
            initialUri: postUri,
            feedOption: 'search',
            userDid: undefined,
            backgroundColor: 'transparent',
            secondaryColor: Colors.white,
            searchQuery: '',
            hasNextPage: 'false',
            isFetchingNextPage: 'false',
          }
        });
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

  return (
    <TouchableOpacity
      style={styles.notificationItem}
      onPress={handlePress}
    >
      <Avatar
        uri={author?.avatar}
        type="profile"
        size={50}
        showRing={true}
        style={styles.profileImage}
      />
      <View style={styles.notificationContent}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text style={styles.authorName}>
            {author.displayName || author.handle || 'Unknown user'}
          </Text>
          {author.handle && (
            <VerificationBadge 
              handle={author.handle} 
              textSize={14} 
              textColor={Colors.white}
            />
          )}
        </View>
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
      </View>
      {thumbnail && (
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
          resizeMode="cover"
          onError={() => {
            // Silently fail - image just won't display
            if (__DEV__) {
              console.log('Thumbnail failed to load:', thumbnail);
            }
          }}
        />
      )}
    </TouchableOpacity>
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

  const renderNotificationContent = useCallback(({ item }: { item: any }) => {
    // Debug logging - log raw notification structure (only first few to avoid spam)
    if (__DEV__ && notifications.indexOf(item) < 3) {
      const { reason, author, post, reasonSubject, record } = item;
      const isPostAction = ['like', 'repost', 'reply', 'quote', 'mention'].includes(reason);
      
      if (isPostAction) {
        console.log('=== NOTIFICATION DEBUG ===');
        console.log('Reason:', reason);
        console.log('Full notification item:', JSON.stringify(item, null, 2));
        console.log('Post object:', JSON.stringify(post, null, 2));
        console.log('Record object:', JSON.stringify(record, null, 2));
        console.log('ReasonSubject:', reasonSubject);
        console.log('Post keys:', post ? Object.keys(post) : 'no post');
        console.log('Post embed:', post?.embed ? JSON.stringify(post.embed, null, 2) : 'no embed');
        console.log('Post embeds:', post?.embeds ? JSON.stringify(post.embeds, null, 2) : 'no embeds');
        console.log('Record embed:', record?.embed ? JSON.stringify(record.embed, null, 2) : 'no record embed');
        console.log('=======================');
      }
    }
    
    return (
      <NotificationItem 
        item={item} 
        navigation={navigation} 
        queryClient={queryClient}
      />
    );
  }, [navigation, queryClient, notifications]);

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
        minIndexForVisible: 0, 
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
  thumbnail: {
    width: 45,
    height: 80, // 9:16 aspect ratio (45/80 = 0.5625)
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
