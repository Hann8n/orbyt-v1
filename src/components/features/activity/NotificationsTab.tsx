import React, {
  useCallback,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LegendList, LegendListRef } from '@legendapp/list';
import type { ScrollToTopRef } from '../../../utils/navigation/tabRefs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import { useRouter, useFocusEffect } from 'expo-router';
import { useInfiniteQuery, useQueryClient, useQuery } from '@tanstack/react-query';

import ProfileService, { prefetchProfile } from '../../../services/data/ProfileService';
import { Avatar, Colors } from '../../../components/ui/UI';
import { Loading3FillIcon } from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight } from '../../../utils/device/screen';
import { formatHandle } from '../../../utils/formatting/handles';
import { feedService } from '../../../services/FeedService';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { extractVideoThumbnail } from '../../../utils/video/helpers';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useUserStore } from '../../../stores/userStore';
import BlurredThumbnailBackground from '../../ui/BlurredThumbnailBackground';
import { queryKeys } from '../../../utils/query/queryKeys';
import type {
  Notification,
  PostView,
  ExtendedPostView,
  ExtendedFeedViewPost,
  VideoView,
  RecordWithMediaView,
} from '../../../services/api/types';
import type { FeedItemWithModeration } from '../../../services/api/types';

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
const NotificationDivider = () => <View style={styles.divider} />;

// Post kind type
type PostKind = 'video' | 'image' | 'external' | 'record' | 'text';

// Post action notification reasons
type PostActionReason =
  | 'like'
  | 'repost'
  | 'like-via-repost'
  | 'repost-via-repost'
  | 'reply'
  | 'quote'
  | 'mention'
  | 'post'
  | 'subscribed-post';

// Notification types that relate to posts
const POST_ACTION_TYPES: readonly PostActionReason[] = [
  'like',
  'repost',
  'like-via-repost',
  'repost-via-repost',
  'reply',
  'quote',
  'mention',
  'post',
  'subscribed-post',
] as const;

// Type alias for post data map
type PostDataMap = Map<string, PostView | ExtendedPostView | ExtendedFeedViewPost>;

// Helper to get embed from post data
const getEmbed = (
  postData: PostView | ExtendedPostView | ExtendedFeedViewPost | null | undefined
): PostView['embed'] | undefined => {
  if (!postData) return undefined;
  if ('embed' in postData && postData.embed) return postData.embed;
  return undefined;
};

// Determine post kind from embed
const getPostKind = (embed: PostView['embed'] | null | undefined): PostKind => {
  if (!embed || typeof embed !== 'object') return 'text';

  const type = embed.$type;

  if (type === 'app.bsky.embed.video' || type === 'app.bsky.embed.video#view') {
    return 'video';
  }

  if (type === 'app.bsky.embed.recordWithMedia#view') {
    const recordWithMedia = embed as RecordWithMediaView;
    const mediaType = recordWithMedia.media?.$type;
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
const getThumbnailByKind = (
  embed: PostView['embed'] | null | undefined,
  kind: PostKind
): string | null => {
  if (!embed || typeof embed !== 'object') return null;
  if (kind !== 'video') return null;

  if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
    const videoEmbed = embed as VideoView;
    return videoEmbed.thumbnail || extractVideoThumbnail(embed) || null;
  }
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    const recordWithMedia = embed as RecordWithMediaView;
    const mediaEmbed = recordWithMedia.media;
    if (mediaEmbed && 'thumbnail' in mediaEmbed) {
      return (mediaEmbed as VideoView).thumbnail || extractVideoThumbnail(embed) || null;
    }
  }

  return null;
};

