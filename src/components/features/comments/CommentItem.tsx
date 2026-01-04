import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { prepopulateProfileCache } from '../../../services/cache/ProfileCache';
 
import AtprotoService from '../../../services/api/AtprotoService';
import { createQueryKeys } from '../../../services/FeedService';
import { formatNumber, formatHandle } from '../../../utils/helpers';
import { Colors } from '../../ui/UI';
import UI from '../../ui/UI';
import { HeartFillIcon } from '../../ui/Icon';
import { VerificationBadge } from '../badging';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate from '../../ui/RelativeDate';
import { useCommentStore } from '../../../stores/commentStore';
import { useUserStore } from '../../../stores/userStore';

export interface Comment {
  uri: string;
  cid?: string;
  author?: {
    did?: string;
    displayName?: string;
    handle?: string;
    avatar?: string;
  };
  post?: Comment;
  record?: {
    text: string;
    facets?: Array<{
      index: { byteStart: number; byteEnd: number };
      features: Array<{
        $type: string;
        uri?: string;
        tag?: string;
      }>;
    }>;
    embed?: {
      $type: string;
      images?: {
        image: any;
        alt: string;
      }[];
    };
  };
  indexedAt?: string;
  viewer?: {
    like?: string;
  };
  likeCount?: number;
  replies?: Comment[];
  replyCount?: number;
  isExpanded?: boolean;
  embed?: {
    $type: string;
    images?: {
      alt: string;
      thumb: string;
      fullsize: string;
      aspectRatio?: { width: number; height: number };
    }[];
  };
  parent?: Comment; // Parent comment for threading context
}

export interface Like {
  actor: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  createdAt: string;
  uri: string;
}

interface CommentItemProps {
  comment: Comment;
  onDismiss?: () => void;
  onReplyPress?: (comment: Comment) => void;
  rootUri?: string;
  rootCid?: string;
  level?: number;
  onImagePress?: (uri: string) => void;
  highlightUri?: string;
  onLayoutChange?: () => void;
}

// Helper functions
function getCommentUri(c: Comment) {
  return c?.uri || c?.post?.uri;
}
function getCommentCid(c: Comment) {
  return c?.cid || c?.post?.cid;
}
function getCommentViewerLike(c: Comment) {
  return c?.viewer?.like || c?.post?.viewer?.like;
}
function getCommentLikeCount(c: Comment) {
  return (c?.post?.likeCount ?? c?.likeCount ?? 0) as number;
}
function getCommentText(c: Comment) {
  return c?.post?.record?.text || c?.record?.text || '';
}
function getCommentFacets(c: Comment) {
  return c?.post?.record?.facets || c?.record?.facets;
}
function getCommentEmbed(c: Comment) {
  return c?.post?.record?.embed || c?.record?.embed || c?.embed || c?.post?.embed;
}

