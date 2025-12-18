import React, { useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  RefreshControl,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import type { ScrollToTopRef } from '../../../utils/tabRefs';
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
import { extractVideoThumbnail } from '../../../utils/helpers/video';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useUserStore } from '../../../stores/userStore';

// Import radar.gif for empty notifications state
const RadarGif = require('../../../assets/radar.gif');

// Custom empty state for notifications
const EmptyNotifications = () => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyContent}>
      <Image source={RadarGif} style={styles.radarGif} resizeMode="contain" />
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

// Post kind type
type PostKind = 'video' | 'image' | 'external' | 'record' | 'text';

// Helper to get embed from post data (handles different structures)
const getEmbed = (postData: any) => postData?.embed || postData?.record?.embed;

// Determine post kind from embed
const getPostKind = (embed: any): PostKind => {
  if (!embed) return 'text';
  
  const type = embed.$type;
  
  if (type === 'app.bsky.embed.video' || type === 'app.bsky.embed.video#view') {
    return 'video';
  }
  
  if (type === 'app.bsky.embed.recordWithMedia#view') {
    const mediaType = embed.media?.$type;
    if (mediaType === 'app.bsky.embed.video' || mediaType === 'app.bsky.embed.video#view') {
      return 'video';
    }
    if (mediaType === 'app.bsky.embed.images' || mediaType === 'app.bsky.embed.images#view') {
      return 'image';
    }
  }
  
  if (type === 'app.bsky.embed.images' || type === 'app.bsky.embed.images#view') {
    return 'image';
  }
  
  if (type === 'app.bsky.embed.external' || type === 'app.bsky.embed.external#view') {
    return 'external';
  }
  
  if (type === 'app.bsky.embed.record' || type === 'app.bsky.embed.record#view') {
    return 'record';
  }
  
  return 'text';
};

// Get thumbnail based on post kind (only for videos)
const getThumbnailByKind = (embed: any, kind: PostKind): string | null => {
  if (!embed) return null;
  
  // For record embeds, check if it's a nested video
  if (kind === 'record') {
    const nestedEmbed = embed.record?.embeds?.[0] || embed.record?.value?.embed;
    if (nestedEmbed) {
      const nestedKind = getPostKind(nestedEmbed);
      if (nestedKind === 'video') {
        return getThumbnailByKind(nestedEmbed, nestedKind);
      }
    }
    return null;
  }
  
  if (kind !== 'video') return null;
  
  if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
    return embed.thumbnail || extractVideoThumbnail(embed) || null;
  }
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view' && embed.media) {
    return embed.media.thumbnail || extractVideoThumbnail(embed) || null;
  }
  
  return null;
};

// Get post URI from notification
// Based on API structure:
// - subscribed-post: uri is the post URI
// - reply: record.reply.root.uri is the root post (reasonSubject is parent, not root)
// - like/repost: record.subject.uri is the post URI (record is the like/repost record)
// - quote/mention: post.uri exists with full post data
const getPostUri = (notification: any): string | null => {
  const { reason, uri, post, record } = notification;
  
  if (reason === 'subscribed-post') return uri;
  if (reason === 'reply') return record?.reply?.root?.uri || null;
  // For like/repost notifications, post field doesn't exist - must use record.subject.uri
  if (reason === 'like' || reason === 'repost') return record?.subject?.uri || null;
  return post?.uri || null;
};

// Extract post data from notification
// Based on API structure:
// - subscribed-post: record contains post data, use it directly or fetched version
// - reply: post field doesn't exist, must fetch root post from postDataMap
// - like/repost: post field doesn't exist - must use fetched post from postDataMap
// - quote/mention: post field contains full post data, use it directly
const getPostDataFromNotification = (notification: any, postDataMap: Map<string, any>) => {
  const { reason, uri, record, post } = notification;
  const postUri = getPostUri(notification);
  if (!postUri) return null;
  
  const fetchedPost = postDataMap.get(postUri);
  
  if (reason === 'subscribed-post' && record) {
    // Use fetched post if available, otherwise construct from notification record
    // Always ensure embed is set from record.embed even if fetched post exists
    const postData = fetchedPost || {
      uri,
      cid: notification.cid,
      author: notification.author,
      record,
      embed: record.embed,
      indexedAt: notification.indexedAt,
    };
    // Ensure embed is always set from record.embed (fetched post might be incomplete)
    if (record.embed && postData) {
      postData.embed = record.embed;
    }
    return postData;
  }
  
  // For reply notifications, post field doesn't exist - must use fetched root post
  if (reason === 'reply') return fetchedPost;
  
  // For like/repost notifications, post field doesn't exist - must use fetched post
  if (reason === 'like' || reason === 'repost') {
    return fetchedPost;
  }
  
  // For other notifications (quote/mention), post field contains full post data
  return post || fetchedPost;
};

