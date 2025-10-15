import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Pressable, Linking, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { BORDER_RADIUS } from '../../../utils/constants';
import { Colors } from '../../ui/UI';
import { Avatar } from '../../ui/UI';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import Icon from '../../ui/Icon';
import { AtprotoService } from '../../../services/api/AtprotoService';
import { useThumbnailColor } from '../../../hooks/useThumbnailColor';
import { ModerationDecision } from '../../../services/ModerationTypes';
import { feedService } from '../../../services/FeedService';
import { openPostInBluesky } from '../../../utils/blueskyLinks';

interface EmbeddedPostCardProps {
  postUri: string;
  postCid: string;
  moderationDecision?: ModerationDecision;
  isCurrentUser?: boolean;
}

export default function EmbeddedPostCard({ 
  postUri, 
  postCid, 
  moderationDecision,
  isCurrentUser = false
}: EmbeddedPostCardProps) {
  const router = useRouter();
  const [userChoseToView, setUserChoseToView] = useState(false);

  // Fetch post data
  const { data: post, isLoading } = useQuery({
    queryKey: ['embedded-post', postUri],
    queryFn: () => AtprotoService.getPost(postUri),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get moderation decision
  const decision = moderationDecision || post?.moderationDecision;
  const shouldBlur = decision?.blur || false;
  const shouldFilter = decision?.filter || false;
  const shouldShowContent = !shouldBlur || userChoseToView;
  const isBlurred = shouldBlur && !shouldShowContent;
  const reason = decision?.reason;

  // Handle user choosing to view content
  const handleViewContent = useCallback(() => {
    setUserChoseToView(true);
  }, []);


  // Check if post has video content
  const isVideoPost = (post: any) => {
    const embed = post?.embed;
    if (!embed) return false;
    
    if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
      return true;
    } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
      return embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view';
    }
    return false;
  };

  // Check if post has image content
  const isImagePost = (post: any) => {
    const embed = post?.embed;
    if (!embed) return false;
    
    if (embed.$type === 'app.bsky.embed.images' || embed.$type === 'app.bsky.embed.images#view') {
      return true;
    } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
      return embed.media?.$type === 'app.bsky.embed.images' || embed.media?.$type === 'app.bsky.embed.images#view';
    }
    return false;
  };

  // Check if post has external link content
  const isExternalLinkPost = (post: any) => {
    const embed = post?.embed;
    if (!embed) return false;
    
    return embed.$type === 'app.bsky.embed.external' || embed.$type === 'app.bsky.embed.external#view';
  };

  // Check if post has quoted post content
  const isQuotedPost = (post: any) => {
    const embed = post?.embed;
    if (!embed) return false;
    
    return embed.$type === 'app.bsky.embed.record' || embed.$type === 'app.bsky.embed.record#view';
  };

  // Get thumbnail for any post type
  const getPostThumbnail = (post: any) => {
    const embed = post?.embed;
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
    
    return null;
  };

  // Get post text content
  const getPostText = (post: any) => {
    const text = post?.record?.text || '';
    if (!text) return null;
    
    // Truncate long text for preview
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  };

  // Get external link info
  const getExternalLinkInfo = (post: any) => {
    const embed = post?.embed;
    if (!embed || (embed.$type !== 'app.bsky.embed.external' && embed.$type !== 'app.bsky.embed.external#view')) {
      return null;
    }
    
    return {
      uri: embed.uri,
      title: embed.title,
      description: embed.description,
      thumb: embed.thumb
    };
  };

  // Get quoted post info
  const getQuotedPostInfo = (post: any) => {
    const embed = post?.embed;
    if (!embed || (embed.$type !== 'app.bsky.embed.record' && embed.$type !== 'app.bsky.embed.record#view')) {
      return null;
    }
    
    return embed.record;
  };

  // Get post data
  const thumbnailUrl = post ? getPostThumbnail(post) : null;
  const { backgroundColor: thumbnailBackgroundColor } = useThumbnailColor(thumbnailUrl);
  const postText = getPostText(post);
  const authorDisplayName = post?.author?.displayName || post?.author?.handle || 'Unknown User';
  const authorHandle = post?.author?.handle || '';
  const authorAvatar = post?.author?.avatar;
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
        // Fetch the post data
        const postData = await AtprotoService.getPost(post.uri);
        if (!postData) {
          console.warn('Failed to fetch post data for:', post.uri);
          return;
        }
        
        // Create a feed item with the post data
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
          shouldCache: true,
          uniqueKey: postData.uri,
          moderationDecision: post.moderationDecision,
        };
        
        // Set the current feed with just this post
        feedService.setCurrentFeed([feedItem]);
        
        // Navigate to feed modal
        router.push({
          pathname: '/(modals)/feed',
          params: {
            initialIndex: 0,
            initialUri: post.uri,
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
        console.error('Error fetching post data:', error);
      }
    } else {
      // For non-video posts, open in Bluesky app
      await openPostInBluesky(post.uri);
    }
  }, [post?.uri, isVideo, post?.moderationDecision, router]);

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
          <Text style={styles.errorText}>Post not found</Text>
        </View>
      </View>
    );
  }

  const author = post.author || {};
  const record = post.record || {};
  // Ensure avatar URL is properly formatted
  const avatarUrl = author.avatar 
    ? author.avatar.startsWith('http') 
      ? author.avatar 
      : `https://${author.avatar.replace(/^https?:\/\//, '')}`
    : undefined;

  // Render post content based on type
  const renderPostContent = () => {
    if (isVideo) {
      return (
        <View style={styles.videoThumbnailContainer}>
          <Image 
            source={{ uri: thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover"
          />
          
          {/* Author overlay in bottom left */}
          <View style={styles.authorOverlay}>
            <Avatar 
              uri={avatarUrl}
              type="profile"
              size={26}
              fallbackIcon="user"
              fallbackIconColor={Colors.white}
              style={styles.authorAvatar}
            />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName} numberOfLines={1}>
                {author.displayName || author.handle || 'Unknown'}
              </Text>
            </View>
          </View>
          
          
          {isBlurred && (
            <BlurView intensity={80} tint="dark" style={styles.blurOverlay} />
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
    
    if (isImage) {
      return (
        <View style={styles.textPostContainer}>
          <View style={styles.textPostContent}>
            <View style={styles.textPostHeader}>
              <Avatar 
                uri={avatarUrl}
                type="profile"
                size={32}
                fallbackIcon="user"
                fallbackIconColor={Colors.white}
                style={styles.textPostAvatar}
              />
              <View style={styles.textPostAuthorInfo}>
                <Text style={styles.textPostAuthor} numberOfLines={1}>
                  {author.displayName || author.handle || 'Unknown'}
                </Text>
              </View>
            </View>
            <Text style={styles.textPostText} numberOfLines={3}>
              {postText || 'Image Post'}
            </Text>
            {thumbnailUrl && (
              <View style={styles.textPostImageContainer}>
                <Image 
                  source={{ uri: thumbnailUrl }}
                  style={styles.textPostImage}
                  resizeMode="cover"
                />
                {isBlurred && (
                  <BlurView intensity={80} tint="dark" style={styles.textPostBlurOverlay} />
                )}
                {isBlurred && (
                  <View style={styles.textPostWarningOverlay}>
                    <Pressable onPress={handleViewContent}>
                      <View style={styles.textPostViewButton}>
                        <Text style={styles.textPostViewButtonText}>Show Content</Text>
                      </View>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
            <View style={styles.blueskyLogoContainer}>
              <Icon name="bluesky-icon" size={20} color={Colors.bluesky} />
            </View>
          </View>
        </View>
      );
    }
    
    if (isExternalLink && externalLinkInfo) {
      return (
        <View style={styles.textPostContainer}>
          <View style={styles.textPostContent}>
            <View style={styles.textPostHeader}>
              <Avatar 
                uri={avatarUrl}
                type="profile"
                size={32}
                fallbackIcon="user"
                fallbackIconColor={Colors.white}
                style={styles.textPostAvatar}
              />
              <View style={styles.textPostAuthorInfo}>
                <Text style={styles.textPostAuthor} numberOfLines={1}>
                  {author.displayName || author.handle || 'Unknown'}
                </Text>
              </View>
            </View>
            <Text style={styles.textPostText} numberOfLines={3}>
              {postText || 'External Link'}
            </Text>
            <View style={styles.blueskyLogoContainer}>
              <Icon name="bluesky-icon" size={20} color={Colors.bluesky} />
            </View>
          </View>
        </View>
      );
    }
    
    if (isQuoted && quotedPostInfo) {
      return (
        <View style={styles.textPostContainer}>
          <View style={styles.textPostContent}>
            <View style={styles.textPostHeader}>
              <Avatar 
                uri={avatarUrl}
                type="profile"
                size={32}
                fallbackIcon="user"
                fallbackIconColor={Colors.white}
                style={styles.textPostAvatar}
              />
              <View style={styles.textPostAuthorInfo}>
                <Text style={styles.textPostAuthor} numberOfLines={1}>
                  {author.displayName || author.handle || 'Unknown'}
                </Text>
              </View>
            </View>
            <Text style={styles.textPostText} numberOfLines={3}>
              {quotedPostInfo.text || quotedPostInfo.value?.text || 'Quoted Post'}
            </Text>
            <View style={styles.blueskyLogoContainer}>
              <Icon name="bluesky-icon" size={20} color={Colors.bluesky} />
            </View>
          </View>
        </View>
      );
    }
    
    // Fallback for text-only posts or posts with thumbnails
    if (thumbnailUrl) {
      return (
        <View style={styles.thumbnailContainer}>
          <Image 
            source={{ uri: thumbnailUrl }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          
          {/* Author overlay in bottom left */}
          <View style={styles.authorOverlay}>
            <Avatar 
              uri={avatarUrl}
              type="profile"
              size={24}
              fallbackIcon="user"
              fallbackIconColor={Colors.white}
              style={styles.authorAvatar}
            />
            <Text style={styles.authorName} numberOfLines={1}>
              {author.displayName || author.handle || 'Unknown'}
            </Text>
          </View>
          
          {isBlurred && (
            <BlurView intensity={80} tint="dark" style={styles.blurOverlay} />
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
    
    // Text-only post fallback
    return (
      <View style={styles.textPostContainer}>
        <View style={styles.textPostContent}>
          <View style={styles.textPostHeader}>
            <Avatar 
              uri={avatarUrl}
              type="profile"
              size={24}
              fallbackIcon="user"
              fallbackIconColor={Colors.white}
              style={styles.textPostAvatar}
            />
            <Text style={styles.textPostAuthor} numberOfLines={1}>
              {author.displayName || author.handle || 'Unknown'}
            </Text>
          </View>
          <Text style={styles.textPostText} numberOfLines={3}>
            {postText || 'Post'}
          </Text>
          <View style={styles.blueskyLogoContainer}>
            <Icon name="bluesky-icon" size={20} color={Colors.bluesky} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <Pressable 
      style={[
        styles.container,
        isCurrentUser ? styles.containerRight : styles.containerLeft
      ]}
      onPress={handlePostPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {renderPostContent()}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
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
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '80%',
  },
  authorAvatar: {
    marginRight: 8,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  blueskyLogoContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  errorText: {
    color: Colors.lightGray,
    fontSize: 14,
  },
});
