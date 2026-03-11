import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, Pressable, StyleSheet, Alert, Linking } from 'react-native';
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
import { prefetchProfile, useProfile } from '../../../services/data/ProfileService';
import { useAvatarProfileRing } from '../../../services/colors';

import AtprotoService from '../../../services/api/AtprotoService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { Typography, FontFamily } from '../../../utils/components/typography';
import { hexToRGBA } from '../../../utils/formatting/colors';
import { Colors } from '../../../theme';
import UI from '../../ui/UI';
import { HeartFillIcon } from '../../ui/Icon';
import { VerificationBadge } from '../badging';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate from '../../ui/RelativeDate';
import { useCommentStore } from '../../../stores/commentStore';
import { useUserStore } from '../../../stores/userStore';
import type { Comment } from '../../../services/api/types';

// Extend API Comment type with UI-specific properties
export interface UIComment extends Comment {
  isExpanded?: boolean;
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

// Helper functions - API Comment type has properties directly on comment, not nested in post
function getCommentUri(c: Comment) {
  return c?.uri;
}
function getCommentCid(c: Comment) {
  return c?.cid;
}
function getCommentViewerLike(c: Comment) {
  return c?.viewer?.like;
}
function getCommentLikeCount(c: Comment) {
  return c?.likeCount ?? 0;
}
function getCommentText(c: Comment) {
  return (c?.record as { text?: string })?.text || '';
}
function getCommentFacets(c: Comment) {
  return (c?.record as { facets?: unknown })?.facets;
}
function getCommentEmbed(c: Comment) {
  // Prefer view embed (has thumb/fullsize URLs) over record embed (blob refs)
  const viewEmbed = (c as { embed?: unknown })?.embed;
  const recordEmbed = (c?.record as { embed?: unknown })?.embed;
  return viewEmbed ?? recordEmbed;
}

const ASPECT_RATIO_MIN = 0.35;
const ASPECT_RATIO_MAX = 2.75;
const ASPECT_RATIO_DEFAULT = 1.5;

function clampAspectRatio(ar: number) {
  return Math.max(ASPECT_RATIO_MIN, Math.min(ASPECT_RATIO_MAX, ar));
}

const CommentImage: React.FC<{
  uri: string;
  initialAspectRatio: number;
  wrapperStyle: object;
  imageStyle: object;
  onPress?: () => void;
  accessibilityLabel?: string;
}> = ({ uri, initialAspectRatio, wrapperStyle, imageStyle, onPress, accessibilityLabel }) => {
  // Use fixed aspect ratio to prevent layout shift on load
  const content = (
    <Image
      source={{ uri }}
      style={[styles.commentImage, imageStyle, { aspectRatio: initialAspectRatio }]}
      contentFit="cover"
      accessible={true}
      accessibilityLabel={accessibilityLabel ?? 'Comment image'}
    />
  );

  if (onPress) {
    return (
      <Pressable style={[wrapperStyle, { aspectRatio: initialAspectRatio }]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return <View style={[wrapperStyle, { aspectRatio: initialAspectRatio }]}>{content}</View>;
};

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  onDismiss,
  onReplyPress,
  rootUri,
  rootCid: _rootCid,
  level = 0,
  onImagePress,
  highlightUri,
  onLayoutChange: _onLayoutChange,
}) => {
  const uri = getCommentUri(comment);
  const cid = getCommentCid(comment);
  const viewerLike = getCommentViewerLike(comment);

  const { updateCommentInteraction, getCommentInteraction, markCommentAsDeleted } =
    useCommentStore();
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
    return undefined;
  }, [shouldHighlight, highlightOpacity]);

  const highlightStyle = useAnimatedStyle(() => {
    // neutral.400 (#8891ab) with dynamic opacity for highlight effect
    // Clamp alpha and avoid scientific notation (Reanimated rejects e.g. "6e-9")
    const alpha = highlightOpacity.value * 0.12;
    const safeAlpha = alpha < 0.0001 ? 0 : Math.min(1, alpha);
    return {
      backgroundColor: `rgba(136, 145, 171, ${safeAlpha})`,
    };
  });