const CommentItem: React.FC<CommentItemProps> = React.memo(
  ({ comment, onDismiss, onReplyPress, rootUri, rootCid, level = 0, onImagePress, highlightUri, onLayoutChange }) => {
    const viewer = comment?.viewer || comment?.post?.viewer || {};
    const stats = comment?.post || comment;
    
    const uri = getCommentUri(comment);
    const cid = getCommentCid(comment);
    const viewerLike = getCommentViewerLike(comment);
    
    const { updateCommentInteraction, getCommentInteraction, markCommentAsDeleted } = useCommentStore();
    const { currentUser } = useUserStore();
    
    // Get persisted interaction state from store, with API data as fallback
    // Only use store if we have a valid URI (prevents undefined keys causing shared state)
    const initialLikeCount = getCommentLikeCount(comment);
    const persistedInteraction = uri 
      ? getCommentInteraction(uri, {
          isLiked: !!viewerLike,
          likeCount: initialLikeCount,
          likeUri: viewerLike,
        })
      : {
          isLiked: !!viewerLike,
          likeCount: initialLikeCount,
          likeUri: viewerLike,
        };

    const [isLiked, setIsLiked] = useState<boolean>(persistedInteraction.isLiked);
    const [likeCount, setLikeCount] = useState<number>(persistedInteraction.likeCount);
    const [likeUri, setLikeUri] = useState<string | undefined>(persistedInteraction.likeUri);
    const [isLiking, setIsLiking] = useState(false);

    useEffect(() => {
      // Sync with store when viewerLike changes from API (fresh data from server)
      // Skip store operations if URI is undefined (prevents undefined keys causing shared state)
      if (viewerLike !== undefined && uri) {
        const apiLikeCount = getCommentLikeCount(comment);
        const storeState = getCommentInteraction(uri, {
          isLiked: !!viewerLike,
          likeCount: apiLikeCount,
          likeUri: viewerLike,
        });
        
        // Update local state and store if API data differs (preserves optimistic updates when they match)
        if (storeState.likeUri !== viewerLike) {
          setIsLiked(!!viewerLike);
          setLikeUri(viewerLike);
          updateCommentInteraction(uri, {
            isLiked: !!viewerLike,
            likeUri: viewerLike,
            likeCount: apiLikeCount,
          });
        }
        // Always sync like count from API
        if (storeState.likeCount !== apiLikeCount) {
          setLikeCount(apiLikeCount);
          updateCommentInteraction(uri, {
            likeCount: apiLikeCount,
          });
        }
      } else if (viewerLike !== undefined && !uri) {
        // Update local state even without URI (for display purposes)
        const apiLikeCount = getCommentLikeCount(comment);
        setIsLiked(!!viewerLike);
        setLikeUri(viewerLike);
        setLikeCount(apiLikeCount);
      }
    }, [viewerLike, uri, updateCommentInteraction, getCommentInteraction, comment]);

    const queryClient = useQueryClient();
    
    // Animation values for heart interaction
    const heartScale = useSharedValue(1);
    const heartOpacity = useSharedValue(1);
    const isAnimating = useRef(false);

    // Highlight animation for target comment
    const shouldHighlight = highlightUri && uri === highlightUri;
    const highlightOpacity = useSharedValue(0);
    
    React.useEffect(() => {
      if (shouldHighlight) {
        // Delay highlight start by 500ms to allow comment section to appear
        const delayTimeout = setTimeout(() => {
          // Smooth fade in with ease-out curve for natural feel
          highlightOpacity.value = withTiming(1, { 
            duration: 450,
            easing: Easing.out(Easing.cubic),
          });
          // Then fade out after 2 seconds with smooth ease-in-out curve
          setTimeout(() => {
            highlightOpacity.value = withTiming(0, { 
              duration: 1400,
              easing: Easing.inOut(Easing.cubic),
            });
          }, 2000);
        }, 500);
        
        return () => clearTimeout(delayTimeout);
      }
    }, [shouldHighlight, highlightOpacity]);
    
    const highlightStyle = useAnimatedStyle(() => ({
      backgroundColor: `rgba(129, 136, 150, ${highlightOpacity.value * 0.12})`,
    }));

    const authorName = useMemo(
      () =>
        formatHandle(
          comment?.post?.author?.handle ||
          comment?.author?.handle ||
          ''
        ) || 'Unknown',
      [
        comment?.post?.author?.handle,
        comment?.author?.handle,
      ]
    );
    
    const authorHandle = useMemo(
      () =>
        formatHandle(
          comment?.post?.author?.handle ||
          comment?.author?.handle ||
          ''
        ),
      [comment?.post?.author?.handle, comment?.author?.handle]
    );
    
    const authorDid = useMemo(
      () => comment?.post?.author?.did || comment?.author?.did || null,
      [comment?.post?.author?.did, comment?.author?.did]
    );
    
    const authorAvatar = useMemo(
      () => comment?.post?.author?.avatar || comment?.author?.avatar || 'https://via.placeholder.com/40',
      [comment?.post?.author?.avatar, comment?.author?.avatar]
    );
    
    const commentText = useMemo(
      () => getCommentText(comment),
      [comment]
    );

    const facets = useMemo(
      () => getCommentFacets(comment),
      [comment]
    );

    const parent = comment?.parent;
    const parentAuthorName = useMemo(() => {
      if (!parent) return null;
      return formatHandle(parent?.post?.author?.handle || parent?.author?.handle || '') || 'Unknown';
    }, [parent]);
    
    const parentAuthorHandle = useMemo(() => {
      if (!parent) return null;
      return formatHandle(parent?.post?.author?.handle || parent?.author?.handle || '');
    }, [parent]);
    
    const parentAuthorDid = useMemo(() => {
      if (!parent) return null;
      return parent?.post?.author?.did || parent?.author?.did || null;
    }, [parent]);

    // Animated styles for heart
    const heartAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: heartScale.value }],
      opacity: heartOpacity.value,
    }));

    const animateHeart = useCallback(() => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      // Quick scale up and down animation
      heartScale.value = withSpring(1.3, { duration: 150 }, () => {
        heartScale.value = withSpring(1, { duration: 150 }, () => {
          isAnimating.current = false;
        });
      });

      // Slight opacity pulse
      heartOpacity.value = withTiming(0.8, { duration: 100 }, () => {
        heartOpacity.value = withTiming(1, { duration: 100 });
      });
    }, [heartScale, heartOpacity]);

    const handleLikeComment = useCallback(async () => {
      if (isLiking) return;
      if (!uri || !cid) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setIsLiking(true);
      // Optimistic update - change state immediately
      const newIsLiked = !isLiked;
      const newLikeCount = newIsLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
      
      // Only animate when liking (not when unliking)
      if (newIsLiked) {
        animateHeart();
      }
      
      setIsLiked(newIsLiked);
      setLikeCount(newLikeCount);
      
      try {
        if (newIsLiked) {
          const likeURI: string = await AtprotoService.likePost(uri, cid);
          setLikeUri(likeURI);
          // Persist to store only if URI is valid
          if (uri) {
            updateCommentInteraction(uri, {
              isLiked: true,
              likeCount: newLikeCount,
              likeUri: likeURI,
            });
          }
        } else {
          if (likeUri) {
            await AtprotoService.deleteLike(likeUri);
            setLikeUri(undefined);
            // Persist to store only if URI is valid
            if (uri) {
              updateCommentInteraction(uri, {
                isLiked: false,
                likeCount: newLikeCount,
                likeUri: undefined,
              });
            }
          }
        }
      } catch (error) {
        // Revert optimistic update on error
        setIsLiked(isLiked);
        setLikeCount(likeCount);
        // Persist to store only if URI is valid
        if (uri) {
          updateCommentInteraction(uri, {
            isLiked: isLiked,
            likeCount: likeCount,
            likeUri: likeUri,
          });
        }
        Alert.alert('Error', 'Failed to like comment. Please try again.');
      } finally {
        setIsLiking(false);
      }
    }, [isLiked, likeCount, likeUri, uri, cid, animateHeart, isLiking, updateCommentInteraction]);

    const navigation = useRouter();

    // Modal-aware navigation to AuthorProfile (works inside FeedModal or regular screens)
    const navigateToAuthorProfile = useCallback((rawHandle?: string | null, rawDid?: string | null, authorData?: any) => {
      const cleanHandle = (rawHandle || '').trim();
      const cleanDid = (rawDid || '').trim();
      
      if (!cleanHandle && !cleanDid) {
        return;
      }

      // Pre-populate profile cache with available author data
      if (queryClient && (cleanHandle || cleanDid)) {
        const targetHandle = cleanHandle || authorData?.handle;
        if (targetHandle) {
          prepopulateProfileCache(queryClient, {
            did: cleanDid || authorData?.did,
            handle: targetHandle,
            displayName: authorData?.displayName,
            avatar: authorData?.avatar,
          }, targetHandle);
        }
      }

      // Always dismiss the sheet first if provided
      onDismiss?.();

      // Navigate to profile using Expo Router - prefer DID if available, otherwise use handle
      if (cleanDid) {
        navigation.push({
          pathname: '/profile/[did]',
          params: cleanHandle 
            ? { did: cleanDid, handle: cleanHandle }
            : { did: cleanDid }
        });
      } else if (cleanHandle) {
        navigation.push({
          pathname: '/profile/[did]',
          params: { did: cleanHandle }
        });
      }
    }, [navigation, onDismiss, queryClient]);

    const handleAuthorPress = useCallback(
      (handle: string, did?: string | null, authorData?: any) => {
        navigateToAuthorProfile(handle, did, authorData);
      },
      [navigateToAuthorProfile]
    );

    const handleHashtagPress = useCallback(
      (hashtag: string) => {
        navigation.push({
          pathname: '/(modals)/feed',
          params: {
            feedOption: `hashtag:${hashtag}`,
            backgroundColor: '#000000',
            searchQuery: `#${hashtag}`,
          }
        });
      },
      [navigation]
    );

    const handleAuthorAvatarPress = useCallback(() => {
      let handle = null;
      let authorData = null;
      
      if (comment?.post?.author?.handle) {
        handle = comment.post.author.handle.trim();
        authorData = comment.post.author;
      } else if (comment?.author?.handle) {
        handle = comment.author.handle.trim();
        authorData = comment.author;
      }
      
      if (handle && typeof handle === 'string' && handle.trim() !== '') {
        navigateToAuthorProfile(handle, authorData?.did, authorData);
      }
    }, [comment?.post?.author, comment?.author, navigateToAuthorProfile]);

    const handleReplyPress = useCallback(() => {
      if (authorName && uri && cid) {
        queryClient.setQueryData(['replyContext'], {
          authorName,
          parentUri: uri,
          parentCid: cid,
          level: level + 1
        });
        
        onReplyPress?.({
          ...comment,
          author: {
            ...comment.author,
            displayName: authorName
          }
        });
      }
    }, [authorName, uri, cid, level, queryClient, onReplyPress, comment]);

    // Check if comment belongs to current user
    const commentAuthorDid = comment?.post?.author?.did || comment?.author?.did;
    const isCurrentUserComment = currentUser?.did && commentAuthorDid === currentUser.did;

    // Handle long press to show post actions
    const handleLongPress = useCallback(() => {
      if (!uri || !cid) return;

      // Determine if it's a comment or reply
      const isReply = level > 0 || !!comment?.parent;
      const displayAuthor = isCurrentUserComment ? 'you' : authorName;
      const actionTitle = isReply ? `reply by ${displayAuthor}` : `comment by ${displayAuthor}`;
      const postType = isReply ? 'reply' : 'comment';

      if (isCurrentUserComment) {
        // Current user's post: Pin to profile, Repost, Delete
        Alert.alert(
          actionTitle,
          'Choose an action:',
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Pin to Profile',
              onPress: async () => {
                try {
                  // Note: Pin to profile functionality may not be available in ATProto API
                  Alert.alert('Info', 'Pin to profile feature is not yet available.');
                } catch (error) {
                  Alert.alert('Error', `Failed to pin ${postType}. Please try again.`);
                }
              },
            },
            {
              text: 'Repost',
              onPress: async () => {
                try {
                  await AtprotoService.repostPost(uri, cid);
                  Alert.alert('Success', `${postType.charAt(0).toUpperCase() + postType.slice(1)} reposted successfully.`);
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.comments.byPost(rootUri || '') });
                } catch (error) {
                  Alert.alert('Error', `Failed to repost ${postType}. Please try again.`);
                }
              },
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                const capitalizedPostType = postType.charAt(0).toUpperCase() + postType.slice(1);
                Alert.alert(
                  `Delete ${capitalizedPostType}`,
                  `Are you sure you want to delete this ${postType}? This action cannot be undone.`,
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const success = await AtprotoService.deletePost(uri);
                          if (success) {
                            // Mark as deleted in store for immediate UI update
                            markCommentAsDeleted(uri);
                            Alert.alert('Success', `${capitalizedPostType} deleted successfully.`);
                            queryClient.invalidateQueries({ queryKey: createQueryKeys.comments.byPost(rootUri || '') });
                            queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.all });
                          } else {
                            Alert.alert('Error', `Failed to delete ${postType}. Please try again.`);
                          }
                        } catch (error) {
                          Alert.alert('Error', `Failed to delete ${postType}. Please try again.`);
                        }
                      },
                    },
                  ]
                );
              },
            },
          ]
        );
      } else {
        // Other user's post: Repost, Report Post
        Alert.alert(
          actionTitle,
          'Choose an action:',
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Repost',
              onPress: async () => {
                try {
                  await AtprotoService.repostPost(uri, cid);
                  Alert.alert('Success', `${postType.charAt(0).toUpperCase() + postType.slice(1)} reposted successfully.`);
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.comments.byPost(rootUri || '') });
                } catch (error) {
                  Alert.alert('Error', `Failed to repost ${postType}. Please try again.`);
                }
              },
            },
            {
              text: `Report ${postType.charAt(0).toUpperCase() + postType.slice(1)}`,
              onPress: () => {
                Alert.alert(
                  'Report Content',
                  `Please select a reason for reporting this ${postType}:`,
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Spam',
                      onPress: async () => {
                        try {
                          const success = await AtprotoService.reportContent(uri, 'spam');
                          if (success) {
                            const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
                            useReportedPostsStore.getState().reportPost(uri);
                            Alert.alert('Thank you', 'This content has been reported for review.');
                          } else {
                            Alert.alert('Error', 'Failed to submit report. Please try again.');
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to submit report. Please try again.');
                        }
                      },
                    },
                    {
                      text: 'Harmful Content',
                      onPress: async () => {
                        try {
                          const success = await AtprotoService.reportContent(uri, 'violation');
                          if (success) {
                            const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
                            useReportedPostsStore.getState().reportPost(uri);
                            Alert.alert('Thank you', 'This content has been reported for review.');
                          } else {
                            Alert.alert('Error', 'Failed to submit report. Please try again.');
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to submit report. Please try again.');
                        }
                      },
                    },
                    {
                      text: 'Misleading',
                      onPress: async () => {
                        try {
                          const success = await AtprotoService.reportContent(uri, 'misleading');
                          if (success) {
                            const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
                            useReportedPostsStore.getState().reportPost(uri);
                            Alert.alert('Thank you', 'This content has been reported for review.');
                          } else {
                            Alert.alert('Error', 'Failed to submit report. Please try again.');
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to submit report. Please try again.');
                        }
                      },
                    },
                    {
                      text: 'Sexual Content',
                      onPress: async () => {
                        try {
                          const success = await AtprotoService.reportContent(uri, 'sexual');
                          if (success) {
                            const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
                            useReportedPostsStore.getState().reportPost(uri);
                            Alert.alert('Thank you', 'This content has been reported for review.');
                          } else {
                            Alert.alert('Error', 'Failed to submit report. Please try again.');
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to submit report. Please try again.');
                        }
                      },
                    },
                    {
                      text: 'Rude/Offensive',
                      onPress: async () => {
                        try {
                          const success = await AtprotoService.reportContent(uri, 'rude');
                          if (success) {
                            const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
                            useReportedPostsStore.getState().reportPost(uri);
                            Alert.alert('Thank you', 'This content has been reported for review.');
                          } else {
                            Alert.alert('Error', 'Failed to submit report. Please try again.');
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to submit report. Please try again.');
                        }
                      },
                    },
                    {
                      text: 'Other',
                      onPress: async () => {
                        try {
                          const success = await AtprotoService.reportContent(uri, 'other');
                          if (success) {
                            const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
                            useReportedPostsStore.getState().reportPost(uri);
                            Alert.alert('Thank you', 'This content has been reported for review.');
                          } else {
                            Alert.alert('Error', 'Failed to submit report. Please try again.');
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to submit report. Please try again.');
                        }
                      },
                    },
                  ]
                );
              },
            },
          ]
        );
      }
    }, [uri, cid, isCurrentUserComment, rootUri, queryClient, level, comment?.parent, authorName]);

    const BLUESKY_CDN = 'https://cdn.bsky.app/img/feed_thumbnail/plain/';

    // Shimmer Image Component

    const LinkThumbnail: React.FC<{ external: { uri: string; thumb?: any; title?: string; description?: string } }> = React.memo(({ external }) => {
      if (!external?.uri || !/^https?:\/\//.test(external.uri)) return null;
      
      let thumbUrl: string | undefined = undefined;
      if (external.thumb && typeof external.thumb === 'object' && external.thumb.ref && external.thumb.ref.$link) {
        thumbUrl = `${BLUESKY_CDN}${external.thumb.ref.$link}@jpeg`;
      } else if (typeof external.thumb === 'string') {
        thumbUrl = external.thumb;
      }
      
      const handlePress = () => {
        if (external.uri) {
          Linking.openURL(external.uri).catch(() => {});
        }
      };
      
      return (
        <Pressable
          onPress={handlePress}
          style={styles.linkPreviewContainer}
          android_ripple={{ color: Colors.mediumGray }}
        >
          <View style={styles.linkPreviewContent}>
            {external.title && (
              <Text numberOfLines={2} style={styles.linkPreviewTitle}>
                {external.title}
              </Text>
            )}
            {external.description && (
              <Text numberOfLines={2} style={styles.linkPreviewDescription}>
                {external.description}
              </Text>
            )}
            <Text numberOfLines={1} style={styles.linkPreviewUrl}>
              {external.uri.replace(/^https?:\/\//, '').replace(/^www\./, '')}
            </Text>
          </View>
          <View style={styles.linkPreviewIconContainer}>
            <Text style={styles.linkPreviewIcon}>↗</Text>
          </View>
        </Pressable>
      );
    });

    const renderImages = (hasText: boolean) => {
      const embed = getCommentEmbed(comment);
      
      const isExternalEmbed = (e: any): e is { $type: string; external: { uri: string; thumb?: any; description?: string; title?: string } } => {
        return e && typeof e === 'object' && (e.$type === 'app.bsky.embed.external' || e.$type === 'app.bsky.embed.external#view') && !!e.external;
      };
      
      let external: { uri: string; thumb?: any; description?: string; title?: string } | undefined = undefined;
      if (isExternalEmbed(embed)) {
        external = embed.external;
      }
      
      const getClampedAspectRatio = (ar: number) => Math.max(0.5, Math.min(2.0, ar));
      
      const isDirectImageUrl = (url: string) => {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(url.split('?')[0]);
      };
      
      if (external && external.uri && /^https?:\/\//.test(external.uri)) {
        if (isDirectImageUrl(external.uri)) {
          const maxHeight = hasText ? 220 : 320;
          // Use default aspect ratio to prevent size change on load
          const defaultAspectRatio = 1.5;
          const imageStyle = {
            width: '100%' as const,
            maxHeight,
            marginTop: hasText ? 2 : 0,
            aspectRatio: defaultAspectRatio,
            borderRadius: BORDER_RADIUS.MEDIUM,
          };
          return (
            <View style={styles.commentImagesContainer}>
              <Pressable
                key={external.uri}
                style={[styles.commentImageWrapper, { width: '100%', aspectRatio: defaultAspectRatio }]}
                onPress={() => {
                  if (onImagePress) onImagePress(external.uri);
                }}
              >
                <Image
                  source={{ uri: external.uri }}
                  style={[styles.commentImage, imageStyle]}
                  contentFit="cover"
                  accessible={true}
                  accessibilityLabel={external.description || external.title || 'Comment image'}
                />
              </Pressable>
            </View>
          );
        } else {
          return <LinkThumbnail external={external} />;
        }
      }
      
      let embedImages: { alt: string; thumb: string; fullsize: string; aspectRatio?: { width: number; height: number } }[] = [];
      const isImagesEmbed = embed?.$type === 'app.bsky.embed.images' || embed?.$type === 'app.bsky.embed.images#view';
      if (isImagesEmbed && Array.isArray((embed as any).images)) {
        embedImages = ((embed as any).images).filter((img: any) => img && (img.thumb || img.fullsize));
      }
      if (!embedImages || embedImages.length === 0) {
        return null;
      }
      
      const getImageLayoutStyle = (index: number, totalImages: number) => {
        if (totalImages === 1) {
          return { width: '100%' as any, maxHeight: 300 };
        } else if (totalImages === 2) {
          return { width: '49%' as any, maxHeight: 200 };
        } else if (totalImages === 3) {
          if (index === 0) {
            return { width: '100%' as any, maxHeight: 180 };
          } else {
            return { width: '49%' as any, maxHeight: 120 };
          }
        } else {
          return { width: '49%' as any, maxHeight: 120 };
        }
      };
      
      return (
        <View style={styles.commentImagesContainer}>
          {embedImages.slice(0, 4).map((img: { alt: string; thumb: string; fullsize: string; aspectRatio?: { width: number; height: number } }, idx: number) => {
            // Calculate aspect ratio from embed data or use default
            const aspectRatio = img.aspectRatio 
              ? getClampedAspectRatio(img.aspectRatio.width / img.aspectRatio.height)
              : 1;
            
            return (
              <Pressable 
                key={`${img.thumb || img.fullsize || idx}`} 
                style={[
                  styles.commentImageWrapper,
                  getImageLayoutStyle(idx, Math.min(embedImages.length, 4)),
                  { aspectRatio },
                  idx % 2 === 0 ? { marginRight: '1%' } : { marginLeft: '1%' }
                ]}
                onPress={() => {
                  if (onImagePress && img.fullsize) {
                    onImagePress(img.fullsize);
                  }
                }}
              >
                <Image
                  source={{ uri: img.thumb || img.fullsize }}
                  style={[
                    styles.commentImage,
                    { aspectRatio }
                  ]}
                  contentFit="cover"
                  accessible={true}
                  accessibilityLabel={img.alt || "Comment image"}
                />
              </Pressable>
            );
          })}
          {embedImages.length > 4 && (
            <View style={styles.moreImagesIndicator}>
              <Text style={styles.moreImagesText}>+{embedImages.length - 4} more</Text>
            </View>
          )}
        </View>
      );
    };

    return (
      <View style={[
        styles.commentThreadContainer,
        { marginLeft: 0, paddingLeft: 0 },
        level > 0 && { marginLeft: 14 * level },
      ]}>
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={400}
        >
          <Animated.View style={[
            styles.commentItemContainer,
            { zIndex: 1, paddingVertical: 6, paddingHorizontal: 0, alignItems: 'center' },
          ]}>
          {/* Full-width highlight overlay */}
          {shouldHighlight && (
            <Animated.View 
              style={[
                styles.highlightOverlay,
                highlightStyle,
              ]}
              pointerEvents="none"
            />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1, zIndex: 1 }}>
            <Pressable onPress={handleAuthorAvatarPress}>
              <UI.Avatar
                uri={authorAvatar}
                type="profile"
                size={level > 0 ? 30 : 40}
                style={{
                  width: level > 0 ? 30 : 40,
                  height: level > 0 ? 30 : 40,
                  borderRadius: BORDER_RADIUS.LARGE,
                  marginRight: 12,
                  borderWidth: 0,
                }}
              />
            </Pressable>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => {
                    const authorData = comment?.post?.author || comment?.author;
                    if (authorHandle || authorDid) {
                      handleAuthorPress(authorHandle, authorDid, authorData);
                    }
                  }}
                >
                  <Text style={{ color: Colors.white, fontSize: 16, marginBottom: 2, fontFamily: 'Firma-Bold' }}>
                    {authorName}
                  </Text>
                </Pressable>
                {authorHandle && (
                  <VerificationBadge
                    handle={authorHandle}
                    textSize={16}
                    textColor={Colors.white}
                    autoPosition={true}
                  />
                )}
                {/* Parent context chyron: Author Name → Parent Author Name */}
                {/* Only show if parent is itself a reply (not a direct reply to top-level comment) */}
                {parent && parentAuthorName && level > 0 && parent.parent && (
                  <View style={styles.parentChyronContainer}>
                    <Text style={styles.parentChyronArrow}>→</Text>
                    <Pressable
                      onPress={() => {
                        const parentAuthorData = parent?.post?.author || parent?.author;
                        if (parentAuthorHandle || parentAuthorDid) {
                          handleAuthorPress(parentAuthorHandle, parentAuthorDid, parentAuthorData);
                        }
                      }}
                    >
                      <Text style={styles.parentChyronText} numberOfLines={1}>
                        {parentAuthorName}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {commentText ? (
                <TextWithAuthorLinks
                  text={commentText}
                  style={{ color: Colors.lightGray, fontSize: 15, marginTop: 2, fontFamily: 'Firma-Regular' }}
                  onAuthorPress={handleAuthorPress}
                  onHashtagPress={handleHashtagPress}
                  facets={facets}
                />
              ) : null}
              {renderImages(!!commentText)}
              <View style={styles.commentMetaContainer}>
                <RelativeDate
                  dateString={comment?.indexedAt || comment?.post?.indexedAt}
                  style={styles.commentTimestamp}
                />
                <Pressable onPress={handleReplyPress} style={styles.replyButton}>
                  <Text style={styles.replyButtonText}>Reply</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={styles.commentActionsContainer}>
            <Pressable onPress={handleLikeComment} style={styles.likeButton} disabled={isLiking}>
              <Animated.View style={heartAnimatedStyle}>
                <HeartFillIcon
                  size={20}
                  color={isLiked ? Colors.INTERACTIVE.HEART.ACTIVE : Colors.gray}
                />
              </Animated.View>
            </Pressable>
            {likeCount > 0 && <Text style={styles.likeCount}>{formatNumber(likeCount)}</Text>}
          </View>
        </Animated.View>
        </Pressable>
      </View>
    );
  }
);

function areEqualCommentItem(prevProps: CommentItemProps, nextProps: CommentItemProps) {
  return (
    prevProps.comment === nextProps.comment &&
    prevProps.onDismiss === nextProps.onDismiss &&
    prevProps.onReplyPress === nextProps.onReplyPress &&
    prevProps.rootUri === nextProps.rootUri &&
    prevProps.rootCid === nextProps.rootCid &&
    prevProps.level === nextProps.level &&
    prevProps.onImagePress === nextProps.onImagePress &&
    prevProps.highlightUri === nextProps.highlightUri &&
    prevProps.onLayoutChange === nextProps.onLayoutChange
  );
}

const MemoizedCommentItem = React.memo(CommentItem, areEqualCommentItem);

const styles = StyleSheet.create({
  commentImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 4,
    width: '100%',
  },
  commentImageWrapper: {
    padding: 2,
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.MEDIUM,
    position: 'relative',
    marginBottom: 4,
  },
  commentImage: {
    width: '100%',
    height: 'auto',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  moreImagesIndicator: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  moreImagesText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
  },
  commentThreadContainer: {
    marginBottom: 2,
    backgroundColor: 'transparent',
  },
  commentItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    marginBottom: 2,
    position: 'relative',
  },
  highlightOverlay: {
    position: 'absolute',
    top: 0,
    left: -16,
    right: -16,
    bottom: 0,
    zIndex: -1,
  },
  parentChyronContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  parentChyronArrow: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginRight: 4,
  },
  parentChyronText: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
    maxWidth: 120,
  },
  commentMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  commentTimestamp: {
    fontSize: 12,
    color: Colors.gray,
    fontFamily: 'Firma-Regular',
    marginRight: 12,
  },
  replyButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  replyButtonText: {
    fontSize: 12,
    color: Colors.lightGray,
    fontFamily: 'Firma-Bold',
  },
  commentActionsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 0,
    paddingTop: 4,
    width: 32,
    alignSelf: 'flex-start',
  },
  likeButton: {
    width: '100%',
    alignItems: 'center',
  },
  likeCount: {
    color: Colors.lightGray,
    fontSize: 12.5,
    fontFamily: 'Firma-SemiBold',
    marginTop: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  linkPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginTop: 8,
    marginBottom: 4,
    overflow: 'hidden',
  },
  linkPreviewContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 0,
  },
  linkPreviewTitle: {
    color: Colors.white,
    fontFamily: 'Firma-SemiBold',
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
  linkPreviewDescription: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  linkPreviewUrl: {
    color: Colors.gray,
    fontFamily: 'Firma-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  linkPreviewIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    width: 48,
    alignSelf: 'stretch',
  },
  linkPreviewIcon: {
    fontSize: 18,
    color: Colors.gray,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
  },
});

export default MemoizedCommentItem;
export { CommentItem };
export type { CommentItemProps };

