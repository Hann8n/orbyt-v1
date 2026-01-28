import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from '../../ui/LinearGradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { Colors } from '../../ui/UI';
import { Avatar } from '../../ui/UI';
import Icon from '../../ui/Icon';
import BlurredBackground from '../../ui/BlurredBackground';
import { hexToRGBA } from '../../../utils/formatting/colors';
import type { ModerationUI } from '@atproto/api';
import { AtprotoService } from '../../../services/api/AtprotoService';
import { FeedService as ApiFeedService } from '../../../services/api/feed/FeedService';
import { useUserStore } from '../../../stores/userStore';
import { feedService } from '../../../services/FeedService';
import { openPostInBluesky } from '../../../utils/links/bluesky';
import MessageReactions from './MessageReactions';
import { ReactionView } from '../../../services/ChatService';
import { formatHandle } from '../../../utils/formatting/handles';
import { useProfile } from '../../../services/data/ProfileService';
import type { PostView, ImagesView, RecordWithMediaView } from '../../../services/api/types';
import { isVideoEmbed, isVideoEmbedInMedia } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';

interface EmbeddedPostCardProps {
  postUri: string;
  postCid: string;
  isCurrentUser?: boolean;
  // Optional chat reaction support
  reactions?: ReactionView[];
  currentUserId?: string;
  messageId?: string;
  onReactionPress?: (emoji: string, isCurrentUserReacted: boolean) => void;
  onLongPress?: () => void;
  // Optional: all messages from conversation to build video playlist
  conversationMessages?: Array<{ embed?: { record?: { uri?: string; cid?: string } } }>;
}

