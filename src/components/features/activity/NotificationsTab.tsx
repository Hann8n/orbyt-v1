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

import ProfileService, { prefetchProfile, useProfile } from '../../../services/data/ProfileService';
import { Avatar, Colors } from '../../../components/ui/UI';
import { Loading3FillIcon } from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight } from '../../../utils/device/screen';
import { formatHandle } from '../../../utils/formatting/handles';
import { feedService } from '../../../services/FeedService';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useUserStore } from '../../../stores/userStore';
import BlurredThumbnailBackground from '../../ui/BlurredThumbnailBackground';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useModerationSettings } from '../../../hooks/useModerationSettings';
import { computeModerationDecision } from '../../../utils/moderation/computeDecision';
import type { ModerationSettings } from '../../../services/moderation/ModerationTypes';
import type {
  Notification,
  NotificationReason,
  PostView,
  ExtendedFeedViewPost,
  RecordWithMediaView,
  ProfileView,
  PostRecord,
} from '../../../services/api/types';
import { isVideoEmbed, isVideoEmbedInMedia } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import type { Record as RepostRecord } from '@atproto/api/dist/client/types/app/bsky/feed/repost';
import { isNotFoundPost, isBlockedPost } from '@atproto/api/dist/client/types/app/bsky/feed/defs';

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

// Notification types that relate to posts
// Using Notification.reason type directly from API
type PostActionReason = Extract<
  Notification['reason'],
  | 'like'
  | 'repost'
  | 'like-via-repost'
  | 'repost-via-repost'
  | 'reply'
  | 'quote'
  | 'mention'
  | 'subscribed-post'
>;

const POST_ACTION_TYPES: readonly PostActionReason[] = [
  'like',
  'repost',
  'like-via-repost',
  'repost-via-repost',
  'reply',
  'quote',
  'mention',
  'subscribed-post',
] as const;

// Type alias for post data map - uses API types directly
// Matches AtprotoService.getPosts() return type
type PostDataMap = Map<string, PostView>;

// Helper to get embed from post data - uses API types directly
const getEmbed = (postData: PostView | null | undefined): PostView['embed'] | undefined => {
  if (!postData) return undefined;
  if ('embed' in postData && postData.embed) return postData.embed;
  return undefined;
};