// Notification item component
const NotificationItem: React.FC<{ 
  item: any; 
  navigation: any; 
  queryClient: any;
  postDataMap: Map<string, any>;
}> = ({ item, navigation, queryClient, postDataMap }) => {
  const { reason, author, indexedAt, uri } = item;
  const { presentCommentSection } = useGlobalCommentSection();
  
  const isPostAction = ['like', 'repost', 'reply', 'quote', 'mention', 'post', 'subscribed-post'].includes(reason);
  const postData = isPostAction ? getPostDataFromNotification(item, postDataMap) : null;
  const embed = postData ? getEmbed(postData) : null;
  const postKind = embed ? getPostKind(embed) : 'text';
  const thumbnail = embed ? getThumbnailByKind(embed, postKind) : null;
  const isVideo = postKind === 'video';
  const postTypeLabel = isVideo ? 'video' : 'post';
  
  const actionText = useMemo(() => {
    const actions: Record<string, string> = {
      like: `liked your ${postTypeLabel}`,
      repost: `reshared your ${postTypeLabel}`,
      follow: 'followed you',
      mention: 'mentioned you',
      reply: 'left a comment',
      quote: 'quoted your post',
      post: `created a ${postTypeLabel}`,
      'subscribed-post': `created a ${postTypeLabel}`,
      'starterpack-joined': 'joined your starter pack',
      verified: 'verified you',
      unverified: 'unverified you',
    };
    return actions[reason] || `performed action: ${reason}`;
  }, [reason, postTypeLabel]);
  
  // Navigate to profile
  const navigateToProfile = useCallback((handle: string) => {
    const trimmed = handle.trim();
    if (!trimmed) return;
    queryClient.prefetchQuery({
      queryKey: profileKeys.detail(trimmed),
      queryFn: () => ProfileCache.getProfile(trimmed),
      staleTime: ProfileCache.cacheExpiry
    }).finally(() => navigation.push(`/profile/${trimmed}`));
  }, [navigation, queryClient]);
  
  // Navigate to video post in feed
  const navigateToVideoPost = useCallback((postData: any) => {
    const embed = getEmbed(postData);
    feedService.setCurrentFeed([{
      post: {
        uri: postData.uri || item.uri,
        cid: postData.cid || item.cid,
        author: postData.author || author,
        record: postData.record || item.record,
        embed,
        replyCount: postData.replyCount || 0,
        repostCount: postData.repostCount || 0,
        likeCount: postData.likeCount || 0,
        indexedAt: postData.indexedAt || indexedAt || item.indexedAt,
      },
      uniqueKey: postData.uri || item.uri,
      moderationDecision: postData.moderationDecision,
    }]);
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
  }, [navigation, author, indexedAt, item]);

  const handlePress = async () => {
    if (!isPostAction) {
      if (author?.handle) navigateToProfile(author.handle);
      return;
    }

    const postUri = getPostUri(item);
    if (!postUri) {
      if (author?.handle) navigateToProfile(author.handle);
      return;
    }

    try {
      let finalPostData = postData;
      if (!finalPostData && reason !== 'subscribed-post') {
        finalPostData = await AtprotoService.getPost(postUri);
      }
      
      if (!finalPostData) {
        if (author?.handle) navigateToProfile(author.handle);
        return;
      }
      
      const finalEmbed = getEmbed(finalPostData);
      const finalKind = finalEmbed ? getPostKind(finalEmbed) : 'text';
      
      // For reply notifications, open comment section with scrollToCommentUri
      if (reason === 'reply' && uri) {
        if (finalKind === 'video') {
          navigateToVideoPost(finalPostData);
          setTimeout(() => {
            presentCommentSection({ post: finalPostData, scrollToCommentUri: uri });
          }, 500);
        } else {
          presentCommentSection({ post: finalPostData, scrollToCommentUri: uri });
        }
      } else if (finalKind === 'video') {
        navigateToVideoPost(finalPostData);
      } else {
        const { openPostInBluesky } = await import('../../../utils/blueskyLinks');
        await openPostInBluesky(postUri);
      }
    } catch (error) {
      if (author?.handle) navigateToProfile(author.handle);
    }
  };

  const handleProfilePress = useCallback(() => {
    if (author?.handle) navigateToProfile(author.handle);
  }, [author?.handle, navigateToProfile]);

  return (
    <View style={styles.notificationItem}>
      <Pressable onPress={handleProfilePress}>
        <Avatar
          uri={author?.avatar}
          type="profile"
          size={50}
          showRing={true}
          style={styles.profileImage}
        />
      </Pressable>
      <View style={styles.notificationContent}>
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
      {isPostAction && isVideo && (
        <Pressable onPress={handlePress}>
          {thumbnail ? (
            <Image
              source={{ uri: thumbnail }}
              style={styles.thumbnailVideo}
              resizeMode="cover"
              onError={() => {
                // Silently fail - image just won't display
                if (__DEV__) {
                  console.log('Thumbnail failed to load:', thumbnail);
                }
              }}
            />
          ) : (
            <View style={styles.thumbnailVideo} />
          )}
        </Pressable>
      )}
    </View>
  );
};

