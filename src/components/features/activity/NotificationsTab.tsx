import React, { useCallback, useMemo, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { LegendList, LegendListRef } from '@legendapp/list';
import type { ScrollToTopRef } from '../../../utils/tabRefs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import { useRouter, useFocusEffect } from 'expo-router';
import { useInfiniteQuery, useQueryClient, useQuery } from '@tanstack/react-query';

import ProfileCache, { profileKeys, prepopulateProfileCache } from '../../../services/cache/ProfileCache';
import { Avatar, Colors } from '../../../components/ui/UI';
import { Loading3FillIcon } from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight, formatHandle } from '../../../utils/helpers';
import { feedService } from '../../../services/FeedService';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { extractVideoThumbnail } from '../../../utils/helpers/video';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useUserStore } from '../../../stores/userStore';
import BlurredThumbnailBackground from '../../ui/BlurredThumbnailBackground';

// Import radar.gif for empty notifications state
const RadarGif = require('../../../assets/radar.gif');

// Custom empty state for notifications
const EmptyNotifications = () => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyContent}>
      <Image 
        source={RadarGif} 
        style={styles.radarGif} 
        contentFit="contain" 
        cachePolicy="memory-disk"
        priority="low"
        allowDownscaling={true}
      />
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

// Notification types that relate to posts (memoized for performance)
const POST_ACTION_TYPES = ['like', 'repost', 'like-via-repost', 'repost-via-repost', 'reply', 'quote', 'mention', 'post', 'subscribed-post'] as const;

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

// Get the root post URI from any notification
// Handles all notification types uniformly by extracting the relevant URI
const getPostUri = (notification: any): string | null => {
  const { uri, post, record } = notification;
  
  // subscribed-post: uri is the post URI
  if (notification.reason === 'subscribed-post') return uri;
  
  // reply: root post is in record.reply.root.uri
  if (record?.reply?.root?.uri) return record.reply.root.uri;
  
  // like/repost/like-via-repost/repost-via-repost: subject URI (may be post or repost record)
  if (record?.subject?.uri) return record.subject.uri;
  
  // quote/mention: post field contains the post
  if (post?.uri) return post.uri;
  
  return null;
};

// Resolve a URI to the root post URI (handles repost records automatically)
const resolveRootPostUri = (uri: string, postDataMap: Map<string, any>): string | null => {
  // If it's a repost record URI, extract the root post URI from it
  if (uri.includes('app.bsky.feed.repost')) {
    const repostRecord = postDataMap.get(uri);
    return repostRecord?.record?.subject?.uri || null;
  }
  return uri;
};

// Extract post data from notification - matches Bluesky's pattern
// Uses notification.post when available (has view embeds with thumbnails)
// For subscribed-post, prefer fetched post (has view embed with thumbnails), fallback to record (raw embed)
const getPostDataFromNotification = (notification: any, postDataMap: Map<string, any>) => {
  const { post, record } = notification;
  
  // Quote/mention notifications include post data with view embeds
  if (post) return post;
  
  // For subscribed-post, prefer fetched post data (has view embed with thumbnails)
  // Fallback to record if fetch not available yet
  if (notification.reason === 'subscribed-post') {
    const postUri = getPostUri(notification);
    if (postUri) {
      const rootPostUri = resolveRootPostUri(postUri, postDataMap);
      const fetchedPost = rootPostUri ? postDataMap.get(rootPostUri) : null;
      if (fetchedPost) return fetchedPost;
    }
    // Fallback: use record (raw embed, no thumbnails)
    if (record) {
      return {
        uri: notification.uri,
        cid: notification.cid,
        author: notification.author,
        record,
        embed: record.embed,
        indexedAt: notification.indexedAt,
      };
    }
    return null;
  }
  
  // For others, get from fetched postDataMap
  const postUri = getPostUri(notification);
  if (!postUri) return null;
  const rootPostUri = resolveRootPostUri(postUri, postDataMap);
  return rootPostUri ? postDataMap.get(rootPostUri) : null;
};

// Check if post is deleted using $type field (matches official Bluesky app)
const isPostDeleted = (postData: any): boolean => {
  if (!postData) return true;
  return AtprotoService.isNotFoundPost(postData);
};

