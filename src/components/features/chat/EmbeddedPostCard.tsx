import { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { Colors } from '../../ui/UI';
import { Avatar } from '../../ui/UI';
import Icon from '../../ui/Icon';
import BlurredThumbnailBackground from '../../ui/BlurredThumbnailBackground';
import { AtprotoService } from '../../../services/api/AtprotoService';
import { ModerationDecision } from '../../../services/moderation/ModerationTypes';
import { computeModerationDecision } from '../../../utils/moderation/computeDecision';
import { useModerationSettings } from '../../../hooks/useModerationSettings';
import { useUserStore } from '../../../stores/userStore';
import { feedService } from '../../../services/FeedService';
import { openPostInBluesky } from '../../../utils/links/bluesky';
import MessageReactions from './MessageReactions';
import { ReactionView } from '../../../services/ChatService';
import { formatHandle } from '../../../utils/formatting/handles';
import { useProfile } from '../../../services/data/ProfileService';
import type {
  PostView,
  VideoView,
  ImagesView,
  RecordWithMediaView,
} from '../../../services/api/types';
import { isVideoEmbed, isVideoEmbedInMedia } from '../../../services/api/types';

interface EmbeddedPostCardProps {
  postUri: string;
  postCid: string;
  moderationDecision?: ModerationDecision; // Deprecated: computed inline now, kept for backward compatibility
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
  moderationDecision,
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

  // Fetch post data
  const { data: post, isLoading } = useQuery({
    queryKey: ['embedded-post', postUri],
    queryFn: () => AtprotoService.getPost(postUri),
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG, // 10 minutes - for slowly changing data
  });

  // Get moderation settings for computing decision
  const currentUser = useUserStore(state => state.currentUser);
  const { settings } = useModerationSettings(currentUser?.did ?? undefined);

  // Compute moderation decision inline (post is fetched separately, not from feed)
  const decision = useMemo(() => {
    // Use prop if provided (backward compatibility)
    if (moderationDecision) {
      return moderationDecision;
    }

    // Compute if post and settings are available
    if (post && settings) {
      try {
        return computeModerationDecision(post, settings);
      } catch {
        return { filter: false, blur: false, informs: [] };
      }
    }

    return { filter: false, blur: false, informs: [] };
  }, [post, settings, moderationDecision]);

  const shouldBlur = decision?.blur || false;
  const shouldFilter = decision?.filter || false;
  const shouldShowContent = !shouldBlur || userChoseToView;
  const isBlurred = shouldBlur && !shouldShowContent;
  const reason = decision?.reason;

  // Get profile data to check if author is blocked (must be called before early returns)
  const author = post?.author || {};
  const { data: authorProfile } = useProfile(author.handle);
  const isAuthorBlocked = authorProfile?.isBlocked ?? false;

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

    // Video posts
    if (
      embedObj.$type === 'app.bsky.embed.video' ||
      embedObj.$type === 'app.bsky.embed.video#view'
    ) {
      return (embed as VideoView).thumbnail || null;
    } else if (embedObj.$type === 'app.bsky.embed.recordWithMedia#view') {
      const recordWithMedia = embed as RecordWithMediaView;
      if (
        recordWithMedia.media &&
        (recordWithMedia.media.$type === 'app.bsky.embed.video' ||
          recordWithMedia.media.$type === 'app.bsky.embed.video#view')
      ) {
        return (recordWithMedia.media as VideoView).thumbnail || null;
      }
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
          // Get all embed URIs from messages
          const embedUris = conversationMessages
            .map(msg => msg.embed?.record?.uri)
            .filter((uri): uri is string => !!uri);

          // Use cached data first, only fetch missing posts
          const videoPosts = await Promise.all(
            embedUris.map(async embedUri => {
              // Try to get from cache first
              const cachedPost = queryClient.getQueryData<PostView>(['embedded-post', embedUri]);

              let postData = cachedPost;

              // Only fetch if not in cache
              if (!postData) {
                try {
                  const fetchedPost = await AtprotoService.getPost(embedUri);
                  // Cache it for future use
                  if (fetchedPost) {
                    queryClient.setQueryData(['embedded-post', embedUri], fetchedPost);
                    postData = fetchedPost;
                  } else {
                    return null;
                  }
                } catch {
                  return null;
                }
              }

              if (!postData) return null;

              // Check if it's actually a video post
              const embed = postData.embed;
              const isVideoEmbed =
                embed?.$type === 'app.bsky.embed.video' ||
                embed?.$type === 'app.bsky.embed.video#view' ||
                (embed?.$type === 'app.bsky.embed.recordWithMedia#view' &&
                  ((embed as RecordWithMediaView).media?.$type === 'app.bsky.embed.video' ||
                    (embed as RecordWithMediaView).media?.$type === 'app.bsky.embed.video#view'));

              if (!isVideoEmbed) return null;

              return {
                post: {
                  uri: postData.uri,
                  cid: postData.cid,
                  author: postData.author,
                  record: postData.record,
                  embed: postData.embed,
                  replyCount: postData.replyCount,
                  repostCount: postData.repostCount,
                  likeCount: postData.likeCount,
                  indexedAt: postData.indexedAt,
                },
                uniqueKey: postData.uri,
                moderationDecision:
                  'moderationDecision' in postData
                    ? (postData as PostView & { moderationDecision?: ModerationDecision })
                        .moderationDecision
                    : undefined,
              };
            })
          );

          // Filter out nulls and reverse to match chat direction (oldest to newest)
          const validVideoPosts = videoPosts
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .reverse();
          const currentIndex = validVideoPosts.findIndex(item => item.post.uri === post.uri);

          // If we found videos, use the playlist; otherwise fall back to single post
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

        // Fallback: single post (original behavior)
        const postData = await AtprotoService.getPost(post.uri);
        if (!postData) {
          return;
        }

        const feedItem = {
          post: {
            uri: postData.uri,
            cid: postData.cid,
            author: postData.author,
            record: postData.record,
            embed: postData.embed,
            replyCount: postData.replyCount,
            repostCount: postData.repostCount,
            likeCount: postData.likeCount,
            indexedAt: postData.indexedAt,
          },
          uniqueKey: postData.uri,
          moderationDecision:
            'moderationDecision' in post
              ? (post as PostView & { moderationDecision?: ModerationDecision }).moderationDecision
              : undefined,
        };

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
      // For non-video posts, open in Bluesky app
      await openPostInBluesky(post.uri);
    }
  }, [post, queryClient, isVideo, moderationDecision, router, conversationMessages]);

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
            {/* Blurred thumbnail background */}
            <BlurredThumbnailBackground thumbnailUrl={thumbnailUrl} />
            {/* Main image */}
            <Image source={{ uri: thumbnailUrl }} style={styles.cleanImage} contentFit="contain" />
            {isBlurred && (
              <BlurView
                intensity={80}
                tint="dark"
                style={styles.cleanBlurOverlay}
                experimentalBlurMethod="dimezisBlurView"
              />
            )}
            {isBlurred && (
              <View style={styles.cleanWarningOverlay}>
                <Pressable onPress={handleViewContent}>
                  <View style={styles.cleanViewButton}>
                    <Text style={styles.cleanViewButtonText}>Show Content</Text>
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
      return (
        <View style={styles.videoThumbnailContainer}>
          {/* Blurred thumbnail background */}
          <BlurredThumbnailBackground thumbnailUrl={thumbnailUrl} />
          {/* Main thumbnail */}
          {thumbnailUrl && (
            <Image
              source={{ uri: thumbnailUrl }}
              style={styles.videoThumbnail}
              contentFit="contain"
            />
          )}

          {/* Black gradient from bottom */}
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
            <BlurView
              intensity={80}
              tint="dark"
              style={styles.blurOverlay}
              experimentalBlurMethod="dimezisBlurView"
            />
          )}
          {isBlurred && (
            <View style={styles.contentWarningOverlay}>
              <View style={styles.warningMessage}>
                <Text style={styles.warningTitle}>Content Warning</Text>
                <Text style={styles.warningText}>
                  {reason || 'This content may not be appropriate for all viewers.'}
                </Text>
                <Pressable onPress={handleViewContent}>
                  <View style={styles.viewButton}>
                    <Text style={styles.viewButtonText}>Show Content</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      );
    }

    // All non-video post types use the unified card with different parameters
    if (isImage) {
      return renderUnifiedPostCard(postText || undefined, true);
    }

    if (isExternalLink && externalLinkInfo) {
      return renderUnifiedPostCard(postText || undefined, false);
    }

    if (isQuoted && quotedPostInfo && 'record' in quotedPostInfo) {
      // quotedPostInfo is the record from embed, which should be a PostView
      const quotedText = getPostText(quotedPostInfo as PostView) || 'Quoted Post';
      return renderUnifiedPostCard(quotedText, false);
    }

    // Fallback for posts with thumbnails
    if (thumbnailUrl) {
      return renderUnifiedPostCard(postText || 'Post', true);
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
  thumbnailContainer: {
    position: 'relative',
    width: 140,
    height: 140,
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
    backgroundColor: Colors.gray,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  // Text post styles
  textPostContainer: {
    width: 280,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
    position: 'relative',
  },
  textPostContent: {
    padding: 16,
  },
  textPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  textPostAvatar: {
    marginRight: 12,
  },
  textPostAuthorInfo: {
    flex: 1,
  },
  textPostAuthor: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    color: Colors.white,
    marginBottom: 2,
  },
  textPostText: {
    fontSize: 16,
    color: Colors.white,
    lineHeight: 20,
    marginBottom: 8,
  },
  postStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statText: {
    fontSize: 12,
    color: Colors.lightGray,
    marginLeft: 4,
    fontFamily: 'Firma-Medium',
  },
  blueskyLogoContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
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
    fontFamily: 'Firma-Medium',
  },
  relativeTime: {
    fontSize: 13,
    color: Colors.lightGray,
    fontFamily: 'Firma-Medium',
    marginLeft: 'auto',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    fontFamily: 'Firma-Regular',
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
  cleanBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  cleanWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cleanViewButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  cleanViewButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  cleanFooter: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  blueskyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  blueskyIndicatorText: {
    fontSize: 10,
    color: Colors.bluesky,
    marginLeft: 4,
    fontFamily: 'Firma-Medium',
  },
  // Image within text post styles
  textPostImageContainer: {
    position: 'relative',
    marginVertical: 8,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
  },
  textPostImage: {
    width: '100%',
    height: 160,
  },
  textPostBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  textPostWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textPostViewButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  textPostViewButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  contentWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  warningMessage: {
    padding: 16,
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  viewButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  viewButtonText: {
    color: '#000',
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
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
});