const NotificationsTab = forwardRef<ScrollToTopRef>((props, ref) => {
  const flashListRef = useRef<FlashListRef<any>>(null);

  // Expose scrollToTop method
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      flashListRef.current?.scrollToTop({ animated: true });
    },
  }), []);
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Get current user from store instead of API call
  const currentUser = useUserStore(state => state.currentUser);
  
  // Initialize current user for ProfileCache on mount - use store instead of API call
  useEffect(() => {
    if (currentUser?.did && currentUser?.handle) {
      ProfileCache.setCurrentUserHandle(currentUser.handle);
    }
  }, [currentUser?.did, currentUser?.handle]);

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

  // Extract unique post URIs that need to be fetched
  // Only fetch video posts (for thumbnails)
  // Based on API structure:
  // - reply: fetch to check if root post is a video (can't determine from notification data)
  // - like/repost: fetch to check if post is a video (post field doesn't exist)
  // - subscribed-post: fetch only if video without thumbnail (record has post data)
  // - quote/mention: fetch only if video without thumbnail (post field exists)
  const postUrisToFetch = useMemo(() => {
    const uris = new Set<string>();
    for (const notification of notifications) {
      const isPostAction = ['like', 'repost', 'reply', 'quote', 'mention', 'post', 'subscribed-post'].includes(notification.reason);
      if (!isPostAction) continue;
      
      const postUri = getPostUri(notification);
      if (!postUri) continue;
      
      // Reply notifications: fetch to check if root post is a video
      // (We need the post data to determine if it's a video since notification has no post field)
      if (notification.reason === 'reply') {
        uris.add(postUri);
        continue;
      }
      
      // Like/repost notifications: fetch to check if post is a video
      // (post field doesn't exist, so we need to fetch to determine if it's a video)
      if (notification.reason === 'like' || notification.reason === 'repost') {
        uris.add(postUri);
        continue;
      }
      
      // Subscribed-post: fetch only if video without thumbnail
      if (notification.reason === 'subscribed-post') {
        const embed = notification.record?.embed;
        const kind = embed ? getPostKind(embed) : 'text';
        if (kind === 'video') {
          const thumbnail = embed ? getThumbnailByKind(embed, kind) : null;
          if (!thumbnail) {
            uris.add(postUri);
          }
        }
        continue;
      }
      
      // Other notifications (quote/mention): fetch only if video without thumbnail (post field exists)
      if (notification.post) {
        const embed = notification.post?.embed;
        const kind = embed ? getPostKind(embed) : 'text';
        if (kind === 'video') {
          const thumbnail = embed ? getThumbnailByKind(embed, kind) : null;
          if (!thumbnail) {
            uris.add(postUri);
          }
        }
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

  const keyExtractor = useCallback((item: any) => {
    return item.uri || `notification-${item.indexedAt || Math.random()}`;
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

  if (isLoading && notifications.length === 0) {
    return (
      <View style={styles.listContainer}>
        <NotificationLoading />
      </View>
    );
  }

  return (
    <FlashList
      ref={flashListRef}
      style={styles.listContainer}
      contentContainerStyle={{
        paddingHorizontal: 15,
        paddingBottom: bottomNavBarHeight + 5,
      }}
      data={notifications}
      renderItem={renderNotificationContent}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={NotificationDivider}
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
});

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
    marginBottom: 16,
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
});