// Fetch post data, handling repost records
const fetchPostData = async (postUri: string, existingPostData: any, postDataMap: Map<string, any>): Promise<{ postData: any; rootPostUri: string } | null> => {
  if (existingPostData) {
    const rootPostUri = resolveRootPostUri(postUri, postDataMap) || postUri;
    return { postData: existingPostData, rootPostUri };
  }

  let rootPostUri = resolveRootPostUri(postUri, postDataMap) || postUri;
  
  // If postUri is a repost record, fetch it first to get root post URI
  if (postUri.includes('app.bsky.feed.repost')) {
    try {
      const apiClient = await AtprotoService.getApiClient();
      if (apiClient) {
        const { api } = apiClient;
        const uriMatch = postUri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.repost\/(.+)/);
        if (uriMatch) {
          const repostRecord = await api.com.atproto.repo.getRecord({
            repo: uriMatch[1],
            collection: 'app.bsky.feed.repost',
            rkey: uriMatch[2],
          });
          if (repostRecord?.data?.value?.subject?.uri) {
            rootPostUri = repostRecord.data.value.subject.uri;
            const postData = await AtprotoService.getPost(rootPostUri);
            return { postData, rootPostUri };
          }
        }
      }
    } catch {
      // Fallback: try fetching postUri directly
    }
  }
  
  const postData = await AtprotoService.getPost(postUri);
  return { postData, rootPostUri };
};

