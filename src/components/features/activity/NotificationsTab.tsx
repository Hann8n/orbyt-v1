import React, { useCallback, useMemo, useEffect, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BORDER_RADIUS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Image } from 'expo-image';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { AtprotoCore } from '../../../services/api/core';
import { AtprotoFeedService } from '../../../services/api/feed/FeedService';
import { NotificationService } from '../../../services/api/notification/NotificationService';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import ProfileService, { prefetchProfile } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';
import { Avatar } from '../../../components/ui/UI';
import { VerificationBadge, BotBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { formatHandle } from '../../../utils/formatting/handles';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { useCommentSection } from '../../../stores/modalStore';
import { useUserStore } from '../../../stores/userStore';
import { queryKeys } from '../../../utils/query/queryKeys';
import { itemSizeConfig } from '@/components/ui/ItemStyles';
import { activityListSharedStyles } from './ActivityListStyles';
import {
  moderateNotification,
  moderatePost,
  AppBskyFeedDefs,
  type ModerationOpts,
  type AppBskyFeedRepost,
} from '@atproto/api';
import { buildFullHeightVideoHref } from '@/utils/navigation/feedModalRoute';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { seedFullHeightVideoFeedFromPostView } from '@/utils/chat/seedChatEmbedVideoFeed';
import { useModerationSettings } from '../../../hooks/useModerationSettings';
import { ModerationService } from '../../../services/moderation/ModerationService';
import type {
  Notification,
  PostView,
  RecordWithMediaView,
  ProfileView,
  PostRecord,
} from '../../../services/api/types';
import { AppBskyEmbedVideo, AppBskyEmbedRecordWithMedia } from '@atproto/api';
import { getVideoView } from '../../../utils/video/helpers';

// Import radar.gif for empty notifications state
const RadarGif = require('../../../assets/radar.gif');

// Custom empty state for notifications
const EmptyNotifications = ({
  messageKey = 'activity.noNotifications',
}: {
  messageKey?: string;
}) => {
  const { t } = useTranslation();
  return (
    <View style={activityListSharedStyles.emptyContainer}>
      <View style={styles.emptyContent}>
        <Image
          source={RadarGif}
          style={styles.radarGif}
          contentFit="contain"
          cachePolicy="memory-disk"
          priority="low"
          allowDownscaling={true}
        />
        <Text style={activityListSharedStyles.emptyText}>{t(messageKey)}</Text>
      </View>
    </View>
  );
};

const NotificationLoading = () => (
  <View style={activityListSharedStyles.loadingContainer}>
    <ActivityIndicator size="large" color={Colors.neutral[50]} />
  </View>
);

// Divider component for notifications
const NotificationDivider = () => <View style={activityListSharedStyles.dividerInset} />;

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

type PostDataMap = Map<string, PostView>;

const getEmbed = (postData: PostView | null | undefined): PostView['embed'] | undefined => {
  if (!postData) return undefined;
  if ('embed' in postData && postData.embed) return postData.embed;
  return undefined;
};

// Determine post kind from embed
const getPostKind = (embed: PostView['embed'] | null | undefined): PostKind => {
  if (!embed || typeof embed !== 'object') return 'text';

  // Use SDK-native type guards for video embeds
  if (AppBskyEmbedVideo.isView(embed)) {
    return 'video';
  }
  if (AppBskyEmbedRecordWithMedia.isView(embed) && AppBskyEmbedVideo.isView(embed.media)) {
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
    const repostRecord = record as AppBskyFeedRepost.Record;
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

/**
 * True when the notification's primary tap action stays inside Orbyt (profile, reply
 * comment sheet, or in-app video). Non-video post engagement opens Bluesky — excluded.
 */
function canOpenNotificationInOrbyt(notification: Notification, postDataMap: PostDataMap): boolean {
  const { reason } = notification;

  if (
    reason === 'follow' ||
    reason === 'verified' ||
    reason === 'unverified' ||
    reason === 'starterpack-joined'
  ) {
    return true;
  }

  if (reason === 'reply') {
    return true;
  }

  if (!POST_ACTION_TYPES.includes(reason as PostActionReason)) {
    return true;
  }

  const postUri = getPostUri(notification);
  if (!postUri) {
    return true;
  }

  const postData = getPostDataFromNotification(notification, postDataMap);
  if (!postData) {
    return true;
  }

  return getPostKind(getEmbed(postData)) === 'video';
}

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

  if (postUri.includes('app.bsky.feed.repost')) {
    try {
      const apiClient = await AtprotoCore.getApiClient();
      if (apiClient) {
        const { api } = apiClient;
        const uriMatch = postUri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.repost\/(.+)/);
        if (uriMatch) {
          const repostRecordResponse = await api.com.atproto.repo.getRecord({
            repo: uriMatch[1],
            collection: 'app.bsky.feed.repost',
            rkey: uriMatch[2],
          });
          const repostValue = repostRecordResponse?.data?.value as
            | AppBskyFeedRepost.Record
            | undefined;
          if (repostValue?.subject?.uri) {
            rootPostUri = repostValue.subject.uri;
            const postData = await AtprotoFeedService.getPost(rootPostUri);
            if (postData) return { postData, rootPostUri };
          }
        }
      }
    } catch {
      // fallback: fetch postUri directly
    }
  }

  const postData = await AtprotoFeedService.getPost(postUri);
  if (!postData) return null;
  return { postData, rootPostUri };
};

// Batch-fetch post data for notification list (resolves reposts to root posts)
async function fetchNotificationPostDataMap(uris: string[]): Promise<PostDataMap> {
  const result: PostDataMap = new Map();
  const repostUris: string[] = [];
  const postUris: string[] = [];

  for (const uri of uris) {
    if (uri.includes('app.bsky.feed.repost')) repostUris.push(uri);
    else postUris.push(uri);
  }

  // Run direct-post fetch and repost-record resolution in parallel; they are independent.
  const postsPromise =
    postUris.length > 0 ? AtprotoFeedService.getPosts(postUris) : Promise.resolve(null);

  const repostsPromise = (async () => {
    if (repostUris.length === 0) return null;
    try {
      const { api } = await AtprotoCore.getApiClient();

      // Fetch all repost records concurrently instead of sequentially.
      const repostRecordResults = await Promise.all(
        repostUris.map(async repostUri => {
          const uriMatch = repostUri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.repost\/(.+)/);
          if (!uriMatch) return null;
          try {
            const repostRecordResponse = await api.com.atproto.repo.getRecord({
              repo: uriMatch[1],
              collection: 'app.bsky.feed.repost',
              rkey: uriMatch[2],
            });
            const repostValue = repostRecordResponse?.data?.value as
              | AppBskyFeedRepost.Record
              | undefined;
            const subjectUri = repostValue?.subject?.uri;
            if (!subjectUri) return null;
            return { repostUri, rootUri: subjectUri };
          } catch {
            return null;
          }
        })
      );

      const repostToRootMap = new Map<string, string>();
      const rootPostUris: string[] = [];
      for (const entry of repostRecordResults) {
        if (!entry) continue;
        repostToRootMap.set(entry.repostUri, entry.rootUri);
        rootPostUris.push(entry.rootUri);
      }

      const rootPosts =
        rootPostUris.length > 0 ? await AtprotoFeedService.getPosts(rootPostUris) : null;
      return { rootPosts, repostToRootMap };
    } catch {
      return null;
    }
  })();

  const [posts, repostData] = await Promise.all([postsPromise, repostsPromise]);

  if (posts) {
    posts.forEach((post, uri) => {
      if (
        post &&
        !AppBskyFeedDefs.isNotFoundPost(post) &&
        !AppBskyFeedDefs.isBlockedPost(post) &&
        'author' in post &&
        'cid' in post
      ) {
        result.set(uri, post as PostView);
      }
    });
  }

  if (repostData?.rootPosts) {
    const { rootPosts, repostToRootMap } = repostData;
    rootPosts.forEach((post, uri) => {
      if (
        post &&
        !AppBskyFeedDefs.isNotFoundPost(post) &&
        !AppBskyFeedDefs.isBlockedPost(post) &&
        'author' in post &&
        'cid' in post
      ) {
        const postView = post as PostView;
        result.set(uri, postView);
        for (const [repostUri, rootUri] of repostToRootMap.entries()) {
          if (rootUri === uri) result.set(repostUri, postView);
        }
      }
    });
  }

  return result;
}