// Efficiently check if thumbnail should be blurred based on labels from API data
// Checks labels directly from notification/post data without calling moderation service
const shouldBlurThumbnail = (
  notification: Notification,
  postData: PostView | ExtendedPostView | ExtendedFeedViewPost | null | undefined
): boolean => {
  // Labels that blur media (based on LabelValueDefinition.blurs: 'media')
  const mediaBlurLabels = ['porn', 'sexual', 'nudity', 'nsfl', 'gore'];

  // Helper to extract label values from labels array
  const getLabelValues = (labels: unknown): string[] => {
    if (!labels || !Array.isArray(labels)) return [];
    return labels
      .map(label => {
        if (typeof label === 'string') return label.toLowerCase();
        if (
          label &&
          typeof label === 'object' &&
          label !== null &&
          'val' in label &&
          typeof label.val === 'string'
        ) {
          return label.val.toLowerCase();
        }
        return null;
      })
      .filter((val): val is string => val !== null);
  };

  // Check labels from post data (for quote/mention notifications or fetched posts)
  if (postData && typeof postData === 'object' && postData !== null && 'labels' in postData) {
    const labelValues = getLabelValues(postData.labels);
    if (labelValues.some(val => mediaBlurLabels.some(blurLabel => val.includes(blurLabel)))) {
      return true;
    }
  }

  // Check labels from notification.post (for quote/mention notifications)
  if (
    'post' in notification &&
    notification.post &&
    typeof notification.post === 'object' &&
    notification.post !== null &&
    'labels' in notification.post
  ) {
    const labelValues = getLabelValues(notification.post.labels);
    if (labelValues.some(val => mediaBlurLabels.some(blurLabel => val.includes(blurLabel)))) {
      return true;
    }
  }

  // Check labels from notification itself
  if (notification.labels) {
    const labelValues = getLabelValues(notification.labels);
    if (labelValues.some(val => mediaBlurLabels.some(blurLabel => val.includes(blurLabel)))) {
      return true;
    }
  }

  return false;
};

// Get the root post URI from any notification
const getPostUri = (notification: Notification): string | null => {
  const uri = 'uri' in notification ? notification.uri : undefined;
  const post = 'post' in notification ? notification.post : undefined;
  const record = 'record' in notification ? notification.record : undefined;

  // subscribed-post: uri is the post URI
  if (notification.reason === 'subscribed-post') return uri || null;

  // reply: root post is in record.reply.root.uri
  if (record && typeof record === 'object' && 'reply' in record) {
    const reply = (record as { reply?: { root?: { uri?: string } } }).reply;
    if (reply?.root?.uri) return reply.root.uri;
  }

  // like/repost/like-via-repost/repost-via-repost: subject URI
  if (record && typeof record === 'object' && 'subject' in record) {
    const subject = (record as { subject?: { uri?: string } }).subject;
    if (subject?.uri) return subject.uri;
  }

  // quote/mention: post field contains the post
  if (post && typeof post === 'object' && 'uri' in post) {
    return (post as PostView).uri;
  }

  return null;
};

// Resolve a URI to the root post URI (handles repost records automatically)
const resolveRootPostUri = (uri: string): string | null => {
  // If it's a repost record URI, we can't resolve it from PostView alone
  // The actual resolution happens in fetchPostData by fetching the record
  if (uri.includes('app.bsky.feed.repost')) {
    return null; // Will be resolved in fetchPostData
  }
  return uri;
};

// Extract post data from notification
const getPostDataFromNotification = (
  notification: Notification,
  postDataMap: PostDataMap
): PostView | ExtendedPostView | ExtendedFeedViewPost | null => {
  // Quote/mention notifications include post data with view embeds
  if ('post' in notification && notification.post) {
    return notification.post as PostView;
  }

  // For subscribed-post, prefer fetched post data (has view embed with thumbnails)
  if (notification.reason === 'subscribed-post') {
    const postUri = getPostUri(notification);
    if (postUri) {
      const rootPostUri = resolveRootPostUri(postUri);
      const fetchedPost = rootPostUri ? postDataMap.get(rootPostUri) : null;
      if (fetchedPost) return fetchedPost;
    }
    // Fallback: use record (raw embed, no thumbnails)
    if ('record' in notification && notification.record) {
      return {
        uri: notification.uri,
        cid: notification.cid,
        author: notification.author,
        record: notification.record as PostView['record'],
        embed: ('embed' in notification.record ? notification.record.embed : undefined) as
          | PostView['embed']
          | undefined,
        indexedAt: notification.indexedAt,
      } as PostView;
    }
    return null;
  }

  // For others, get from fetched postDataMap
  const postUri = getPostUri(notification);
  if (!postUri) return null;
  const rootPostUri = resolveRootPostUri(postUri);
  return rootPostUri ? (postDataMap.get(rootPostUri) ?? null) : null;
};