  const authorName = useMemo(
    () => formatHandle(comment?.author?.handle || '') || 'Unknown',
    [comment?.author?.handle]
  );

  const authorHandle = useMemo(
    () => formatHandle(comment?.author?.handle || ''),
    [comment?.author?.handle]
  );

  const authorDid = useMemo(() => comment?.author?.did || null, [comment?.author?.did]);

  const authorAvatar = useMemo(
    () => comment?.author?.avatar ?? undefined,
    [comment?.author?.avatar]
  );

  // Get profile data to check if author is blocked
  const { data: authorProfile } = useProfile(comment?.author?.handle);
  const ringProps = useAvatarProfileRing(comment?.author?.did ?? null);
  const isAuthorBlocked = !!(
    authorProfile?.viewer?.blocking || authorProfile?.viewer?.blockingByList
  );

  const commentText = useMemo(() => getCommentText(comment), [comment]);

  const facets = useMemo(() => getCommentFacets(comment), [comment]);

  const parent = comment?.parent;
  const parentAuthorName = useMemo(() => {
    if (!parent) return null;
    return formatHandle(parent?.author?.handle || '') || 'Unknown';
  }, [parent]);

  const parentAuthorHandle = useMemo(() => {
    if (!parent) return null;
    return formatHandle(parent?.author?.handle || '');
  }, [parent]);