export default function EmbeddedPostCard({
  postUri,
  postCid: _postCid,
  isCurrentUser = false,
  reactions,
  currentUserId,
  messageId,
  onReactionPress,
  onLongPress,
  conversationMessages,
}: EmbeddedPostCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [userChoseToView, setUserChoseToView] = useState(false);
  const currentUser = useUserStore(state => state.currentUser);

  // Fetch post and run applyModerationBatch; attach contentListUI, contentMediaUI, avatarUI; filtered posts return shouldFilter
  const { data, isLoading } = useQuery({
    queryKey: ['embedded-post', postUri, currentUser?.did],
    queryFn: async () => {
      const post = await AtprotoService.getPost(postUri);
      if (!post) {
        return {
          post: null,
          contentListUI: undefined,
          contentMediaUI: undefined,
          avatarUI: undefined,
          shouldFilter: false,
        };
      }
      const batch = (await ApiFeedService.applyModerationBatch([{ post }])) as {
        post: PostView;
        contentListUI?: ModerationUI;
        contentMediaUI?: ModerationUI;
        avatarUI?: ModerationUI;
      }[];
      const item = batch[0];
      if (!item) {
        return {
          post,
          contentListUI: undefined,
          contentMediaUI: undefined,
          avatarUI: undefined,
          shouldFilter: true,
        };
      }
      return {
        post: item.post,
        contentListUI: item.contentListUI,
        contentMediaUI: item.contentMediaUI,
        avatarUI: item.avatarUI,
        shouldFilter: false,
      };
    },
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG, // 10 minutes - for slowly changing data
  });

  const post = data?.post;
  const contentListUI = data?.contentListUI;
  const contentMediaUI = data?.contentMediaUI;
  const shouldFilter = data?.shouldFilter ?? false;
  const shouldBlur = !!(contentListUI?.blur || contentMediaUI?.blur);
  const noOverride = !!(contentListUI?.noOverride || contentMediaUI?.noOverride);
  const shouldShowContent = noOverride ? false : !shouldBlur || userChoseToView;
  const isBlocked = !!shouldFilter; // hide: never show media, no opt-in
  const isBlurred = shouldBlur && !shouldShowContent; // warn: no unblurred media until opt-in
  const cannotShowMedia = isBlocked || isBlurred;
  const firstBlur = contentListUI?.blurs?.[0] ?? contentMediaUI?.blurs?.[0];
  const reason =
    firstBlur &&
    typeof firstBlur === 'object' &&
    'label' in firstBlur &&
    (firstBlur as { label?: { val?: string } }).label?.val
      ? (firstBlur as { label: { val: string } }).label.val
      : undefined;

  // Get profile data to check if author is blocked (must be called before early returns)
  const author = (post?.author ?? {}) as PostView['author'];
  const { data: authorProfile } = useProfile(author.handle);
  const isAuthorBlocked = !!(
    authorProfile?.viewer?.blocking || authorProfile?.viewer?.blockingByList
  );

  // Handle user choosing to view content
  const handleViewContent = useCallback(() => {
    setUserChoseToView(true);
  }, []);

  // Check if post has video content
  const isVideoPost = (post: PostView) => {
    const embed = post?.embed;
    if (!embed) return false;
    return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
  };

  // Check if post has image content
  const isImagePost = (post: PostView) => {
    const embed = post?.embed;
    if (!embed) return false;

    if (embed.$type === 'app.bsky.embed.images' || embed.$type === 'app.bsky.embed.images#view') {
      return true;
    } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
      const recordWithMedia = embed as RecordWithMediaView;
      return (
        recordWithMedia.media?.$type === 'app.bsky.embed.images' ||
        recordWithMedia.media?.$type === 'app.bsky.embed.images#view'
      );
    }
    return false;
  };

  // Check if post has external link content
  const isExternalLinkPost = (post: PostView) => {
    const embed = post?.embed;
    if (!embed) return false;

    return (
      embed.$type === 'app.bsky.embed.external' || embed.$type === 'app.bsky.embed.external#view'
    );
  };

  // Check if post has quoted post content
  const isQuotedPost = (post: PostView) => {
    const embed = post?.embed;
    if (!embed) return false;

    return embed.$type === 'app.bsky.embed.record' || embed.$type === 'app.bsky.embed.record#view';
  };

  // Get thumbnail for any post type
  const getPostThumbnail = (post: PostView) => {
    const embed = post?.embed;
    if (!embed || typeof embed !== 'object') return null;

    const embedObj = embed as {
      $type?: string;
      thumbnail?: string;
      media?: {
        $type?: string;
        thumbnail?: string;
        images?: Array<{ fullsize?: string; thumb?: string }>;
      };
      images?: Array<{ fullsize?: string; thumb?: string }>;
      thumb?: string;
    };

    // Video posts - use getVideoView helper + direct property access
    const videoView = getVideoView(embed);
    if (videoView) {
      return videoView.thumbnail || null;
    }

    // Image posts - get first image
    if (
      embedObj.$type === 'app.bsky.embed.images' ||
      embedObj.$type === 'app.bsky.embed.images#view'
    ) {
      const imagesView = embed as ImagesView;
      return imagesView.images?.[0]?.fullsize || imagesView.images?.[0]?.thumb || null;
    } else if (embedObj.$type === 'app.bsky.embed.recordWithMedia#view') {
      const recordWithMedia = embed as RecordWithMediaView;
      if (
        recordWithMedia.media &&
        (recordWithMedia.media.$type === 'app.bsky.embed.images' ||
          recordWithMedia.media.$type === 'app.bsky.embed.images#view')
      ) {
        const imagesView = recordWithMedia.media as ImagesView;
        return imagesView.images?.[0]?.fullsize || imagesView.images?.[0]?.thumb || null;
      }
    }

    // External link posts
    if (
      embedObj.$type === 'app.bsky.embed.external' ||
      embedObj.$type === 'app.bsky.embed.external#view'
    ) {
      return embedObj.thumb || null;
    }

    return null;
  };

  // Get post text content
  const getPostText = (post: PostView) => {
    const record = post.record as { text?: string };
    const text = record?.text || '';
    if (!text) return null;

    return text;
  };

  // Get external link info
  const getExternalLinkInfo = (post: PostView) => {
    const embed = post?.embed;
    if (!embed || typeof embed !== 'object') return null;
    const embedObj = embed as {
      $type?: string;
      uri?: string;
      title?: string;
      description?: string;
      thumb?: string;
    };
    if (
      embedObj.$type !== 'app.bsky.embed.external' &&
      embedObj.$type !== 'app.bsky.embed.external#view'
    ) {
      return null;
    }

    return {
      uri: embedObj.uri,
      title: embedObj.title,
      description: embedObj.description,
      thumb: embedObj.thumb,
    };
  };

  // Get quoted post info
  const getQuotedPostInfo = (post: PostView) => {
    const embed = post?.embed;
    if (
      !embed ||
      (embed.$type !== 'app.bsky.embed.record' && embed.$type !== 'app.bsky.embed.record#view')
    ) {
      return null;
    }

    // Type guard for record embed
    if ('record' in embed) {
      return embed.record;
    }
    return null;
  };

  // Get post data
  const thumbnailUrl = post ? getPostThumbnail(post) : null;
  const postText = post ? getPostText(post) : '';
  const isVideo = post ? isVideoPost(post) : false;
  const isImage = post ? isImagePost(post) : false;
  const isExternalLink = post ? isExternalLinkPost(post) : false;
  const isQuoted = post ? isQuotedPost(post) : false;
  const externalLinkInfo = post ? getExternalLinkInfo(post) : null;
  const quotedPostInfo = post ? getQuotedPostInfo(post) : null;

  // Handle post tap - open in Bluesky app or Orbyt app for videos
  const handlePostPress = useCallback(async () => {
    if (!post?.uri) return;

    // For video posts, open in Orbyt app using the existing feed modal
    if (isVideo) {
      try {
        // If we have conversation messages, build a playlist of all video posts
        if (conversationMessages && conversationMessages.length > 0) {
          const embedUris = conversationMessages
            .map(msg => msg.embed?.record?.uri)
            .filter((uri): uri is string => !!uri);

          const resolvedPosts = await Promise.all(
            embedUris.map(async embedUri => {
              const cached = queryClient.getQueryData<{ post?: PostView } | PostView>([
                'embedded-post',
                embedUri,
              ]);
              const postData =
                cached && typeof cached === 'object' && 'uri' in cached
                  ? (cached as PostView)
                  : (cached as { post?: PostView })?.post;

              let resolved: PostView | null = postData ?? null;
              if (!resolved) {
                try {
                  const fetchedPost = await AtprotoService.getPost(embedUri);
                  if (fetchedPost) {
                    queryClient.setQueryData(['embedded-post', embedUri], fetchedPost);
                    resolved = fetchedPost;
                  }
                } catch {
                  // ignore
                }
              }
              if (!resolved) return null;
              const embed = resolved.embed;
              if (!embed || (!isVideoEmbed(embed) && !isVideoEmbedInMedia(embed))) return null;
              return resolved;
            })
          );

          const valid = resolvedPosts.filter((p): p is PostView => p != null);
          const toBatch = valid.map(p => ({ post: p, uniqueKey: p.uri }));
          const moderated = await ApiFeedService.applyModerationBatch(toBatch);
          const validVideoPosts = [...moderated].reverse();
          const currentIndex = validVideoPosts.findIndex(item => item.post.uri === post.uri);

          if (validVideoPosts.length > 0) {
            feedService.setCurrentFeed(validVideoPosts);
            router.push({
              pathname: '/(modals)/feed',
              params: {
                feedOption: 'search',
                userDid: undefined,
                backgroundColor: 'transparent',
                secondaryColor: Colors.white,
                searchQuery: '',
                hasNextPage: 'false',
                isFetchingNextPage: 'false',
                initialIndex: currentIndex >= 0 ? String(currentIndex) : '0',
              },
            });
            return;
          }
        }

        // Fallback: single post
        const postData = await AtprotoService.getPost(post.uri);
        if (!postData) return;

        const [feedItem] = await ApiFeedService.applyModerationBatch([
          { post: postData, uniqueKey: postData.uri },
        ]);
        if (!feedItem) return;

        feedService.setCurrentFeed([feedItem]);
        router.push({
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
      } catch (_error: unknown) {
        // ignore
      }
    } else {
      await openPostInBluesky(post.uri);
    }
  }, [post, queryClient, isVideo, router, conversationMessages]);

  // Format relative time
  const formatRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const postDate = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - postDate.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d`;
    } else {
      const weeks = Math.floor(diffInSeconds / 604800);
      return `${weeks}w`;
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading post...</Text>
        </View>
      </View>
    );
  }

  // Show filtered content placeholder
  if (shouldFilter) {
    return (
      <View style={styles.container}>
        <View style={styles.filteredContainer}>
          <Text style={styles.filteredText}>Content hidden</Text>
        </View>
      </View>
    );
  }

  // Show error state if no post
  if (!post) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={32} color={Colors.lightGray} />
          <Text style={styles.errorText}>Post not found</Text>
        </View>
      </View>
    );
  }

  // Ensure avatar URL is properly formatted
  const avatarUrl = author.avatar
    ? author.avatar.startsWith('http')
      ? author.avatar
      : `https://${author.avatar.replace(/^https?:\/\//, '')}`
    : undefined;

  // Unified post card component
  const renderUnifiedPostCard = (text?: string, showImage?: boolean) => {
    return (
      <View style={styles.cleanPostContainer}>
        <View style={styles.cleanPostHeader}>
          <Avatar
            uri={avatarUrl}
            type="profile"
            size={32}
            showRing={true}
            fallbackIcon="user"
            fallbackIconColor={Colors.white}
            style={styles.cleanAvatar}
            blurRadius={isAuthorBlocked ? 30 : 0}
          />
          <Text style={styles.cleanAuthorName} numberOfLines={1}>
            {author.displayName || formatHandle(author.handle) || 'Unknown'}
          </Text>
          <View style={styles.headerBlueskyLogo}>
            <Icon name="bluesky-icon" size={18} color={Colors.bluesky} />
          </View>
        </View>

        {text && <Text style={styles.cleanPostText}>{text}</Text>}

        {showImage && thumbnailUrl && (
          <View style={styles.cleanImageContainer}>
            <BlurredBackground thumbnailUrl={thumbnailUrl} />
            {!cannotShowMedia && (
              <Image
                source={{ uri: thumbnailUrl }}
                style={styles.cleanImage}
                contentFit="contain"
              />
            )}
            {isBlurred && !noOverride && (
              <View style={styles.cleanWarningOverlay}>
                <Pressable onPress={handleViewContent}>
                  <View style={styles.viewButton}>
                    <Text style={styles.viewButtonText}>Show Content</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.cleanPostActions}>
          <View style={styles.actionItem}>
            <Icon name="heart" size={14} color={Colors.lightGray} />
            <Text style={styles.actionText}>{post?.likeCount || 0}</Text>
          </View>
          <View style={styles.actionItem}>
            <Icon name="repeat" size={14} color={Colors.lightGray} />
            <Text style={styles.actionText}>{post?.repostCount || 0}</Text>
          </View>
          <View style={styles.actionItem}>
            <Icon name="message" size={14} color={Colors.lightGray} />
            <Text style={styles.actionText}>{post?.replyCount || 0}</Text>
          </View>
          <Text style={styles.relativeTime}>
            {post?.indexedAt ? formatRelativeTime(post.indexedAt) : ''}
          </Text>
        </View>
      </View>
    );
  };

  // Render post content based on type
  const renderPostContent = () => {
    if (isVideo) {
      if (isBlocked) {
        return (
          <View style={styles.videoThumbnailContainer}>
            <View style={styles.contentHiddenOverlay}>
              <Text style={styles.warningTitle}>Content hidden</Text>
              <Text style={styles.warningText}>This content is hidden by your safety settings</Text>
            </View>
          </View>
        );
      }
      return (
        <View style={styles.videoThumbnailContainer}>
          <BlurredBackground thumbnailUrl={thumbnailUrl} />
          {thumbnailUrl && !cannotShowMedia && (
            <Image
              source={{ uri: thumbnailUrl }}
              style={styles.videoThumbnail}
              contentFit="contain"
            />
          )}

          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.5)']}
            style={styles.videoGradient}
          />

          {/* Author overlay in bottom left */}
          <View style={styles.authorOverlay}>
            <Avatar
              uri={avatarUrl}
              type="profile"
              size={32}
              showRing={false}
              fallbackIcon="user"
              fallbackIconColor={Colors.white}
              blurRadius={isAuthorBlocked ? 30 : 0}
            />
          </View>

          {isBlurred && (
            <View style={styles.contentWarningOverlay}>
              <View style={styles.warningMessage}>
                <Text style={styles.warningTitle}>Content Warning</Text>
                <Text style={styles.warningText}>
                  {reason || 'This content may not be appropriate for all viewers.'}
                </Text>
                {!noOverride && (
                  <Pressable onPress={handleViewContent}>
                    <View style={styles.viewButton}>
                      <Text style={styles.viewButtonText}>Show Content</Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>
      );
    }

    if (isImage) {
      return renderUnifiedPostCard(postText || undefined, !isBlocked);
    }

    if (isExternalLink && externalLinkInfo) {
      return renderUnifiedPostCard(postText || undefined, false);
    }

    if (isQuoted && quotedPostInfo && 'record' in quotedPostInfo) {
      // quotedPostInfo is the record from embed, which should be a PostView
      const quotedText = getPostText(quotedPostInfo as PostView) || 'Quoted Post';
      return renderUnifiedPostCard(quotedText, false);
    }

    if (thumbnailUrl) {
      return renderUnifiedPostCard(postText || 'Post', !isBlocked);
    }

    // Text-only post fallback
    return renderUnifiedPostCard(postText || 'Post', false);
  };

  return (
    <Pressable
      style={[styles.container, isCurrentUser ? styles.containerRight : styles.containerLeft]}
      onPress={handlePostPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {renderPostContent()}
      {/* Inline message reactions if provided via props */}
      {reactions && reactions.length > 0 && currentUserId && messageId && onReactionPress ? (
        <MessageReactions
          messageId={messageId}
          reactions={reactions}
          currentUserId={currentUserId}
          onReactionPress={onReactionPress}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {},
  containerLeft: {
    alignItems: 'flex-start',
  },
  containerRight: {
    alignItems: 'flex-end',
  },
  authorOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  // Video post styles
  videoThumbnailContainer: {
    position: 'relative',
    width: 140,
    aspectRatio: 9 / 16,
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
    backgroundColor: Colors.gray,
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    position: 'relative',
    zIndex: 1,
  },
  videoGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  // Modern clean post styles
  cleanPostContainer: {
    width: 320,
    backgroundColor: Colors.darkGray,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  cleanPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cleanAvatar: {
    marginRight: 12,
  },
  cleanAuthorName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  headerBlueskyLogo: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanPostActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: hexToRGBA(Colors.white, 0.05),
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  actionText: {
    fontSize: 13,
    color: Colors.lightGray,
    marginLeft: 6,
    fontFamily: 'Figtree-Medium',
  },
  relativeTime: {
    fontSize: 13,
    color: Colors.lightGray,
    fontFamily: 'Figtree-Medium',
    marginLeft: 'auto',
    backgroundColor: hexToRGBA(Colors.white, 0.05),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cleanPostText: {
    fontSize: 15,
    color: Colors.white,
    lineHeight: 22,
    paddingHorizontal: 16,
    marginBottom: 12,
    fontFamily: 'Figtree-Regular',
  },
  cleanImageContainer: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cleanImage: {
    width: '100%',
    height: 160,
    position: 'relative',
    zIndex: 1,
  },
  cleanWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  contentHiddenOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: hexToRGBA(Colors.black, 0.9),
    padding: 16,
  },
  warningMessage: {
    padding: 16,
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 12,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  viewButton: {
    backgroundColor: Colors.white,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  viewButtonText: {
    color: Colors.black,
    fontWeight: 'bold',
    fontSize: 12,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.lightGray,
    fontSize: 14,
  },
  filteredContainer: {
    padding: 20,
    alignItems: 'center',
  },
  filteredText: {
    color: Colors.lightGray,
    fontSize: 14,
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  errorText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
  },
});