// Fetch post data, handling repost records
const fetchPostData = async (
  postUri: string,
  existingPostData: PostView | ExtendedPostView | ExtendedFeedViewPost | null | undefined,
  _postDataMap: PostDataMap
): Promise<{
  postData: PostView | ExtendedPostView | ExtendedFeedViewPost;
  rootPostUri: string;
} | null> => {
  if (existingPostData) {
    const rootPostUri = resolveRootPostUri(postUri) || postUri;
    return { postData: existingPostData, rootPostUri };
  }

  let rootPostUri = resolveRootPostUri(postUri) || postUri;

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
          const repostValue = repostRecord?.data?.value as
            | { subject?: { uri?: string } }
            | undefined;
          if (repostValue?.subject?.uri) {
            rootPostUri = repostValue.subject.uri;
            const postData = await AtprotoService.getPost(rootPostUri);
            if (postData) {
              return { postData, rootPostUri };
            }
          }
        }
      }
    } catch {
      // Fallback: try fetching postUri directly
    }
  }

  const postData = await AtprotoService.getPost(postUri);
  if (!postData) return null;
  return { postData, rootPostUri };
};

// Notification item component - memoized for performance
const NotificationItem = React.memo<{
  item: Notification;
  navigation: ReturnType<typeof useRouter>;
  queryClient: ReturnType<typeof useQueryClient>;
  postDataMap: PostDataMap;
}>(
  ({ item, navigation, queryClient, postDataMap }) => {
    const { reason, author, indexedAt, uri } = item;
    const { presentCommentSection } = useGlobalCommentSection();

    // All notification types that relate to posts
    const isPostAction = POST_ACTION_TYPES.includes(reason as PostActionReason);
    const postData = isPostAction ? getPostDataFromNotification(item, postDataMap) : null;
    const embed = postData ? getEmbed(postData) : null;
    const postKind = embed ? getPostKind(embed) : 'text';

    // Extract thumbnail: prefer postData embed, fallback to notification record embed for immediate display
    let thumbnail = embed ? getThumbnailByKind(embed, postKind) : null;
    let isVideo = postKind === 'video';
    if (!thumbnail && isPostAction && !postData) {
      // Fallback: try to extract thumbnail from notification record embed
      const recordEmbed =
        'record' in item && item.record && typeof item.record === 'object' && 'embed' in item.record
          ? (item.record as { embed?: PostView['embed'] }).embed
          : undefined;
      if (recordEmbed) {
        const recordKind = getPostKind(recordEmbed);
        thumbnail = getThumbnailByKind(recordEmbed, recordKind);
        if (!isVideo) {
          isVideo = recordKind === 'video';
        }
      }
    }
    const postTypeLabel = isVideo ? 'video' : 'post';

    // Always reserve space for thumbnail if it's a post action and it's a video
    const shouldShowThumbnailContainer = isPostAction && isVideo;

    // Check if thumbnail should be blurred based on labels from API data
    const shouldBlur = shouldBlurThumbnail(item, postData);

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
    const navigateToProfile = useCallback(
      (handle: string, authorData?: { did?: string; displayName?: string; avatar?: string }) => {
        const trimmed = handle.trim();
        if (!trimmed) return;

        // Prefetch profile: sets partial data immediately + fetches full profile
        if (queryClient) {
          prefetchProfile(
            queryClient,
            trimmed,
            authorData
              ? {
                  did: authorData.did,
                  handle: trimmed,
                  displayName: authorData.displayName,
                  avatar: authorData.avatar,
                }
              : undefined
          ).finally(() => navigation.push(`/profile/${trimmed}`));
        } else {
          navigation.push(`/profile/${trimmed}`);
        }
      },
      [navigation, queryClient]
    );

    // Navigate to video post in feed
    const navigateToVideoPost = useCallback(
      (postData: PostView | ExtendedPostView | ExtendedFeedViewPost) => {
        // Handle ExtendedFeedViewPost which has post property
        const postView =
          'post' in postData
            ? (postData as ExtendedFeedViewPost).post
            : (postData as PostView | ExtendedPostView);
        const embed = getEmbed(postView);
        feedService.setCurrentFeed([
          {
            post: {
              uri: postView.uri || item.uri,
              cid: postView.cid || item.cid,
              author: postView.author || author,
              record:
                postView.record ||
                ('record' in item ? (item.record as PostView['record']) : undefined),
              embed: embed,
              replyCount: postView.replyCount || 0,
              repostCount: postView.repostCount || 0,
              likeCount: postView.likeCount || 0,
              indexedAt: postView.indexedAt || indexedAt || item.indexedAt,
            },
            uniqueKey: postView.uri || item.uri,
            moderationDecision:
              'moderationDecision' in postData
                ? (postData as FeedItemWithModeration).moderationDecision
                : undefined,
          } as FeedItemWithModeration,
        ]);
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
          },
        });
      },
      [navigation, author, indexedAt, item]
    );

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
          const { openPostInBluesky } = await import('../../../utils/links/bluesky');
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
          const { openPostInBluesky } = await import('../../../utils/links/bluesky');
          await openPostInBluesky(rootPostUri);
        }
      } catch {
        if (author?.handle) navigateToProfile(author.handle, author);
      }
    }, [
      isPostAction,
      item,
      postData,
      postDataMap,
      author?.handle,
      navigateToProfile,
      navigateToVideoPost,
    ]);

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
            size={55}
            showRing={true}
            style={styles.profileImage}
          />
        </Pressable>
        <Pressable onPress={handlePress} style={styles.notificationContent}>
          <Pressable
            onPress={handleNamePress}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={styles.authorName}>{formatHandle(author.handle) || 'Unknown user'}</Text>
            {author.handle && (
              <VerificationBadge handle={author.handle} textSize={14} textColor={Colors.white} />
            )}
          </Pressable>
          <View style={styles.actionRow}>
            <Text style={styles.actionText}>{actionText}</Text>
            {indexedAt && <Text style={styles.timeText}>{formatRelativeDate(indexedAt)}</Text>}
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
                {shouldBlur && (
                  <BlurView
                    intensity={80}
                    tint="dark"
                    style={styles.thumbnailBlurOverlay}
                    experimentalBlurMethod="dimezisBlurView"
                  />
                )}
              </>
            ) : (
              <View style={styles.thumbnailPlaceholder} />
            )}
          </Pressable>
        )}
      </View>
    );
  },
  (prevProps, nextProps) => {
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
  }
);

