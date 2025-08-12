import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Pressable,
  Linking,
  Platform,
  UIManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
 
import AtprotoService from '../../../services/api/AtprotoService';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import { Colors } from '../../ui/UI';
import UI from '../../ui/UI';
import { HeartFillIcon } from '../../ui/Icon';
import VerificationBadge from '../verification/VerificationBadge';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate from '../../ui/RelativeDate';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Post {
  uri: string;
  cid?: string;
  likeCount?: number;
  indexedAt?: string;
  comments?: Comment[];
  likes?: Like[];
}

interface UserProfile {
  did: string;
  avatar?: string;
  displayName?: string;
}

interface CommentRecord {
  text: string;
  embed?: {
    $type: string;
    images?: {
      image: any;
      alt: string;
    }[];
  };
}

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
  record?: CommentRecord;
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
}

interface Like {
  actor: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  createdAt: string;
  uri: string;
}

type RootStackParamList = {
  AuthorProfile: { handle: string };
};

interface CommentItemProps {
  comment: Comment;
  onDismiss?: () => void;
  onReplyPress?: (comment: Comment) => void;
  rootUri?: string;
  rootCid?: string;
  level?: number;
  onImagePress?: (uri: string) => void;
}

const CommentItem: React.FC<CommentItemProps> = React.memo(
  ({ comment, onDismiss, onReplyPress, rootUri, rootCid, level = 0, onImagePress }) => {
    const viewer = comment?.viewer || comment?.post?.viewer || {};
    const stats = comment?.post || comment;
    const [isLiked, setIsLiked] = useState<boolean>(!!viewer.like);
    const [likeCount, setLikeCount] = useState<number>(stats?.likeCount || 0);
    const queryClient = useQueryClient();
    const [repliesVisible, setRepliesVisible] = useState(false);

    // Animation values for heart interaction
    const heartScale = useSharedValue(1);
    const heartOpacity = useSharedValue(1);
    const isAnimating = useRef(false);

    // Define the proper URI and CID for the comment
    const properUri = comment?.uri || comment?.post?.uri;
    const properCid = comment?.cid || comment?.post?.cid;

    const authorName = useMemo(
      () =>
        comment?.post?.author?.displayName ||
        comment?.author?.displayName ||
        comment?.post?.author?.handle ||
        comment?.author?.handle ||
        'Unknown',
      [
        comment?.post?.author?.displayName,
        comment?.author?.displayName,
        comment?.post?.author?.handle,
        comment?.author?.handle,
      ]
    );
    
    const authorHandle = useMemo(
      () =>
        comment?.post?.author?.handle ||
        comment?.author?.handle ||
        '',
      [comment?.post?.author?.handle, comment?.author?.handle]
    );
    
    const authorAvatar = useMemo(
      () => comment?.post?.author?.avatar || comment?.author?.avatar || 'https://via.placeholder.com/40',
      [comment?.post?.author?.avatar, comment?.author?.avatar]
    );
    
    const commentText = useMemo(
      () => comment?.post?.record?.text || comment?.record?.text || '',
      [comment?.post?.record?.text, comment?.record?.text]
    );

    const hasReplies = useMemo(() => {
      return Array.isArray(comment?.replies) && comment.replies.length > 0;
    }, [comment?.replies]);

    const replyCount = useMemo(() => {
      return comment?.replyCount || (comment?.replies ? comment.replies.length : 0);
    }, [comment?.replies, comment?.replyCount]);

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
          if (!properUri || !properCid) {
            console.error('Missing URI or CID for like action', comment);
            // Revert on error
            setIsLiked(isLiked);
            setLikeCount(likeCount);
            return;
          }
          const likeURI: string = await AtprotoService.likePost(properUri, properCid);
          if (comment) {
            comment.viewer = comment.viewer || {};
            comment.viewer.like = likeURI;
          }
        } else {
          if (!viewer.like) {
            console.error('No like URI found for unlike action');
            // Revert on error
            setIsLiked(isLiked);
            setLikeCount(likeCount);
            return;
          }
          await AtprotoService.deleteLike(viewer.like);
        }
      } catch (error) {
        console.error('Error liking comment:', error);
        // Revert optimistic update on error
        setIsLiked(isLiked);
        setLikeCount(likeCount);
        Alert.alert('Error', 'Failed to like comment. Please try again.');
      }
    }, [isLiked, likeCount, comment, viewer.like, properUri, properCid, animateHeart]);

    const navigation = useNavigation<NavigationProp<RootStackParamList>>();

    // Modal-aware navigation to AuthorProfile (works inside FeedModal or regular screens)
    const navigateToAuthorProfile = useCallback((rawHandle?: string | null) => {
      const cleanHandle = (rawHandle || '').trim();
      if (!cleanHandle) {
        console.error('CommentItem: Cannot navigate: Invalid handle:', rawHandle);
        return;
      }

      // Always dismiss the sheet first if provided
      onDismiss?.();

      const navState: any = navigation.getState?.();
      const topRouteName: string | undefined = navState?.routes?.[navState?.index || 0]?.name;

      let rootNav: any = navigation as any;
      while (rootNav?.getParent?.()) {
        rootNav = rootNav.getParent();
      }
      rootNav?.navigate?.('AuthorProfile', { handle: cleanHandle });
    }, [navigation, onDismiss]);

    const handleAuthorPress = useCallback(
      (handle: string) => {
        navigateToAuthorProfile(handle);
      },
      [navigateToAuthorProfile]
    );

    const handleAuthorAvatarPress = useCallback(() => {
      let handle = null;
      
      if (comment?.post?.author?.handle) {
        handle = comment.post.author.handle.trim();
      } else if (comment?.author?.handle) {
        handle = comment.author.handle.trim();
      }
      
      if (handle && typeof handle === 'string' && handle.trim() !== '') {
        navigateToAuthorProfile(handle);
      } else {
        console.error('CommentItem: Cannot navigate: Invalid or missing handle', comment?.author, comment?.post?.author);
      }
    }, [comment?.post?.author, comment?.author, navigateToAuthorProfile]);

    const handleReplyPress = useCallback(() => {
      if (comment?.author?.handle && properUri && properCid) {
        queryClient.setQueryData(['replyContext'], {
          authorName,
          parentUri: properUri,
          parentCid: properCid,
          level: level + 1
        });
        
        onReplyPress?.({
          ...comment,
          author: {
            ...comment.author,
            displayName: authorName
          }
        });
      } else {
        console.error('CommentItem: Cannot reply - missing required data', {
          hasAuthor: !!comment?.author,
          hasHandle: !!comment?.author?.handle,
          hasUri: !!properUri,
          hasCid: !!properCid
        });
      }
    }, [authorName, properUri, properCid, level, queryClient, onReplyPress, comment]);

    const BLUESKY_CDN = 'https://cdn.bsky.app/img/feed_thumbnail/plain/';

    // Shimmer Image Component
    const ShimmerImage: React.FC<{
      uri: string;
      style: any;
      onPress?: () => void;
      accessibilityLabel?: string;
      onLoad?: (e: any) => void;
      onError?: (e: any) => void;
    }> = React.memo(({ uri, style, onPress, accessibilityLabel, onLoad, onError }) => {
      const [isLoading, setIsLoading] = useState(true);
      const [hasError, setHasError] = useState(false);

      const handleLoad = (e: any) => {
        setIsLoading(false);
        onLoad?.(e);
      };

      const handleError = (e: any) => {
        setIsLoading(false);
        setHasError(true);
        onError?.(e);
      };

      if (hasError) {
        return null;
      }

      return (
        <>
          {isLoading && (
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={style}
              shimmerColors={Colors.SHIMMER.PRIMARY}
            />
          )}
          {!isLoading && (
            <Image
              source={{ uri }}
              style={style}
              resizeMode="cover"
              accessible={true}
              accessibilityLabel={accessibilityLabel}
              onLoadStart={() => setIsLoading(true)}
              onLoad={handleLoad}
              onError={handleError}
            />
          )}
        </>
      );
    });

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
          style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.darkGray, borderRadius: 10, borderWidth: 1, borderColor: Colors.mediumGray, marginTop: 8, marginBottom: 4, overflow: 'hidden' }}
          android_ripple={{ color: Colors.darkGray }}
        >
          {thumbUrl && (
            <ShimmerImage
              uri={thumbUrl}
              style={{ width: 64, height: 64, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, backgroundColor: Colors.darkGray }}
            />
          )}
          <View style={{ flex: 1, padding: 8, minWidth: 0 }}>
            {external.title && (
              <Text numberOfLines={2} style={{ color: Colors.white, fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>{external.title}</Text>
            )}
            {external.description && (
              <Text numberOfLines={2} style={{ color: Colors.lightGray, fontSize: 13 }}>{external.description}</Text>
            )}
            <Text numberOfLines={1} style={{ color: Colors.lightGray, fontSize: 12, marginTop: 2 }}>{external.uri.replace(/^https?:\/\//, '')}</Text>
          </View>
        </Pressable>
      );
    });

    const renderImages = (hasText: boolean) => {
      const record = comment?.record || comment?.post?.record;
      const embed = record?.embed || comment?.embed || comment?.post?.embed;
      
      const isExternalEmbed = (e: any): e is { $type: string; external: { uri: string; thumb?: any; description?: string; title?: string } } => {
        return e && typeof e === 'object' && e.$type === 'app.bsky.embed.external' && !!e.external;
      };
      
      let external: { uri: string; thumb?: any; description?: string; title?: string } | undefined = undefined;
      if (isExternalEmbed(embed)) {
        external = embed.external;
      }
      
      const [aspectRatio, setAspectRatio] = useState<number | null>(null);
      const getClampedAspectRatio = (ar: number) => Math.max(0.5, Math.min(2.0, ar));
      
      const isDirectImageUrl = (url: string) => {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(url.split('?')[0]);
      };
      
      if (external && external.uri && /^https?:\/\//.test(external.uri)) {
        if (isDirectImageUrl(external.uri)) {
          const maxHeight = hasText ? 220 : 320;
          const imageStyle = {
            width: '100%' as const,
            maxHeight,
            marginTop: hasText ? 2 : 0,
            aspectRatio: aspectRatio ? getClampedAspectRatio(aspectRatio) : 1.5,
            borderRadius: 8,
          };
          return (
            <View style={styles.commentImagesContainer}>
              <TouchableOpacity
                key={external.uri}
                style={[styles.commentImageWrapper, { width: '100%' }]}
                activeOpacity={0.8}
                onPress={() => {
                  if (onImagePress) onImagePress(external.uri);
                }}
              >
                <ShimmerImage
                  uri={external.uri}
                  style={[styles.commentImage, imageStyle]}
                  accessibilityLabel={external.description || external.title || 'Comment image'}
                  onError={(e: { nativeEvent: { error: string } }) => {
                    console.warn('Error loading comment image:', e.nativeEvent.error);
                  }}
                  onLoad={e => {
                    const { width, height } = e.nativeEvent.source;
                    if (width && height) setAspectRatio(width / height);
                  }}
                />
              </TouchableOpacity>
            </View>
          );
        } else {
          return <LinkThumbnail external={external} />;
        }
      }
      
      let embedImages: { alt: string; thumb: string; fullsize: string; aspectRatio?: { width: number; height: number } }[] = [];
      if (embed && Array.isArray((embed as any).images)) {
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
          {embedImages.slice(0, 4).map((img: { alt: string; thumb: string; fullsize: string; aspectRatio?: { width: number; height: number } }, idx: number) => (
            <TouchableOpacity 
              key={`${img.thumb || img.fullsize || idx}`} 
              style={[
                styles.commentImageWrapper,
                getImageLayoutStyle(idx, Math.min(embedImages.length, 4)),
                idx % 2 === 0 ? { marginRight: '1%' } : { marginLeft: '1%' }
              ]}
              activeOpacity={0.8}
              onPress={() => {
                // Future enhancement: open image in fullscreen viewer
              }}
            >
              <ShimmerImage
                uri={img.thumb || img.fullsize}
                style={[
                  styles.commentImage,
                  img.aspectRatio ? {
                    aspectRatio: img.aspectRatio.width / img.aspectRatio.height
                  } : { aspectRatio: 1 }
                ]}
                accessibilityLabel={img.alt || "Comment image"}
                onError={(e: { nativeEvent: { error: string } }) => {
                  console.warn('Error loading comment image:', e.nativeEvent.error);
                }}
              />
            </TouchableOpacity>
          ))}
          {embedImages.length > 4 && (
            <View style={styles.moreImagesIndicator}>
              <Text style={styles.moreImagesText}>+{embedImages.length - 4} more</Text>
            </View>
          )}
        </View>
      );
    };

    function renderReplies(): React.ReactNode {
      if (!repliesVisible || !comment?.replies || !Array.isArray(comment.replies)) {
        return null;
      }
      return (
        <View style={[styles.repliesContainer, { marginLeft: 0, paddingLeft: 0, borderLeftWidth: 0 }]}>
          {comment.replies
            .filter(reply => typeof reply === 'object' && reply !== null)
            .map((reply, index) => (
              <CommentItem
                key={`${reply.uri || reply.cid || index}-${index}`}
                comment={reply}
                onDismiss={onDismiss}
                onReplyPress={onReplyPress}
                rootUri={rootUri}
                rootCid={rootCid}
                level={level + 1}
              />
            ))}
        </View>
      );
    }

    const INDENT_PER_LEVEL = 14;

    return (
      <View style={[
        styles.commentThreadContainer,
        { marginLeft: 0, paddingLeft: 0 },
        level > 0 && { marginLeft: INDENT_PER_LEVEL * level },
      ]}>
        <View style={[
          styles.commentItemContainer,
          { zIndex: 1, paddingVertical: 8, paddingHorizontal: 0, alignItems: 'center' },
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
            <TouchableOpacity onPress={handleAuthorAvatarPress}>
              <UI.Avatar
                uri={authorAvatar}
                type="profile"
                size={40}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  marginRight: 12,
                  borderWidth: 0,
                }}
              />
            </TouchableOpacity>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: Colors.white, fontSize: 16, marginBottom: 2, fontFamily: 'Firma-Bold' }}>
                  {authorName}
                </Text>
                {authorHandle && (
                  <VerificationBadge
                    handle={authorHandle}
                    textSize={16}
                    textColor={Colors.white}
                    autoPosition={true}
                  />
                )}
              </View>

              {commentText ? (
                <TextWithAuthorLinks
                  text={commentText}
                  style={{ color: Colors.lightGray, fontSize: 16, marginTop: 2 }}
                  onAuthorPress={handleAuthorPress}
                />
              ) : null}
              {renderImages(!!commentText)}
              <View style={styles.commentMetaContainer}>
                <RelativeDate
                  dateString={comment?.indexedAt || comment?.post?.indexedAt}
                  style={styles.commentTimestamp}
                />
                <TouchableOpacity onPress={handleReplyPress} style={styles.replyButton}>
                  <Text style={styles.replyButtonText}>Reply</Text>
                </TouchableOpacity>
              </View>
              {replyCount > 0 && (
                <TouchableOpacity
                  style={[styles.repliesToggleContainer, { paddingLeft: level > 0 ? 8 : 0 }]}
                  onPress={() => setRepliesVisible(v => !v)}
                  activeOpacity={0.7}
                >
                  <View style={styles.repliesToggleLine} />
                  <Text style={styles.repliesToggleText}>
                    {repliesVisible
                      ? `hide ${replyCount === 1 ? 'reply' : 'replies'}`
                      : `view ${formatNumber(replyCount)} ${replyCount === 1 ? 'reply' : 'replies'}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.commentActionsContainer}>
            <TouchableOpacity onPress={handleLikeComment} style={styles.likeButton}>
              <Animated.View style={heartAnimatedStyle}>
                <HeartFillIcon
                  size={22}
                  color={isLiked ? Colors.lightRed : Colors.gray}
                />
              </Animated.View>
            </TouchableOpacity>
            {likeCount > 0 && <Text style={styles.likeCount}>{formatNumber(likeCount)}</Text>}
          </View>
        </View>

        {renderReplies()}
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
    prevProps.onImagePress === nextProps.onImagePress
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
    borderRadius: 8,
    position: 'relative',
    marginBottom: 4,
  },
  commentImage: {
    width: 100,
    height: 100,
    borderRadius: 6,
    backgroundColor: Colors.white,
  },
  moreImagesIndicator: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  moreImagesText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  repliesContainer: {
    // Remove marginLeft, borderLeft, and paddingLeft for cleaner nesting
  },
  commentThreadContainer: {
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  commentItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  commentContentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  commentAvatarNested: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  commentAuthorName: {
    fontFamily: 'Firma-Bold',
    color: Colors.white,
  },
  commentAuthorNameNested: {
    fontFamily: 'Firma-Bold',
    color: Colors.white,
    fontSize: 14,
  },
  commentText: {
    color: Colors.white,
    fontSize: 15,
  },
  commentTextNested: {
    color: Colors.white,
    fontSize: 14,
  },
  commentMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  commentTimestamp: {
    fontSize: 12,
    color: Colors.gray,
    marginRight: 12,
  },
  replyButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  replyButtonText: {
    fontSize: 12,
    color: UI.Colors.lightGray,
    fontFamily: 'Firma-Bold',
  },
  commentActionsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    width: 32,
    alignSelf: 'flex-start',
  },
  likeButton: {
    width: '100%',
    alignItems: 'center',
    padding: 4,
  },
  likeIcon: {
    width: 18,
    height: 18,
    marginRight: 0,
  },
  likeIconNested: {
    width: 16,
    height: 16,
  },
  likeCount: {
    color: Colors.lightGray,
    fontSize: 12.5,
    fontFamily: 'Firma-SemiBold',
    marginTop: 0,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  repliesToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  repliesToggleLine: {
    width: 16,
    height: 1,
    backgroundColor: Colors.gray,
    marginRight: 8,
  },
  repliesToggleText: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  replyButtonNested: {
    marginLeft: 20,
  },
});

export default MemoizedCommentItem;
export { CommentItem };
export type { CommentItemProps, Like };