// Determine post kind from embed
const getPostKind = (embed: PostView['embed'] | null | undefined): PostKind => {
  if (!embed || typeof embed !== 'object') return 'text';

  // Use type guards for video embeds
  if (isVideoEmbed(embed) || isVideoEmbedInMedia(embed)) {
    return 'video';
  }

  const type = embed.$type;

  if (type === 'app.bsky.embed.recordWithMedia#view') {
    const recordWithMedia = embed as RecordWithMediaView;
    const mediaType = recordWithMedia.media?.$type;
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

// Helper to construct a PostView-like object from notification/post data for moderation
// Uses API types directly - Notification.post is typed as PostView in the API
const getPostViewForModeration = (
  notification: Notification,
  postData: PostView | null | undefined
): PostView | null => {
  // Prefer fetched post data (has view embed with thumbnails)
  if (postData) {
    return postData;
  }

  // Construct minimal PostView from notification record
  // Note: notification.record may not have all PostView fields, but we use what's available
  if ('record' in notification && notification.record && typeof notification.record === 'object') {
    const record = notification.record as PostRecord & {
      embed?: PostView['embed'];
    };
    // Convert ProfileView to ProfileViewBasic (extract only basic fields)
    const authorBasic = {
      did: notification.author.did,
      handle: notification.author.handle,
      displayName: notification.author.displayName,
      avatar: notification.author.avatar,
      $type: notification.author.$type,
    };
    // Construct PostView with all required fields
    const postView: PostView = {
      uri: notification.uri,
      cid: notification.cid,
      author: authorBasic as PostView['author'],
      record: record as PostView['record'],
      embed: record.embed,
      indexedAt: notification.indexedAt,
      labels: notification.labels,
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
    };
    return postView;
  }

  return null;
};

// Get the root post URI from any notification
const getPostUri = (notification: Notification): string | null => {
  const uri = notification.uri;
  const record = notification.record;

  // subscribed-post: uri is the post URI
  if (notification.reason === 'subscribed-post') return uri || null;

  // reply: root post is in record.reply.root.uri
  if (record && typeof record === 'object' && 'reply' in record) {
    const postRecord = record as PostRecord & {
      reply?: { root?: { uri?: string } };
    };
    if (postRecord.reply?.root?.uri) return postRecord.reply.root.uri;
  }

  // like/repost/like-via-repost/repost-via-repost: subject URI
  if (record && typeof record === 'object' && 'subject' in record) {
    const repostRecord = record as RepostRecord;
    if (repostRecord.subject?.uri) return repostRecord.subject.uri;
  }

  return null;
};

// Extract post data from notification - uses API types directly
const getPostDataFromNotification = (
  notification: Notification,
  postDataMap: PostDataMap
): PostView | undefined => {
  // For subscribed-post, prefer fetched post data (has view embed with thumbnails)
  if (notification.reason === 'subscribed-post') {
    const postUri = getPostUri(notification);
    if (postUri) {
      // Try direct lookup
      const fetchedPost = postDataMap.get(postUri);
      if (fetchedPost) return fetchedPost;
    }
    // Fallback: use record (raw embed, no thumbnails)
    if (
      'record' in notification &&
      notification.record &&
      typeof notification.record === 'object'
    ) {
      const record = notification.record as PostRecord & {
        embed?: PostView['embed'];
      };
      // Convert ProfileView to ProfileViewBasic (extract only basic fields)
      const authorBasic = {
        did: notification.author.did,
        handle: notification.author.handle,
        displayName: notification.author.displayName,
        avatar: notification.author.avatar,
        $type: notification.author.$type,
      };
      // Construct PostView with all required fields
      const postView: PostView = {
        uri: notification.uri,
        cid: notification.cid,
        author: authorBasic as PostView['author'],
        record: record as PostView['record'],
        embed: record.embed,
        indexedAt: notification.indexedAt,
        replyCount: 0,
        repostCount: 0,
        likeCount: 0,
      };
      return postView;
    }
    return undefined;
  }

  // For others, get from fetched postDataMap
  const postUri = getPostUri(notification);
  if (!postUri) return undefined;
  return postDataMap.get(postUri);
};

// Fetch post data, handling repost records - uses API types directly
const fetchPostData = async (
  postUri: string,
  existingPostData: PostView | null | undefined
): Promise<{
  postData: PostView;
  rootPostUri: string;
} | null> => {
  if (existingPostData) {
    return { postData: existingPostData, rootPostUri: postUri };
  }

  let rootPostUri = postUri;

  // If postUri is a repost record, fetch it first to get root post URI
  if (postUri.includes('app.bsky.feed.repost')) {
    try {
      const apiClient = await AtprotoService.getApiClient();
      if (apiClient) {
        const { api } = apiClient;
        const uriMatch = postUri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.repost\/(.+)/);
        if (uriMatch) {
          const repostRecordResponse = await api.com.atproto.repo.getRecord({
            repo: uriMatch[1],
            collection: 'app.bsky.feed.repost',
            rkey: uriMatch[2],
          });
          const repostValue = repostRecordResponse?.data?.value as RepostRecord | undefined;
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
type NotificationItemProps = {
  item: Notification;
  navigation: ReturnType<typeof useRouter>;
  queryClient: ReturnType<typeof useQueryClient>;
  postDataMap: PostDataMap;
  moderationSettings: ModerationSettings;
};

const NotificationItem = React.memo<NotificationItemProps>(
  ({ item, navigation, queryClient, postDataMap, moderationSettings }) => {
    const { reason, author, indexedAt, uri } = item;
    const { presentCommentSection } = useGlobalCommentSection();

    // Get profile data for live status
    const { data: authorProfile } = useProfile(author?.handle);

    // All notification types that relate to posts
    const isPostAction = POST_ACTION_TYPES.includes(reason as PostActionReason);

    // Get post data - getPostDataFromNotification handles 'post' field (quote/mention) which has view embeds with thumbnails
    // For other notifications, it fetches from postDataMap
    const postData = isPostAction ? getPostDataFromNotification(item, postDataMap) : undefined;
    const embed = postData ? getEmbed(postData) : null;

    // Extract thumbnail directly from video embed - simple and direct, let expo-image handle the rest
    const videoView = embed ? getVideoView(embed) : null;
    const thumbnail = videoView?.thumbnail || null;
    const isVideo = !!videoView;
    const postTypeLabel = isVideo ? 'video' : 'post';

    // Always reserve space for thumbnail if it's a post action and it's a video
    const shouldShowThumbnailContainer = isPostAction && isVideo;

    // Compute moderation decision using proper moderation service
    const shouldBlur = useMemo(() => {
      if (!isPostAction || !moderationSettings) {
        return false;
      }

      const postViewForModeration = getPostViewForModeration(item, postData);
      if (!postViewForModeration) {
        return false;
      }

      try {
        const decision = computeModerationDecision(postViewForModeration, moderationSettings);
        return decision.blur;
      } catch {
        return false;
      }
    }, [isPostAction, moderationSettings, item, postData]);

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
      (handle: string, authorData?: ProfileView) => {
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
      (postData: PostView) => {
        const embed = getEmbed(postData);
        feedService.setCurrentFeed([
          {
            post: {
              uri: postData.uri || item.uri,
              cid: postData.cid || item.cid,
              author: postData.author || author,
              record:
                postData.record ||
                ('record' in item && item.record ? (item.record as PostView['record']) : undefined),
              embed: embed,
              replyCount: postData.replyCount || 0,
              repostCount: postData.repostCount || 0,
              likeCount: postData.likeCount || 0,
              indexedAt: postData.indexedAt || indexedAt || item.indexedAt,
            },
            uniqueKey: postData.uri || item.uri,
            // Moderation flags (shouldBlur/shouldFilter) computed at feed level if using useFeed
            // For notifications, moderation would need to be computed separately if needed
          } as ExtendedFeedViewPost,
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
        const result = await fetchPostData(postUri, postData);
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
          const commentPost: {
            uri: string;
            cid?: string;
            indexedAt?: string;
            author?: {
              did: string;
              handle: string;
              displayName?: string;
            };
          } = {
            uri: finalPostData.uri,
            cid: finalPostData.cid,
            indexedAt: finalPostData.indexedAt,
            author: finalPostData.author
              ? {
                  did: finalPostData.author.did,
                  handle: finalPostData.author.handle,
                  displayName: finalPostData.author.displayName,
                }
              : undefined,
          };
          if (finalKind === 'video') {
            navigateToVideoPost(finalPostData);
            setTimeout(() => {
              presentCommentSection({ post: commentPost, scrollToCommentUri: uri });
            }, 500);
          } else {
            presentCommentSection({ post: commentPost, scrollToCommentUri: uri });
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
        const result = await fetchPostData(postUri, postData);
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
    }, [isPostAction, item, postData, author, navigateToProfile, navigateToVideoPost]);

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
            status={authorProfile?.status}
          />
        </Pressable>
        <Pressable onPress={handlePress} style={styles.notificationContent}>
          <Pressable onPress={handleNamePress} style={styles.nameRow}>
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
                  transition={200}
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
NotificationItem.displayName = 'NotificationItem';

interface NotificationsTabProps {
  filterReasons?: NotificationReason[];
}

const NotificationsTab = forwardRef<ScrollToTopRef, NotificationsTabProps>(
  ({ filterReasons }, ref) => {
    const legendListRef = useRef<LegendListRef>(null);

    // Expose scrollToTop method
    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => {
          // LegendList uses scrollToOffset (compatible with FlatList/FlashList API)
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

    // Get moderation settings for computing decisions
    const { settings: moderationSettings } = useModerationSettings(currentUser?.did ?? undefined);

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
    // Include filterReasons in query key so it refetches when filter changes
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
      queryKey: queryKeys.notifications.list(filterReasons),
      queryFn: async ({ pageParam }) => {
        const response = await AtprotoService.listNotifications(
          pageParam as string | null,
          50,
          filterReasons
        );
        return response;
      },
      initialPageParam: null as string | null,
      getNextPageParam: lastPage => lastPage.cursor,
      staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM, // 1 minute - for moderately changing data
      gcTime: 60 * 60 * 1000, // 60 minutes - increased to prevent aggressive cache clearing, matches feed components
      // Prevent automatic refetches that could clear data - let LegendList handle recycling
      refetchOnWindowFocus: false,
      refetchOnMount: true, // Allow refresh on mount since placeholderData prevents disappearing items
      refetchOnReconnect: false,
      // Use placeholderData to maintain previous data during refetch - prevents items from disappearing
      placeholderData: previousData => previousData,
    });

    // Flatten notifications from all pages
    const allNotifications = useMemo(() => {
      return data?.pages.flatMap(page => page.notifications) || [];
    }, [data]);

    // Batch prefetch all author profiles for better performance
    useEffect(() => {
      if (allNotifications.length > 0) {
        // Extract all unique handles from notifications and batch prefetch them
        const uniqueHandles = new Set<string>();
        allNotifications.forEach(notification => {
          if (notification.author?.handle) {
            uniqueHandles.add(notification.author.handle.toLowerCase());
          }
        });
        const handlesToPrefetch = Array.from(uniqueHandles).filter(
          handle => handle && handle.trim() !== ''
        );
        if (handlesToPrefetch.length > 0) {
          ProfileService.batchGetProfiles(handlesToPrefetch).catch(() => {
            // Silently fail - prefetch is not critical
          });
        }
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

        const postUri = getPostUri(notification);
        if (postUri) uris.add(postUri);
      }

      return Array.from(uris);
    }, [allNotifications]);

    // Batch fetch all posts, automatically resolving repost records to root posts
    const { data: postDataMap = new Map() } = useQuery<PostDataMap>({
      queryKey: ['notification-posts-batch', postUrisToFetch.sort().join(',')],
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

        // Fetch regular posts - AtprotoService.getPosts returns Map<string, PostView | NotFoundPost | BlockedPost>
        // We filter to only include PostView (skip NotFoundPost and BlockedPost)
        if (postUris.length > 0) {
          const posts = await AtprotoService.getPosts(postUris);
          posts.forEach((post, uri) => {
            // Only include valid PostView (exclude NotFoundPost and BlockedPost)
            if (
              post &&
              !isNotFoundPost(post) &&
              !isBlockedPost(post) &&
              'author' in post &&
              'cid' in post
            ) {
              // TypeScript now knows post is PostView after type guards and property checks
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
            const repostToRootMap = new Map<string, string>();

            for (const repostUri of repostUris) {
              try {
                const uriMatch = repostUri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.repost\/(.+)/);
                if (!uriMatch) continue;

                const repostRecordResponse = await api.com.atproto.repo.getRecord({
                  repo: uriMatch[1],
                  collection: 'app.bsky.feed.repost',
                  rkey: uriMatch[2],
                });

                const repostValue = repostRecordResponse?.data?.value as RepostRecord | undefined;

                if (repostValue?.subject?.uri) {
                  rootPostUris.push(repostValue.subject.uri);
                  repostToRootMap.set(repostUri, repostValue.subject.uri);
                }
              } catch {
                // Silently fail for individual repost records
              }
            }

            // Fetch root posts - filter to only include PostView
            if (rootPostUris.length > 0) {
              const rootPosts = await AtprotoService.getPosts(rootPostUris);
              rootPosts.forEach((post, uri) => {
                // Only include valid PostView (exclude NotFoundPost and BlockedPost)
                if (
                  post &&
                  !isNotFoundPost(post) &&
                  !isBlockedPost(post) &&
                  'author' in post &&
                  'cid' in post
                ) {
                  // TypeScript now knows post is PostView after type guards and property checks
                  const postView = post as PostView;
                  // Store root post with its URI
                  result.set(uri, postView);
                  // Also store with repost URI as key for direct lookup
                  for (const [repostUri, rootUri] of repostToRootMap.entries()) {
                    if (rootUri === uri) {
                      result.set(repostUri, postView);
                    }
                  }
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

    // Memoized callback for loading more notifications - prevents unnecessary re-renders
    const handleLoadMore = useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const renderNotificationContent = useCallback(
      ({ item }: { item: Notification }) => {
        return (
          <NotificationItem
            item={item}
            navigation={navigation}
            queryClient={queryClient}
            postDataMap={postDataMap}
            moderationSettings={moderationSettings}
          />
        );
      },
      [navigation, queryClient, moderationSettings, postDataMap]
    );

    const keyExtractor = useCallback((item: Notification) => {
      return item.uri || `notification-${item.indexedAt || Math.random()}`;
    }, []);

    // Get item type for better recycling optimization - only uses synchronous data
    const getItemType = useCallback((item: Notification): string => {
      const isPostAction = POST_ACTION_TYPES.includes(item.reason as PostActionReason);
      if (!isPostAction) return 'non-post';

      // Check record embed (synchronous, always available)
      if (
        'record' in item &&
        item.record &&
        typeof item.record === 'object' &&
        'embed' in item.record
      ) {
        const recordEmbed =
          'record' in item &&
          item.record &&
          typeof item.record === 'object' &&
          'embed' in item.record
            ? (item.record as { embed?: PostView['embed'] }).embed
            : undefined;
        if (recordEmbed && typeof recordEmbed === 'object') {
          // Use type guards for video embeds
          if (isVideoEmbed(recordEmbed) || isVideoEmbedInMedia(recordEmbed)) {
            return 'post-video';
          }
        }
      }

      return 'post-text'; // Default for post actions
    }, []);

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

    if (isLoading && allNotifications.length === 0) {
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
        contentContainerStyle={[
          styles.listContentContainer,
          { paddingBottom: bottomNavBarHeight + 5 },
        ]}
        data={allNotifications}
        renderItem={renderNotificationContent}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={NotificationDivider}
        recycleItems={true}
        getItemType={getItemType}
        drawDistance={250}
        initialContainerPoolRatio={6}
        estimatedItemSize={114}
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
        onEndReached={handleLoadMore}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        maintainVisibleContentPosition={true}
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
  }
);
NotificationsTab.displayName = 'NotificationsTab';

export default NotificationsTab;

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  listContentContainer: {
    paddingHorizontal: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