// Notification item component - memoized for performance
const NotificationItem = React.memo<{ 
  item: any; 
  navigation: any; 
  queryClient: any; 
  postDataMap: Map<string, any>;
}>(({ item, navigation, queryClient, postDataMap }) => {
  const { reason, author, indexedAt, uri } = item;
  const { presentCommentSection } = useGlobalCommentSection();
  
  // All notification types that relate to posts
  const isPostAction = POST_ACTION_TYPES.includes(reason as any);
  const postData = isPostAction ? getPostDataFromNotification(item, postDataMap) : null;
  const embed = postData ? getEmbed(postData) : null;
  const postKind = embed ? getPostKind(embed) : 'text';
  const thumbnail = embed ? getThumbnailByKind(embed, postKind) : null;
  const isVideo = postKind === 'video';
  const postTypeLabel = isVideo ? 'video' : 'post';
  
  // Check if post might be a video (for reserving space before post data loads)
  // Check notification record embed as a hint - this helps prevent layout shifts
  const mightBeVideo = isPostAction && !postData && (() => {
    const recordEmbed = item.record?.embed;
    if (!recordEmbed) return false;
    
    const embedType = recordEmbed.$type;
    // Check for video embed types
    if (embedType === 'app.bsky.embed.video' || embedType === 'app.bsky.embed.video#view') {
      return true;
    }
    // Check for recordWithMedia that might contain video
    if (embedType === 'app.bsky.embed.recordWithMedia') {
      const mediaType = recordEmbed.media?.$type;
      return mediaType === 'app.bsky.embed.video' || mediaType === 'app.bsky.embed.video#view';
    }
    return false;
  })();
  
  // Always reserve space for thumbnail if it's a post action and either:
  // 1. It's confirmed to be a video, OR
  // 2. Post data hasn't loaded yet but record embed suggests it might be a video
  const shouldShowThumbnailContainer = isPostAction && (isVideo || mightBeVideo);
  
  const actionText = useMemo(() => {
    const actions: Record<string, string> = {
      like: `liked your ${postTypeLabel}`,
      repost: `reshared your ${postTypeLabel}`,
      'like-via-repost': `liked your ${postTypeLabel}`,
      'repost-via-repost': `reshared your ${postTypeLabel}`,
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
  const navigateToProfile = useCallback((handle: string, authorData?: any) => {
    const trimmed = handle.trim();
    if (!trimmed) return;
    
    // Pre-populate cache with available author data
    if (authorData && queryClient) {
      prepopulateProfileCache(queryClient, {
        did: authorData.did,
        handle: trimmed,
        displayName: authorData.displayName,
        avatar: authorData.avatar,
      }, trimmed);
    }
    
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
      if (author?.handle) navigateToProfile(author.handle, author);
      return;
    }

    const postUri = getPostUri(item);
    if (!postUri) {
      if (author?.handle) navigateToProfile(author.handle, author);
      return;
    }

    try {
      const result = await fetchPostData(postUri, postData, postDataMap);
      if (!result) {
        if (author?.handle) navigateToProfile(author.handle, author);
        return;
      }
      
      const { postData: finalPostData, rootPostUri } = result;
      
      // If post is missing, navigate to profile
      if (!finalPostData) {
        if (author?.handle) navigateToProfile(author.handle, author);
        return;
      }
      
      const finalEmbed = getEmbed(finalPostData);
      const finalKind = finalEmbed ? getPostKind(finalEmbed) : 'text';
      
      // Reply notifications: open comment section
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
        await openPostInBluesky(rootPostUri);
      }
    } catch {
      if (author?.handle) navigateToProfile(author.handle, author);
    }
  };

  const handleThumbnailPress = useCallback(async () => {
    if (!isPostAction) return;

    const postUri = getPostUri(item);
    if (!postUri) return;

    try {
      const result = await fetchPostData(postUri, postData, postDataMap);
      if (!result) {
        if (author?.handle) navigateToProfile(author.handle, author);
        return;
      }
      
      const { postData: finalPostData, rootPostUri } = result;
      
      // If post is missing, navigate to profile
      if (!finalPostData) {
        if (author?.handle) navigateToProfile(author.handle, author);
        return;
      }
      
      const finalEmbed = getEmbed(finalPostData);
      const finalKind = finalEmbed ? getPostKind(finalEmbed) : 'text';
      
      // Always navigate to root post (for video posts, use video feed)
      if (finalKind === 'video') {
        navigateToVideoPost(finalPostData);
      } else {
        const { openPostInBluesky } = await import('../../../utils/blueskyLinks');
        await openPostInBluesky(rootPostUri);
      }
    } catch {
      if (author?.handle) navigateToProfile(author.handle, author);
    }
  }, [isPostAction, item, postData, postDataMap, author?.handle, navigateToProfile, navigateToVideoPost]);

  const handleAvatarPress = useCallback(() => {
    if (author?.handle) navigateToProfile(author.handle);
  }, [author?.handle, navigateToProfile]);

  const handleNamePress = useCallback(() => {
    if (author?.handle) navigateToProfile(author.handle);
  }, [author?.handle, navigateToProfile]);

  return (
    <View style={styles.notificationItem}>
      <Pressable onPress={handleAvatarPress}>
        <Avatar
          uri={author?.avatar}
          type="profile"
          size={50}
          showRing={true}
          style={styles.profileImage}
        />
      </Pressable>
      <Pressable onPress={handlePress} style={styles.notificationContent}>
        <Pressable 
          onPress={handleNamePress}
          style={{flexDirection: 'row', alignItems: 'center'}}
        >
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
        </Pressable>
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
      </Pressable>
      {shouldShowThumbnailContainer && (
        <Pressable onPress={handleThumbnailPress} style={styles.thumbnailContainer}>
          {thumbnail ? (
            <>
              <BlurredThumbnailBackground thumbnailUrl={thumbnail} />
              <Image
                source={{ uri: thumbnail }}
                style={styles.thumbnailVideo}
                contentFit="contain"
                cachePolicy="memory-disk"
                onError={() => {
                  // Silently fail - image just won't display
                }}
              />
            </>
          ) : (
            <View style={styles.thumbnailPlaceholder} />
          )}
        </Pressable>
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - return true if props are equal (skip re-render)
  if (prevProps.item.uri !== nextProps.item.uri) return false;
  if (prevProps.item.indexedAt !== nextProps.item.indexedAt) return false;
  if (prevProps.postDataMap !== nextProps.postDataMap) {
    // Only re-render if postDataMap changed AND it affects this item
    const prevPostData = getPostDataFromNotification(prevProps.item, prevProps.postDataMap);
    const nextPostData = getPostDataFromNotification(nextProps.item, nextProps.postDataMap);
    if (prevPostData !== nextPostData) return false;
  }
  return true; // Props are equal, skip re-render
});

const NotificationsTab = forwardRef<ScrollToTopRef>((props, ref) => {
  const legendListRef = useRef<LegendListRef<any>>(null);

  // Expose scrollToTop method
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      legendListRef.current?.scrollToOffset({ offset: 0, animated: true });
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
  const allNotifications = useMemo(() => {
    return data?.pages.flatMap(page => page.notifications) || [];
  }, [data]);
  
  // Batch prefetch all author profiles for better performance
  useEffect(() => {
    if (allNotifications.length > 0) {
      // Extract all unique profiles from notifications and batch prefetch them
      ProfileCache.batchPrefetchFromFeed(allNotifications).catch(() => {
        // Silently fail - prefetch is not critical
      });
    }
  }, [allNotifications]);

  // Extract post URIs that need fetching - matches Bluesky's pattern
  // Quote/mention include post data with view embeds (thumbnails) - no fetch needed
  // Subscribed-post has raw embed (no thumbnails) - fetch to get view embed with thumbnails
  // Others (like/repost/reply) need fetching
  const postUrisToFetch = useMemo(() => {
    const uris = new Set<string>();
    
    for (const notification of allNotifications) {
      if (!POST_ACTION_TYPES.includes(notification.reason as any)) continue;
      
      // Quote/mention include post data with view embeds - no fetch needed
      if (notification.post) continue;
      
      const postUri = getPostUri(notification);
      if (postUri) uris.add(postUri);
    }
    
    return Array.from(uris);
  }, [allNotifications]);

  // Batch fetch all posts, automatically resolving repost records to root posts
  const { data: postDataMap = new Map() } = useQuery({
    queryKey: ['notification-posts-batch', postUrisToFetch.join(',')],
    queryFn: async () => {
      const result = new Map<string, any>();
      const repostUris: string[] = [];
      const postUris: string[] = [];
      
      // Separate repost records from regular posts
      for (const uri of postUrisToFetch) {
        if (uri.includes('app.bsky.feed.repost')) {
          repostUris.push(uri);
        } else {
          postUris.push(uri);
        }
      }
      
      // Fetch regular posts
      if (postUris.length > 0) {
        const posts = await AtprotoService.getPosts(postUris);
        posts.forEach((post, uri) => result.set(uri, post));
      }
      
      // Fetch repost records and resolve to root posts
      if (repostUris.length > 0) {
        try {
          const apiClient = await AtprotoService.getApiClient();
          if (!apiClient) return result;
          
          const { api } = apiClient;
          const rootPostUris: string[] = [];
          
          for (const repostUri of repostUris) {
            try {
              const uriMatch = repostUri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.repost\/(.+)/);
              if (!uriMatch) continue;
              
              const repostRecord = await api.com.atproto.repo.getRecord({
                repo: uriMatch[1],
                collection: 'app.bsky.feed.repost',
                rkey: uriMatch[2],
              });
              
              result.set(repostUri, {
                record: repostRecord.data.value,
                uri: repostUri,
              });
              
              if (repostRecord?.data?.value?.subject?.uri) {
                rootPostUris.push(repostRecord.data.value.subject.uri);
              }
            } catch (error) {
              // Silently fail for individual repost records
            }
          }
          
          // Fetch root posts
          if (rootPostUris.length > 0) {
            const rootPosts = await AtprotoService.getPosts(rootPostUris);
            rootPosts.forEach((post, uri) => result.set(uri, post));
          }
        } catch (error) {
          // Silently fail
        }
      }
      
      return result;
    },
    enabled: postUrisToFetch.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Filter out notifications about deleted posts - use stable reference
  const notifications = useMemo(() => {
    if (postDataMap.size === 0) {
      // If postDataMap is empty, return all notifications (posts haven't loaded yet)
      return allNotifications;
    }
    
    return allNotifications.filter(notification => {
      const isPostAction = POST_ACTION_TYPES.includes(notification.reason as any);
      if (!isPostAction) return true; // Keep non-post notifications
      
      const postData = getPostDataFromNotification(notification, postDataMap);
      // Filter out if post is deleted
      return !isPostDeleted(postData);
    });
  }, [allNotifications, postDataMap]);

  // Use stable reference for postDataMap to prevent unnecessary re-renders
  const postDataMapRef = useRef(postDataMap);
  useEffect(() => {
    postDataMapRef.current = postDataMap;
  }, [postDataMap]);

  const renderNotificationContent = useCallback(({ item }: { item: any }) => {
    return (
      <NotificationItem 
        item={item} 
        navigation={navigation} 
        queryClient={queryClient}
        postDataMap={postDataMapRef.current}
      />
    );
  }, [navigation, queryClient]);

  const keyExtractor = useCallback((item: any) => {
    return item.uri || `notification-${item.indexedAt || Math.random()}`;
  }, []);

  // Get item type for better recycling optimization - optimized to check record embed first
  const getItemType = useCallback((item: any): string => {
    const isPostAction = POST_ACTION_TYPES.includes(item.reason as any);
    if (!isPostAction) return 'non-post';
    
    // Check record embed first (faster, no map lookup needed)
    const recordEmbed = item.record?.embed;
    if (recordEmbed) {
      const embedType = recordEmbed.$type;
      if (embedType === 'app.bsky.embed.video' || embedType === 'app.bsky.embed.video#view') {
        return 'post-video';
      }
      if (embedType === 'app.bsky.embed.recordWithMedia') {
        const mediaType = recordEmbed.media?.$type;
        if (mediaType === 'app.bsky.embed.video' || mediaType === 'app.bsky.embed.video#view') {
          return 'post-video';
        }
      }
    }
    
    // Fallback to post data if available
    const postData = getPostDataFromNotification(item, postDataMap);
    if (postData) {
      const embed = getEmbed(postData);
      const postKind = embed ? getPostKind(embed) : 'text';
      return postKind === 'video' ? 'post-video' : 'post-text';
    }
    
    return 'post-loading';
  }, [postDataMap]);

  // Estimate item size for better initial rendering - optimized to check record embed first
  const getEstimatedItemSize = useCallback((index: number, item: any): number => {
    // Base size: padding (24px) + avatar (50px) + text content (~40px) = ~114px
    const baseSize = 114;
    
    // Check if item has video thumbnail - use record embed first (faster, no map lookup)
    const isPostAction = POST_ACTION_TYPES.includes(item.reason as any);
    
    if (isPostAction) {
      // Check record embed first (no map lookup needed, faster)
      const recordEmbed = item.record?.embed;
      if (recordEmbed) {
        const embedType = recordEmbed.$type;
        if (embedType === 'app.bsky.embed.video' || embedType === 'app.bsky.embed.video#view') {
          return baseSize + 80;
        }
        if (embedType === 'app.bsky.embed.recordWithMedia') {
          const mediaType = recordEmbed.media?.$type;
          if (mediaType === 'app.bsky.embed.video' || mediaType === 'app.bsky.embed.video#view') {
            return baseSize + 80;
          }
        }
      }
      
      // Fallback to post data if available
      const postData = getPostDataFromNotification(item, postDataMap);
      if (postData) {
        const embed = getEmbed(postData);
        const postKind = embed ? getPostKind(embed) : 'text';
        if (postKind === 'video') {
          return baseSize + 80;
        }
      }
    }
    
    return baseSize;
  }, [postDataMap]);

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <EmptyFeed 
          type="no-connection" 
          message="can't connect to notifications"
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
    <LegendList
      ref={legendListRef}
      style={styles.listContainer}
      contentContainerStyle={{
        paddingHorizontal: 15,
        paddingBottom: bottomNavBarHeight + 5,
      }}
      data={notifications}
      renderItem={renderNotificationContent}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={NotificationDivider}
      recycleItems={true}
      getItemType={getItemType}
      getEstimatedItemSize={getEstimatedItemSize}
      extraData={notifications.length}
      drawDistance={200}
      initialContainerPoolRatio={4}
      estimatedItemSize={130}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={async () => {
            try {
              await refetch();
            } catch {
              // Silently fail - error is handled by React Query
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
  thumbnailContainer: {
    position: 'relative',
    width: 45,
    height: 80, // 9:16 aspect ratio (45/80 = 0.5625)
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    backgroundColor: Colors.darkGray,
  },
  thumbnailVideo: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
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