const NotificationsTab = forwardRef<ScrollToTopRef>((_props, ref) => {
  const legendListRef = useRef<LegendListRef>(null);

  // Expose scrollToTop method
  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        legendListRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    }),
    []
  );
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);

  // Get current user from store instead of API call
  const currentUser = useUserStore(state => state.currentUser);

  // Initialize current user for ProfileCache on mount - use store instead of API call
  useEffect(() => {
    if (currentUser?.did && currentUser?.handle) {
      ProfileService.setCurrentUserHandle(currentUser.handle);
    }
  }, [currentUser?.did, currentUser?.handle]);

  // Mark notifications as seen when the tab is focused
  useFocusEffect(
    useCallback(() => {
      // Update seen status when notifications tab is focused
      AtprotoService.updateNotificationSeen()
        .then(() => {
          // Invalidate unread count query after successfully marking as seen
          queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.count(),
            refetchType: 'active',
          });
        })
        .catch(() => {
          // Silently fail - seen status update is not critical
          // Still try to refresh the count in case it changed
          queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.count(),
            refetchType: 'active',
          });
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
    queryKey: queryKeys.notifications.list(),
    queryFn: async ({ pageParam }) => {
      const response = await AtprotoService.listNotifications(pageParam as string | null);
      return response;
    },
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.cursor,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM, // 1 minute - for moderately changing data
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
      ProfileService.batchPrefetchFromFeed(allNotifications).catch(() => {
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
      if (!POST_ACTION_TYPES.includes(notification.reason as PostActionReason)) continue;

      // Quote/mention include post data with view embeds - no fetch needed
      if ('post' in notification && notification.post) continue;

      const postUri = getPostUri(notification);
      if (postUri) uris.add(postUri);
    }

    return Array.from(uris);
  }, [allNotifications]);

  // Batch fetch all posts, automatically resolving repost records to root posts
  const { data: postDataMap = new Map() } = useQuery<PostDataMap>({
    queryKey: ['notification-posts-batch', postUrisToFetch.join(',')],
    queryFn: async () => {
      const result: PostDataMap = new Map();
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
        posts.forEach((post, uri) => {
          if (post) {
            result.set(uri, post as PostView);
          }
        });
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

              const repostValue = repostRecord?.data?.value as
                | { subject?: { uri?: string } }
                | undefined;

              result.set(repostUri, {
                record: repostRecord.data.value,
                uri: repostUri,
              } as PostView);

              if (repostValue?.subject?.uri) {
                rootPostUris.push(repostValue.subject.uri);
              }
            } catch {
              // Silently fail for individual repost records
            }
          }

          // Fetch root posts
          if (rootPostUris.length > 0) {
            const rootPosts = await AtprotoService.getPosts(rootPostUris);
            rootPosts.forEach((post, uri) => {
              if (post) {
                result.set(uri, post as PostView);
              }
            });
          }
        } catch {
          // Silently fail
        }
      }

      return result;
    },
    enabled: postUrisToFetch.length > 0,
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG, // 10 minutes - for slowly changing data
    gcTime: 10 * 60 * 1000,
  });

  // Use notifications directly from API without filtering
  const notifications = useMemo(() => {
    return allNotifications;
  }, [allNotifications]);

  // Use stable reference for postDataMap to prevent unnecessary re-renders
  const postDataMapRef = useRef(postDataMap);
  useEffect(() => {
    postDataMapRef.current = postDataMap;
  }, [postDataMap]);

  const renderNotificationContent = useCallback(
    ({ item }: { item: Notification }) => {
      return (
        <NotificationItem
          item={item}
          navigation={navigation}
          queryClient={queryClient}
          postDataMap={postDataMapRef.current}
        />
      );
    },
    [navigation, queryClient]
  );

  const keyExtractor = useCallback((item: Notification) => {
    return item.uri || `notification-${item.indexedAt || Math.random()}`;
  }, []);

  // Get item type for better recycling optimization - optimized to check record embed first
  const getItemType = useCallback(
    (item: Notification): string => {
      const isPostAction = POST_ACTION_TYPES.includes(item.reason as PostActionReason);
      if (!isPostAction) return 'non-post';

      // Check record embed first (faster, no map lookup needed)
      if (
        'record' in item &&
        item.record &&
        typeof item.record === 'object' &&
        'embed' in item.record
      ) {
        const recordEmbed = (item.record as { embed?: PostView['embed'] }).embed;
        if (recordEmbed && typeof recordEmbed === 'object') {
          const embedType = recordEmbed.$type;
          if (embedType === 'app.bsky.embed.video' || embedType === 'app.bsky.embed.video#view') {
            return 'post-video';
          }
          if (embedType === 'app.bsky.embed.recordWithMedia#view') {
            const mediaType = (recordEmbed as RecordWithMediaView).media?.$type;
            if (mediaType === 'app.bsky.embed.video' || mediaType === 'app.bsky.embed.video#view') {
              return 'post-video';
            }
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
    },
    [postDataMap]
  );

  // Estimate item size for better initial rendering - optimized to check record embed first
  const getEstimatedItemSize = useCallback(
    (_index: number, item: Notification): number => {
      // Base size: padding (24px) + avatar (50px) + text content (~40px) = ~114px
      const baseSize = 114;

      // Check if item has video thumbnail - use record embed first (faster, no map lookup)
      const isPostAction = POST_ACTION_TYPES.includes(item.reason as PostActionReason);

      if (isPostAction) {
        // Check record embed first (no map lookup needed, faster)
        if (
          'record' in item &&
          item.record &&
          typeof item.record === 'object' &&
          'embed' in item.record
        ) {
          const recordEmbed = (item.record as { embed?: PostView['embed'] }).embed;
          if (recordEmbed && typeof recordEmbed === 'object') {
            const embedType = recordEmbed.$type;
            if (embedType === 'app.bsky.embed.video' || embedType === 'app.bsky.embed.video#view') {
              return baseSize + 80;
            }
            if (embedType === 'app.bsky.embed.recordWithMedia#view') {
              const mediaType = (recordEmbed as RecordWithMediaView).media?.$type;
              if (
                mediaType === 'app.bsky.embed.video' ||
                mediaType === 'app.bsky.embed.video#view'
              ) {
                return baseSize + 80;
              }
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
    },
    [postDataMap]
  );

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
        paddingHorizontal: 10,
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
      ListEmptyComponent={!isLoading ? <EmptyNotifications /> : null}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.loadingMoreContainer}>
            <Loading3FillIcon size={24} color={Colors.white} />
          </View>
        ) : null
      }
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
    paddingVertical: 10,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.darkGray,
    marginLeft: 65, // Align with content (60px avatar + 12px margin)
    marginRight: -10, // Extend to right edge, ignoring 10px padding
  },
  profileImage: {
    width: 55,
    height: 55,
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
  thumbnailBlurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  authorName: {
    color: Colors.white,
    fontSize: 18,
    marginBottom: 2,
    fontFamily: 'Firma-Black',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  actionText: {
    color: Colors.mutedGray,
    fontSize: 16.5,
    fontFamily: 'Firma-Medium',
  },
  timeText: {
    color: Colors.gray,
    fontSize: 14,
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
    paddingHorizontal: 10,
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
