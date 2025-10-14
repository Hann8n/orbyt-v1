import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { BORDER_RADIUS } from '../../../utils/constants';
import { Colors } from '../../ui/UI';
import { Avatar } from '../../ui/UI';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import { AtprotoService } from '../../../services/api/AtprotoService';
import { useThumbnailColor } from '../../../hooks/useThumbnailColor';
import { ModerationDecision } from '../../../services/ModerationTypes';
import { feedService } from '../../../services/FeedService';

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

  // Handle post tap
  const handlePostPress = useCallback(async () => {
    if (!post?.uri) return;
    
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
  }, [post?.uri, post?.moderationDecision, router]);

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

  // Get video thumbnail if present
  const getVideoThumbnail = (post: any) => {
    const embed = post?.embed;
    if (!embed) return null;
    
    if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
      return embed.thumbnail || null;
    } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
      return embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view' 
        ? embed.media?.thumbnail 
        : null;
    }
    return null;
  };

  // Get thumbnail color for background
  const thumbnailUrl = post ? getVideoThumbnail(post) : null;
  const { backgroundColor: thumbnailBackgroundColor } = useThumbnailColor(thumbnailUrl);
  const postText = post?.record?.text || '';
  const authorDisplayName = post?.author?.displayName || post?.author?.handle || 'Unknown User';
  const authorHandle = post?.author?.handle || '';
  const authorAvatar = post?.author?.avatar;
  const isVideo = post ? isVideoPost(post) : false;

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

  return (
    <Pressable 
      style={[
        styles.container,
        isCurrentUser ? styles.containerRight : styles.containerLeft
      ]}
      onPress={handlePostPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {isVideo ? (
        // Video post - thumbnail with author overlay
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
              size={24}
              name={author.displayName || author.handle}
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
      ) : (
        // Regular post - thumbnail with author overlay if available
        thumbnailUrl ? (
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
                name={author.displayName || author.handle}
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
        ) : null
      )}
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
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '80%',
  },
  authorAvatar: {
    marginRight: 6,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flex: 1,
  },
  // Video post styles - just 9:16 thumbnail
  videoThumbnailContainer: {
    position: 'relative',
    width: 140, // Slightly larger for better visibility
    aspectRatio: 9 / 16, // True 9:16 aspect ratio
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
    backgroundColor: Colors.gray,
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
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