type EnrichedNotification = Notification & { shouldFilter?: boolean };

type NotificationItemProps = {
  item: EnrichedNotification;
  navigation: ReturnType<typeof useRouter>;
  queryClient: ReturnType<typeof useQueryClient>;
  postDataMap: PostDataMap;
  moderationOpts: ModerationOpts | null;
};

const NotificationItem = React.memo<NotificationItemProps>(
  ({ item, navigation, queryClient, postDataMap, moderationOpts }) => {
    const { t } = useTranslation();
    const { navigateToProfile: goToProfile } = useProfileChannelNavigation();
    const currentUser = useUserStore(s => s.currentUser);
    const { reason, author, indexedAt, uri } = item;
    const { presentCommentSection } = useCommentSection();
    // Notification author is ProfileView — status is already embedded by the AppView.
    const authorStatus = author?.status;
    const isPostAction = POST_ACTION_TYPES.includes(reason as PostActionReason);
    const postData = isPostAction ? getPostDataFromNotification(item, postDataMap) : undefined;
    const embed = postData ? getEmbed(postData) : null;
    const videoView = embed ? getVideoView(embed) : null;
    const thumbnail = videoView?.thumbnail || null;
    const isVideo = !!videoView;
    const postTypeLabel = isVideo ? t('activity.video') : t('activity.post');
    const shouldShowThumbnailContainer = isPostAction && isVideo;

    // moderateNotification only covers author; run moderatePost on the referenced post for thumbnail. Blur on any moderation (warn or hide).
    const mod =
      thumbnail && postData && moderationOpts ? moderatePost(postData, moderationOpts) : null;
    const cl = mod?.ui('contentList');
    const cm = mod?.ui('contentMedia');
    const shouldBlurThumbnail =
      !!thumbnail &&
      (!mod ||
        !!(cl?.blur || cm?.blur || cl?.filter || cm?.filter || cl?.noOverride || cm?.noOverride));

    const actionText = useMemo(() => {
      const actions: Record<string, string> = {
        like: t('activity.likedYourPost', { postType: postTypeLabel }),
        repost: t('activity.resharedYourPost', { postType: postTypeLabel }),
        'like-via-repost': t('activity.likedYourPost', { postType: postTypeLabel }),
        'repost-via-repost': t('activity.resharedYourPost', { postType: postTypeLabel }),
        follow: t('activity.followedYou'),
        mention: t('activity.mentionedYou'),
        reply: t('activity.leftComment'),
        quote: t('activity.quotedPost', { postType: postTypeLabel }),
        post: t('activity.createdPost', { postType: postTypeLabel }),
        'subscribed-post': t('activity.createdPost', { postType: postTypeLabel }),
        'starterpack-joined': t('activity.joinedStarterPack'),
        verified: t('activity.verifiedYou'),
        unverified: t('activity.unverifiedYou'),
      };
      return actions[reason] || t('activity.performedAction', { reason });
    }, [reason, postTypeLabel, t]);

    // Navigate to profile
    const navigateToProfile = useCallback(
      (did: string, authorData?: ProfileView) => {
        const trimmed = did.trim();
        if (!trimmed) return;

        // Prefetch profile: sets partial data immediately + fetches full profile
        if (queryClient) {
          prefetchProfile(
            queryClient,
            trimmed,
            authorData
              ? {
                  did: authorData.did,
                  handle: authorData.handle,
                  displayName: authorData.displayName,
                  avatar: authorData.avatar,
                }
              : undefined
          ).finally(() => {
            goToProfile(trimmed);
          });
        } else {
          goToProfile(trimmed);
        }
      },
      [goToProfile, queryClient]
    );

    const navigateToVideoPost = useCallback(
      (finalPostData: PostView) => {
        const postUri = finalPostData.uri || item.uri;
        if (!postUri) return;
        const ok = seedFullHeightVideoFeedFromPostView(
          finalPostData,
          postUri,
          currentUser?.did ?? undefined
        );
        if (!ok) return;
        navigation.navigate(buildFullHeightVideoHref({ postUri }, 'activity'));
      },
      [navigation, item.uri, currentUser?.did]
    );

    const handlePress = async () => {
      if (!isPostAction) {
        if (author?.did) navigateToProfile(author.did, author);
        return;
      }

      const postUri = getPostUri(item);
      if (!postUri) {
        if (author?.did) navigateToProfile(author.did, author);
        return;
      }

      try {
        const result = await fetchPostData(postUri, postData);
        if (!result) {
          if (author?.did) navigateToProfile(author.did, author);
          return;
        }

        const { postData: finalPostData, rootPostUri } = result;

        // If post is missing, navigate to profile
        if (!finalPostData) {
          if (author?.did) navigateToProfile(author.did, author);
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
          if (author?.did) navigateToProfile(author.did, author);
          return;
        }

        const { postData: finalPostData, rootPostUri } = result;

        if (!finalPostData) {
          if (author?.did) navigateToProfile(author.did, author);
          return;
        }

        const finalEmbed = getEmbed(finalPostData);
        const finalKind = finalEmbed ? getPostKind(finalEmbed) : 'text';

        if (finalKind === 'video') {
          navigateToVideoPost(finalPostData);
        } else {
          const { openPostInBluesky } = await import('../../../utils/links/bluesky');
          await openPostInBluesky(rootPostUri);
        }
      } catch {
        if (author?.did) navigateToProfile(author.did, author);
      }
    }, [isPostAction, item, postData, author, navigateToProfile, navigateToVideoPost]);

    const handleAvatarPress = useCallback(() => {
      if (author?.did) navigateToProfile(author.did, author);
    }, [navigateToProfile, author]);

    const handleNamePress = useCallback(() => {
      if (author?.did) navigateToProfile(author.did, author);
    }, [navigateToProfile, author]);

    const nameHitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

    const videoPostUri = postData?.uri?.trim() ?? '';
    const fullHeightVideoHref = videoPostUri
      ? buildFullHeightVideoHref({ postUri: videoPostUri }, 'activity')
      : null;

    const handleThumbnailApplePress = useCallback(
      (e?: { preventDefault?: () => void }) => {
        if (!postData?.uri) {
          e?.preventDefault?.();
          return;
        }
        const ok = seedFullHeightVideoFeedFromPostView(
          postData,
          postData.uri || item.uri,
          currentUser?.did ?? undefined
        );
        if (!ok) {
          e?.preventDefault?.();
        }
      },
      [postData, item.uri, currentUser?.did]
    );

    const thumbnailBody = (
      <>
        {thumbnail ? (
          <>
            {!shouldBlurThumbnail && (
              <Image
                source={{ uri: thumbnail }}
                style={styles.thumbnailVideo}
                contentFit="cover"
                recyclingKey={uri}
                transition={0}
              />
            )}
          </>
        ) : (
          <View style={styles.thumbnailPlaceholder} />
        )}
      </>
    );

    return (
      <View style={styles.notificationItem}>
        <View style={styles.notificationLeftContainer}>
          <SquircleNativePressable
            onPress={handleAvatarPress}
            style={activityListSharedStyles.profileImage}
          >
            <Avatar
              uri={author?.avatar}
              type="profile"
              size={55}
              style={activityListSharedStyles.avatarFill}
              status={authorStatus}
            />
          </SquircleNativePressable>
          <NativePressable
            onPress={handlePress}
            style={[activityListSharedStyles.mainColumn, styles.notificationContentTail]}
          >
            <View style={activityListSharedStyles.nameRow}>
              <NativePressable
                onPress={handleNamePress}
                hitSlop={nameHitSlop}
                style={activityListSharedStyles.namePressable}
              >
                <Text style={activityListSharedStyles.authorName}>
                  {formatHandle(author.handle) || t('feed.unknownUser')}
                </Text>
                {author.handle && (
                  <VerificationBadge
                    handle={author.handle}
                    textSize={itemSizeConfig.medium.badgeTextSize}
                    textColor={Colors.neutral[50]}
                  />
                )}
                {author.handle && (
                  <BotBadge
                    handle={author.handle}
                    did={author.did}
                    labels={author.labels}
                    textSize={itemSizeConfig.medium.badgeTextSize}
                    textColor={Colors.neutral[50]}
                  />
                )}
              </NativePressable>
            </View>
            <View style={activityListSharedStyles.actionRow}>
              <View style={activityListSharedStyles.actionTextAndTime}>
                <View style={activityListSharedStyles.secondaryLineWrap}>
                  <Text style={activityListSharedStyles.actionText} numberOfLines={1}>
                    {actionText}
                  </Text>
                </View>
                {indexedAt && (
                  <>
                    <Text style={activityListSharedStyles.separatorDot}>•</Text>
                    <Text style={activityListSharedStyles.timeText}>
                      {formatRelativeDate(indexedAt)}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </NativePressable>
        </View>
        {shouldShowThumbnailContainer && fullHeightVideoHref && Platform.OS === 'ios' ? (
          <Link href={fullHeightVideoHref} asChild>
            <Pressable
              onPress={handleThumbnailApplePress}
              collapsable={false}
              style={styles.thumbnailContainer}
              android_ripple={{ color: Colors.neutral[700] }}
            >
              <Link.AppleZoom>
                <View collapsable={false} style={styles.thumbnailAppleZoomInner}>
                  {thumbnailBody}
                </View>
              </Link.AppleZoom>
            </Pressable>
          </Link>
        ) : shouldShowThumbnailContainer ? (
          <SquircleNativePressable onPress={handleThumbnailPress} style={styles.thumbnailContainer}>
            {thumbnailBody}
          </SquircleNativePressable>
        ) : null}
      </View>
    );
  }
);
NotificationItem.displayName = 'NotificationItem';

const NotificationsTab = ({ ref }: { ref?: React.Ref<{ scrollToTop: () => void }> }) => {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const flashListRef = useRef<FlashListRef<EnrichedNotification>>(null);

  // Expose scrollToTop method
  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    }),
    []
  );
  const navigation = useRouter();
  const queryClient = useQueryClient();
  // Get current user from store instead of API call
  const currentUser = useUserStore(state => state.currentUser);

  // Load moderation prefs so getModerationOpts can build ModerationOpts for moderateNotification
  useModerationSettings(currentUser?.did ?? undefined);

  // Mark notifications as seen when the tab is focused
  useFocusEffect(
    useCallback(() => {
      // Update seen status when notifications tab is focused
      NotificationService.updateNotificationSeen()
        .then(() => {
          void queryClient.refetchQueries({ queryKey: queryKeys.unread.summary() });
        })
        .catch(() => {
          // Silently fail - seen status update is not critical
        });
    }, [queryClient])
  );

  // Notifications: React Query useInfiniteQuery. Stable key + refetch on filter change so placeholderData keeps list stable.
  const scrollToTopAfterUpdateRef = useRef(false);
  const [isUserRefreshing, setIsUserRefreshing] = React.useState(false);
  const [postDataMap, setPostDataMap] = React.useState<PostDataMap>(() => new Map());

  const { data, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: [...queryKeys.notifications.lists()],
      queryFn: ({ pageParam }) =>
        NotificationService.listNotifications(pageParam as string | null, 50),
      initialPageParam: null as string | null,
      getNextPageParam: last => last.cursor ?? undefined,
      placeholderData: prev => prev,
      refetchOnMount: false,
    });

  const notifications = useMemo(() => data?.pages.flatMap(p => p.notifications) ?? [], [data]);

  // Scroll to top only after new data has rendered (keeps list from jumping mid-update)
  useEffect(() => {
    if (!scrollToTopAfterUpdateRef.current || !data?.pages?.length) return;
    scrollToTopAfterUpdateRef.current = false;
    requestAnimationFrame(() => {
      flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [data]);

  // Post data for notification items (batch fetch when notifications change)
  const postUrisToFetch = useMemo(() => {
    const uris = new Set<string>();
    for (const n of notifications) {
      if (!POST_ACTION_TYPES.includes(n.reason as PostActionReason)) continue;
      const uri = getPostUri(n);
      if (uri) uris.add(uri);
    }
    return Array.from(uris);
  }, [notifications]);

  const postUrisKey = postUrisToFetch.slice().sort().join(',');
  useEffect(() => {
    let cancelled = false;

    const loadPostData = async () => {
      try {
        if (postUrisToFetch.length === 0) {
          if (!cancelled) {
            setPostDataMap(new Map());
          }
          return;
        }

        const map = await fetchNotificationPostDataMap(postUrisToFetch);
        if (!cancelled) {
          setPostDataMap(map);
        }
      } catch {
        if (!cancelled) {
          setPostDataMap(new Map());
        }
      }
    };

    void loadPostData();

    return () => {
      cancelled = true;
    };
  }, [postUrisKey, postUrisToFetch]);

  const moderationOpts = ModerationService.getModerationOpts(currentUser?.did ?? undefined);
  const enrichedNotifications = useMemo((): EnrichedNotification[] => {
    if (!moderationOpts) return notifications.map(n => ({ ...n, shouldFilter: false }));
    return notifications.map(n => ({
      ...n,
      shouldFilter: moderateNotification(n, moderationOpts).ui('contentList').filter,
    }));
  }, [notifications, moderationOpts]);

  const filteredNotifications = useMemo(
    () => enrichedNotifications.filter(n => !n.shouldFilter),
    [enrichedNotifications]
  );

  const visibleNotifications = useMemo(
    () => filteredNotifications.filter(n => canOpenNotificationInOrbyt(n, postDataMap)),
    [filteredNotifications, postDataMap]
  );

  useEffect(() => {
    if (isLoading || isFetchingNextPage || !hasNextPage) return;
    if (visibleNotifications.length > 0) return;
    if (filteredNotifications.length === 0) return;
    if (notifications.length === 0) return;
    fetchNextPage();
  }, [
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    visibleNotifications.length,
    filteredNotifications.length,
    notifications.length,
    fetchNextPage,
  ]);

  useEffect(() => {
    if (notifications.length === 0) return;
    void ProfileService.warmProfileCache(notifications.map(n => n.author));
  }, [notifications]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = useCallback(() => {
    setIsUserRefreshing(true);
    refetch().finally(() => setIsUserRefreshing(false));
  }, [refetch]);

  const renderNotificationContent = useCallback(
    ({ item }: { item: EnrichedNotification }) => {
      return (
        <NotificationItem
          item={item}
          navigation={navigation}
          queryClient={queryClient}
          postDataMap={postDataMap}
          moderationOpts={moderationOpts}
        />
      );
    },
    [navigation, queryClient, postDataMap, moderationOpts]
  );

  const keyExtractor = useCallback((item: EnrichedNotification) => {
    if (item.uri) {
      return item.uri;
    }

    return [
      'notification',
      item.cid ?? 'no-cid',
      item.indexedAt ?? 'no-indexed-at',
      item.reason ?? 'no-reason',
      item.author?.did ?? 'no-author',
    ].join('-');
  }, []);

  const getItemType = useCallback((item: EnrichedNotification) => {
    if (POST_ACTION_TYPES.includes(item.reason as PostActionReason)) {
      return 'post-action';
    }
    return 'actor-action';
  }, []);

  return (
    <FlashList
      ref={flashListRef}
      style={activityListSharedStyles.listContainer}
      contentContainerStyle={[
        activityListSharedStyles.listContentContainer,
        { paddingBottom: bottom },
      ]}
      contentInsetAdjustmentBehavior="never"
      data={isError ? [] : visibleNotifications}
      extraData={postDataMap.size}
      renderItem={renderNotificationContent}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      ItemSeparatorComponent={NotificationDivider}
      drawDistance={400}
      refreshControl={
        <RefreshControl
          refreshing={isUserRefreshing}
          onRefresh={handleRefresh}
          tintColor={Colors.neutral[50]}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
      showsVerticalScrollIndicator={
        visibleNotifications.length >= SCROLL_INDICATOR_CONSTANTS.ACTIVITY_LIST_MIN_ITEMS
      }
      ListEmptyComponent={
        isError ? (
          <View style={activityListSharedStyles.errorContainer}>
            <EmptyFeed
              type="no-connection"
              message={t('activity.cantLoadNotifications')}
              onRetry={handleRefresh}
            />
          </View>
        ) : isLoading && notifications.length === 0 ? (
          <View style={activityListSharedStyles.loadingContainer}>
            <NotificationLoading />
          </View>
        ) : filteredNotifications.length > 0 && visibleNotifications.length === 0 ? (
          <EmptyNotifications messageKey="activity.noOrbytNotifications" />
        ) : (
          <EmptyNotifications />
        )
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={activityListSharedStyles.loadingMoreContainer}>
            <ActivityIndicator size="small" color={Colors.neutral[50]} />
          </View>
        ) : null
      }
    />
  );
};
NotificationsTab.displayName = 'NotificationsTab';

export default NotificationsTab;

const styles = StyleSheet.create({
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  notificationLeftContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationContentTail: {
    marginRight: 12,
  },
  thumbnailContainer: {
    position: 'relative',
    aspectRatio: 1,
    width: 55,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[925],
  },
  thumbnailAppleZoomInner: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  thumbnailVideo: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.neutral[925],
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
});