  const parentAuthorDid = useMemo(() => {
    if (!parent) return null;
    return parent?.author?.did || null;
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
    // Capture previous state before optimistic update for error revert
    const prevIsLiked = isLiked;
    const prevLikeCount = likeCount;
    const prevLikeUri = likeUri;

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
    } catch (_error) {
      // Revert optimistic update on error using captured previous state
      setIsLiked(prevIsLiked);
      setLikeCount(prevLikeCount);
      setLikeUri(prevLikeUri);
      // Persist to store only if URI is valid
      if (uri) {
        updateCommentInteraction(uri, {
          isLiked: prevIsLiked,
          likeCount: prevLikeCount,
          likeUri: prevLikeUri,
        });
      }
      Alert.alert('Error', 'Failed to like comment. Please try again.');
    } finally {
      setIsLiking(false);
    }
  }, [isLiked, likeCount, likeUri, uri, cid, animateHeart, isLiking, updateCommentInteraction]);

  const navigation = useRouter();

  // Modal-aware navigation to AuthorProfile (works inside FeedModal or regular screens)
  const navigateToAuthorProfile = useCallback(
    (
      rawDid?: string | null,
      authorData?: { did?: string; handle?: string; displayName?: string; avatar?: string }
    ) => {
      const cleanDid = (rawDid || authorData?.did || '').trim();

      if (!cleanDid) {
        return;
      }

      // Prefetch profile: sets partial data immediately + fetches full profile
      if (queryClient && authorData) {
        prefetchProfile(queryClient, cleanDid, {
          did: cleanDid,
          handle: authorData.handle,
          displayName: authorData.displayName,
          avatar: authorData.avatar,
        });
      }

      // Always dismiss the sheet first if provided
      onDismiss?.();

      // Navigate to profile using DID only
      navigation.navigate({
        pathname: '/profile/[did]',
        params: { did: cleanDid },
      });
    },
    [navigation, onDismiss, queryClient]
  );

  // Supports: (handle, did, authorData) from chyron/parent press, and (handle, { did }) from TextWithLinks/Atproto RichText.
  const handleAuthorPress = useCallback(
    (
      _handle: string,
      didOrData?: string | null | { did?: string },
      authorData?: { did?: string; handle?: string; displayName?: string; avatar?: string }
    ) => {
      const rawDid =
        typeof didOrData === 'object' && didOrData && 'did' in didOrData
          ? (didOrData as { did?: string }).did
          : typeof didOrData === 'string' || didOrData === null
            ? didOrData
            : undefined;
      const auth =
        typeof didOrData === 'object' &&
        didOrData &&
        ('handle' in didOrData || 'displayName' in didOrData || 'avatar' in didOrData)
          ? (didOrData as { did?: string; handle?: string; displayName?: string; avatar?: string })
          : authorData;
      navigateToAuthorProfile(rawDid ?? auth?.did ?? undefined, auth);
    },
    [navigateToAuthorProfile]
  );

  const handleHashtagPress = useCallback(
    (hashtag: string) => {
      navigation.navigate({
        pathname: '/(modals)/feed',
        params: {
          feedOption: `hashtag:${hashtag}`,
          backgroundColor: Colors.black,
          searchQuery: `#${hashtag}`,
        },
      });
    },
    [navigation]
  );

  const handleAuthorAvatarPress = useCallback(() => {
    const authorData = comment?.author;
    const did = authorData?.did;

    if (did) {
      navigateToAuthorProfile(
        did,
        authorData
          ? {
              did: authorData.did,
              handle: authorData.handle,
              displayName: authorData.displayName,
              avatar: authorData.avatar,
            }
          : undefined
      );
    }
  }, [comment?.author, navigateToAuthorProfile]);

  const handleReplyPress = useCallback(() => {
    if (authorName && uri && cid) {
      queryClient.setQueryData(['replyContext'], {
        authorName,
        parentUri: uri,
        parentCid: cid,
        level: level + 1,
      });

      onReplyPress?.({
        ...comment,
        author: {
          ...comment.author,
          displayName: authorName,
        },
      });
    }
  }, [authorName, uri, cid, level, queryClient, onReplyPress, comment]);

  // Check if comment belongs to current user
  const commentAuthorDid = comment?.author?.did;
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
      Alert.alert(actionTitle, 'Choose an action:', [
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
            } catch (_error) {
              Alert.alert('Error', `Failed to pin ${postType}. Please try again.`);
            }
          },
        },
        {
          text: 'Repost',
          onPress: async () => {
            try {
              await AtprotoService.repostPost(uri, cid);
              Alert.alert(
                'Success',
                `${postType.charAt(0).toUpperCase() + postType.slice(1)} reposted successfully.`
              );
              queryClient.invalidateQueries({
                queryKey: queryKeys.comments.byPost(rootUri || ''),
                refetchType: 'active',
              });
            } catch (_error) {
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
                        queryClient.invalidateQueries({
                          queryKey: queryKeys.comments.byPost(rootUri || ''),
                          refetchType: 'active',
                        });
                        queryClient.invalidateQueries({
                          queryKey: queryKeys.feed.all,
                          refetchType: 'active',
                        });
                      } else {
                        Alert.alert('Error', `Failed to delete ${postType}. Please try again.`);
                      }
                    } catch (_error) {
                      Alert.alert('Error', `Failed to delete ${postType}. Please try again.`);
                    }
                  },
                },
              ]
            );
          },
        },
      ]);
    } else {
      // Other user's post: Repost, Report Post
      Alert.alert(actionTitle, 'Choose an action:', [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Repost',
          onPress: async () => {
            try {
              await AtprotoService.repostPost(uri, cid);
              Alert.alert(
                'Success',
                `${postType.charAt(0).toUpperCase() + postType.slice(1)} reposted successfully.`
              );
              queryClient.invalidateQueries({
                queryKey: queryKeys.comments.byPost(rootUri || ''),
                refetchType: 'active',
              });
            } catch (_error) {
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
                        const { useReportedPostsStore } =
                          await import('../../../stores/reportedPostsStore');
                        useReportedPostsStore.getState().reportPost(uri);
                        Alert.alert('Thank you', 'This content has been reported for review.');
                      } else {
                        Alert.alert('Error', 'Failed to submit report. Please try again.');
                      }
                    } catch (_error) {
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
                        const { useReportedPostsStore } =
                          await import('../../../stores/reportedPostsStore');
                        useReportedPostsStore.getState().reportPost(uri);
                        Alert.alert('Thank you', 'This content has been reported for review.');
                      } else {
                        Alert.alert('Error', 'Failed to submit report. Please try again.');
                      }
                    } catch (_error) {
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
                        const { useReportedPostsStore } =
                          await import('../../../stores/reportedPostsStore');
                        useReportedPostsStore.getState().reportPost(uri);
                        Alert.alert('Thank you', 'This content has been reported for review.');
                      } else {
                        Alert.alert('Error', 'Failed to submit report. Please try again.');
                      }
                    } catch (_error) {
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
                        const { useReportedPostsStore } =
                          await import('../../../stores/reportedPostsStore');
                        useReportedPostsStore.getState().reportPost(uri);
                        Alert.alert('Thank you', 'This content has been reported for review.');
                      } else {
                        Alert.alert('Error', 'Failed to submit report. Please try again.');
                      }
                    } catch (_error) {
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
                        const { useReportedPostsStore } =
                          await import('../../../stores/reportedPostsStore');
                        useReportedPostsStore.getState().reportPost(uri);
                        Alert.alert('Thank you', 'This content has been reported for review.');
                      } else {
                        Alert.alert('Error', 'Failed to submit report. Please try again.');
                      }
                    } catch (_error) {
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
                        const { useReportedPostsStore } =
                          await import('../../../stores/reportedPostsStore');
                        useReportedPostsStore.getState().reportPost(uri);
                        Alert.alert('Thank you', 'This content has been reported for review.');
                      } else {
                        Alert.alert('Error', 'Failed to submit report. Please try again.');
                      }
                    } catch (_error) {
                      Alert.alert('Error', 'Failed to submit report. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]);
    }
  }, [
    uri,
    cid,
    isCurrentUserComment,
    rootUri,
    queryClient,
    level,
    comment?.parent,
    authorName,
    markCommentAsDeleted,
  ]);

  // BLUESKY_CDN constant removed - not used

  // Shimmer Image Component

  const LinkThumbnailComponent: React.FC<{
    external: {
      uri: string;
      thumb?: string | { ref: { $link: string } };
      title?: string;
      description?: string;
    };
  }> = ({ external }) => {
    if (!external?.uri || !/^https?:\/\//.test(external.uri)) return null;

    const thumbUrl =
      typeof external.thumb === 'string' && external.thumb.startsWith('http')
        ? external.thumb
        : undefined;

    const handlePress = () => {
      if (external.uri) {
        Linking.openURL(external.uri).catch(() => {});
      }
    };

    const hasThumb = !!thumbUrl;

    return (
      <Pressable
        onPress={handlePress}
        style={[styles.linkPreviewContainer, hasThumb && styles.linkPreviewContainerWithThumb]}
        android_ripple={{ color: hexToRGBA(Colors.neutral[400], 0.2) }}
      >
        {hasThumb ? (
          <>
            <View style={styles.linkPreviewThumbWrap}>
              <Image
                source={{ uri: thumbUrl }}
                style={styles.linkPreviewThumb}
                contentFit="cover"
              />
            </View>
            <View style={styles.linkPreviewContent}>
              {external.title ? (
                <Text numberOfLines={2} style={styles.linkPreviewTitle}>
                  {external.title}
                </Text>
              ) : null}
              {external.description ? (
                <Text numberOfLines={external.title ? 1 : 2} style={styles.linkPreviewDescription}>
                  {external.description}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.linkPreviewContentNoThumb}>
            <View style={styles.linkPreviewTextWrap}>
              {external.title ? (
                <Text numberOfLines={2} style={styles.linkPreviewTitleNoThumb}>
                  {external.title}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    );
  };
  LinkThumbnailComponent.displayName = 'LinkThumbnail';
  const LinkThumbnail = React.memo(LinkThumbnailComponent);

  const renderImages = (hasText: boolean) => {
    const embed = getCommentEmbed(comment);

    const isExternalEmbed = (
      e: unknown
    ): e is {
      $type: string;
      external: {
        uri: string;
        thumb?: string | { ref: { $link: string } };
        title?: string;
        description?: string;
      };
    } => {
      if (!e || typeof e !== 'object') return false;
      const obj = e as { $type?: unknown; external?: unknown };
      return (
        (obj.$type === 'app.bsky.embed.external' || obj.$type === 'app.bsky.embed.external#view') &&
        !!obj.external
      );
    };

    let external:
      | {
          uri: string;
          thumb?: string | { ref: { $link: string } };
          description?: string;
          title?: string;
        }
      | undefined = undefined;
    if (isExternalEmbed(embed)) {
      external = embed.external;
    }

    const getClampedAspectRatio = clampAspectRatio;

    const isDirectImageUrl = (url: string) => {
      return /\.(jpg|jpeg|png|gif|webp)$/i.test(url.split('?')[0]);
    };

    if (external && external.uri && /^https?:\/\//.test(external.uri)) {
      if (isDirectImageUrl(external.uri)) {
        const wrapperVariant = hasText
          ? styles.commentImageWrapperWithText
          : styles.commentImageWrapperNoText;
        const imageVariant = hasText
          ? styles.commentImageDirectUrlWithText
          : styles.commentImageDirectUrlNoText;
        return (
          <View style={styles.commentImagesContainer}>
            <CommentImage
              key={external.uri}
              uri={external.uri}
              initialAspectRatio={ASPECT_RATIO_DEFAULT}
              wrapperStyle={[
                styles.commentImageWrapper,
                styles.commentImageWrapperFullWidth,
                wrapperVariant,
              ]}
              imageStyle={imageVariant}
              onPress={() => onImagePress?.(external.uri)}
              accessibilityLabel={external.description || external.title || 'Comment image'}
            />
          </View>
        );
      } else {
        return <LinkThumbnail external={external} />;
      }
    }

    let embedImages: {
      alt: string;
      thumb: string;
      fullsize: string;
      aspectRatio?: { width: number; height: number };
    }[] = [];
    const embedObj = embed as { $type?: string; images?: unknown[] } | undefined;
    const isImagesEmbed =
      embedObj?.$type === 'app.bsky.embed.images' ||
      embedObj?.$type === 'app.bsky.embed.images#view';
    if (isImagesEmbed && Array.isArray(embedObj?.images)) {
      embedImages = (embed as { images: unknown[] }).images.filter(
        (
          img: unknown
        ): img is {
          thumb?: string;
          fullsize?: string;
          alt?: string;
          aspectRatio?: { width: number; height: number };
        } => typeof img === 'object' && img !== null && ('thumb' in img || 'fullsize' in img)
      ) as {
        alt: string;
        thumb: string;
        fullsize: string;
        aspectRatio?: { width: number; height: number };
      }[];
    }
    if (!embedImages || embedImages.length === 0) {
      return null;
    }

    const getImageLayoutStyle = (index: number, totalImages: number) => {
      if (totalImages === 1) return styles.imageLayoutSingle;
      if (totalImages === 2) return styles.imageLayoutDouble;
      if (totalImages === 3)
        return index === 0 ? styles.imageLayoutTripleFirst : styles.imageLayoutTripleRest;
      return styles.imageLayoutQuad;
    };

    return (
      <View style={styles.commentImagesContainer}>
        {embedImages.slice(0, 4).map(
          (
            img: {
              alt: string;
              thumb: string;
              fullsize: string;
              aspectRatio?: { width: number; height: number };
            },
            idx: number
          ) => {
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
                  idx % 2 === 0
                    ? styles.commentImageWrapperMarginRight
                    : styles.commentImageWrapperMarginLeft,
                ]}
                onPress={() => {
                  if (onImagePress && img.fullsize) {
                    onImagePress(img.fullsize);
                  }
                }}
              >
                <Image
                  source={{ uri: img.thumb || img.fullsize }}
                  style={[styles.commentImage, { aspectRatio }]}
                  contentFit="cover"
                  accessible={true}
                  accessibilityLabel={img.alt || 'Comment image'}
                />
              </Pressable>
            );
          }
        )}
        {embedImages.length > 4 && (
          <View style={styles.moreImagesIndicator}>
            <Text style={styles.moreImagesText}>+{embedImages.length - 4} more</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.commentThreadContainer,
        styles.commentThreadRoot,
        level > 0 && { marginLeft: 14 * level },
      ]}
    >
      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        <Animated.View style={[styles.commentItemContainer, styles.commentItemContainerInner]}>
          {/* Full-width highlight overlay */}
          {shouldHighlight && (
            <Animated.View style={[styles.highlightOverlay, highlightStyle]} pointerEvents="none" />
          )}
          <View style={styles.commentItemRow}>
            <Pressable onPress={handleAuthorAvatarPress}>
              <UI.Avatar
                uri={authorAvatar}
                type="profile"
                size={level > 0 ? 30 : 40}
                showRing={ringProps.showRing}
                ringColor={ringProps.ringColor}
                profileColors={ringProps.profileColors}
                blurRadius={isAuthorBlocked ? 30 : 0}
                status={authorProfile?.status}
                style={[styles.commentAvatar, level > 0 && styles.commentAvatarNested]}
              />
            </Pressable>
            <View style={styles.commentItemBody}>
              <View style={styles.commentItemAuthorRow}>
                <Pressable
                  onPress={() => {
                    const authorData = comment?.author;
                    if (authorHandle || authorDid) {
                      handleAuthorPress(authorHandle, authorDid, authorData);
                    }
                  }}
                >
                  <Text style={styles.commentAuthorName}>{authorName}</Text>
                </Pressable>
                {authorHandle && (
                  <VerificationBadge
                    handle={authorHandle}
                    textSize={16}
                    textColor={Colors.neutral[50]}
                  />
                )}
                {parent && parentAuthorName && level > 0 && parent.parent && (
                  <Pressable
                    onPress={() => {
                      const parentAuthorData = parent?.author;
                      if (parentAuthorHandle && typeof parentAuthorHandle === 'string') {
                        handleAuthorPress(
                          parentAuthorHandle,
                          parentAuthorDid ?? undefined,
                          parentAuthorData
                        );
                      }
                    }}
                  >
                    <Text style={styles.parentChyronText} numberOfLines={1}>
                      <Text style={styles.parentChyronArrow}>▸ </Text>
                      {parentAuthorName}
                    </Text>
                  </Pressable>
                )}
              </View>

              {commentText ? (
                <TextWithAuthorLinks
                  text={commentText}
                  style={styles.commentText}
                  onAuthorPress={handleAuthorPress}
                  onHashtagPress={handleHashtagPress}
                  facets={
                    facets as import('../../../utils/types/richText').RichTextFacet[] | undefined
                  }
                />
              ) : null}
              {renderImages(!!commentText)}
              <View style={styles.commentMetaContainer}>
                <RelativeDate dateString={comment?.indexedAt} style={styles.commentTimestamp} />
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
                  color={isLiked ? Colors.coral[500] : Colors.neutral[500]}
                />
              </Animated.View>
            </Pressable>
            {likeCount > 0 && <Text style={styles.likeCount}>{formatNumber(likeCount)}</Text>}
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
};

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
  commentImageWrapperFullWidth: {
    width: '100%',
  },
  commentImageWrapperWithText: {
    marginTop: 2,
    maxHeight: 220,
  },
  commentImageWrapperNoText: {
    marginTop: 0,
    maxHeight: 320,
  },
  commentImageDirectUrlWithText: {
    width: '100%',
    maxHeight: 220,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  commentImageDirectUrlNoText: {
    width: '100%',
    maxHeight: 320,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  commentImageWrapperMarginRight: {
    marginRight: '1%',
  },
  commentImageWrapperMarginLeft: {
    marginLeft: '1%',
  },
  imageLayoutSingle: {
    width: '100%',
    maxHeight: 300,
  },
  imageLayoutDouble: {
    width: '49%',
    maxHeight: 200,
  },
  imageLayoutTripleFirst: {
    width: '100%',
    maxHeight: 180,
  },
  imageLayoutTripleRest: {
    width: '49%',
    maxHeight: 120,
  },
  imageLayoutQuad: {
    width: '49%',
    maxHeight: 120,
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
    backgroundColor: Colors.overlay.black70,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  moreImagesText: {
    color: Colors.neutral[50],
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
  },
  commentThreadContainer: {
    marginBottom: 2,
    backgroundColor: Colors.transparent,
  },
  commentThreadRoot: {
    marginLeft: 0,
    paddingLeft: 0,
  },
  commentItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    backgroundColor: Colors.transparent,
    marginBottom: 2,
    position: 'relative',
  },
  commentItemContainerInner: {
    zIndex: 1,
    paddingVertical: 6,
    paddingHorizontal: 0,
    alignItems: 'center',
  },
  commentItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    zIndex: 1,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
    borderWidth: 0,
  },
  commentAvatarNested: {
    width: 30,
    height: 30,
  },
  commentItemBody: {
    flex: 1,
    justifyContent: 'center',
  },
  commentItemAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  commentAuthorName: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-Bold',
    lineHeight: 20,
  },
  commentText: {
    color: Colors.neutral[200],
    fontSize: 15,
    fontFamily: 'Figtree-Regular',
  },
  highlightOverlay: {
    position: 'absolute',
    top: 0,
    left: -16,
    right: -16,
    bottom: 0,
    zIndex: -1,
  },
  parentChyronArrow: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.regular,
  },
  parentChyronText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.bold,
    maxWidth: 140,
  },
  commentMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  commentTimestamp: {
    fontSize: 12,
    color: Colors.neutral[500],
    fontFamily: 'Figtree-Regular',
    marginRight: 12,
  },
  replyButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  replyButtonText: {
    fontSize: 12,
    color: Colors.neutral[200],
    fontFamily: 'Figtree-Bold',
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
    color: Colors.neutral[200],
    fontSize: 12.5,
    fontFamily: 'Figtree-SemiBold',
    marginTop: 2,
    textAlign: 'center',
    textShadowColor: Colors.overlay.black15,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  linkPreviewContainer: {
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginTop: 8,
    marginBottom: 4,
    overflow: 'hidden',
    backgroundColor: hexToRGBA(Colors.neutral[900], 0.6),
    borderWidth: 1,
    borderColor: hexToRGBA(Colors.neutral[700], 0.5),
  },
  linkPreviewContainerWithThumb: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  linkPreviewThumbWrap: {
    width: '100%',
    aspectRatio: 1200 / 630, // OG image spec (1.91:1)
    backgroundColor: Colors.neutral[900],
  },
  linkPreviewThumb: {
    width: '100%',
    height: '100%',
  },
  linkPreviewContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: 10,
  },
  linkPreviewTitle: {
    color: Colors.neutral[50],
    fontFamily: Typography.families.semibold,
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    marginBottom: 2,
  },
  linkPreviewDescription: {
    color: Colors.neutral[300],
    fontFamily: Typography.families.regular,
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
  },
  linkPreviewContentNoThumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkPreviewTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  linkPreviewTitleNoThumb: {
    color: Colors.neutral[50],
    fontFamily: Typography.families.semibold,
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    marginBottom: 1,
  },
});

export default MemoizedCommentItem;
export { CommentItem };
export type { CommentItemProps };
