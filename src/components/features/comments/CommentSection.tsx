import React, { useState, useEffect, useRef, useCallback, useMemo, JSX } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
  UIManager,
  Dimensions,
  StyleSheet,
  Keyboard,
  KeyboardEvent,
  TouchableWithoutFeedback,
  BackHandler,
  KeyboardAvoidingView,
  Alert,
  Image,
  Modal,
  Pressable,
  Linking,
  FlatList as RNFlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolate,
  runOnJS,
  useAnimatedScrollHandler,
  useDerivedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, FlatList as GHFlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useQuery, useQueryClient, useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { queryKeys } from '../../../services/queryKeys';
import { INTERACTIVE, BRAND } from '../../../utils/formatting/Colors';
import ProfileCache, { profileKeys } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../verification/VerificationBadge';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate, { formatPostDate } from '../../ui/RelativeDate';
import UI from '../../ui/UI';
import PopUpModal from '../../ui/PopUpModal';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView, NativeViewGestureHandler } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetFlatList, BottomSheetTextInput, BottomSheetVirtualizedList } from "@gorhom/bottom-sheet";
import { useFocusEffect } from '@react-navigation/native'; // Only if using React Navigation
import { ListRenderItemInfo } from 'react-native';
import { TouchableOpacity as BottomSheetTouchableOpacity } from '@gorhom/bottom-sheet';
import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import { useUserSearchTrigger, UserSearchModal } from '../../ui/usersearch';
import { useKeyboardState } from 'react-native-keyboard-controller';

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
  likes?: Like[]; // Add likes for likes list
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
      image: any; // For upload
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
  replies?: Comment[]; // Add support for nested replies
  replyCount?: number; // Track number of replies
  isExpanded?: boolean; // To track if replies are expanded
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

interface CommentSectionProps {
  post: Post;
  onDismiss?: () => void;
  visible: boolean;
  totalLikes?: number;
  totalComments?: number;
}

interface UserProfileCache {
  data: UserProfile | null;
  lastFetch: number;
  TTL: number;
}

const userProfileCache: UserProfileCache = {
  data: null,
  lastFetch: 0,
  TTL: 5 * 60 * 1000, // 5 minutes
};

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_TRANSLATE_Y = SCREEN_HEIGHT;
const MIN_TRANSLATE_Y = 0;

type RootStackParamList = {
  AuthorProfile: { handle: string };
};

const CellRendererComponent: React.ComponentType<{
  children: React.ReactNode;
  style?: any;
  index?: number;
}> = React.memo(({ children, style, index }) => {
  return (
    <View style={[style, { overflow: 'hidden' }]} key={`cell-${index}`}>
      {children}
    </View>
  );
});

const SNAP_POINTS = {
  TOP: MIN_TRANSLATE_Y,
  BOTTOM: MAX_TRANSLATE_Y,
};

const LikeItem: React.FC<{ like: Like }> = React.memo(({ like }) => (
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
    paddingHorizontal: 0,
  }}>
    <UI.Avatar
      uri={like.actor.avatar}
      type="profile"
      size={40}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#333',
      }}
    />
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
          {like.actor.displayName || like.actor.handle}
        </Text>
        {like.actor.handle && (
          <VerificationBadge
            handle={like.actor.handle}
            textSize={14}
            textColor="#FFFFFF"
          />
        )}
      </View>
      <Text style={{ color: '#DDDDDD', fontSize: 14 }}>
        @{like.actor.handle}
      </Text>
    </View>
  </View>
));

// --- Memoized LikeItem outside the component to avoid re-creation ---
const MemoizedLikeItem = React.memo(LikeItem);

interface CommentItemProps {
  comment: Comment;
  onDismiss?: () => void;
  onReplyPress?: (comment: Comment) => void;
  rootUri?: string;
  rootCid?: string;
  level?: number; // Track nesting level for indentation
  onImagePress?: (uri: string) => void;
}

const CommentItem: React.FC<CommentItemProps> = React.memo(
  ({ comment, onDismiss, onReplyPress, rootUri, rootCid, level = 0, onImagePress }) => {
    const viewer = comment?.viewer || comment?.post?.viewer || {};
    const stats = comment?.post || comment;
    const [isLiked, setIsLiked] = useState<boolean>(!!viewer.like);
    const [likeCount, setLikeCount] = useState<number>(stats?.likeCount || 0);
    // Always show replies, no toggle functionality
    const queryClient = useQueryClient();
    const [repliesVisible, setRepliesVisible] = useState(false);

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

    const handleLikeComment = useCallback(async () => {
      try {
        if (isLiked) {
          if (!viewer.like) {
            console.error('No like URI found for unlike action');
            return;
          }
          await AtprotoService.deleteLike(viewer.like);
          setIsLiked(false);
          setLikeCount((prev) => Math.max(0, prev - 1));
        } else {
          if (!properUri || !properCid) {
            console.error('Missing URI or CID for like action', comment);
            return;
          }
          const likeURI: string = await AtprotoService.likePost(properUri, properCid);
          setIsLiked(true);
          setLikeCount((prev) => prev + 1);
          if (comment) {
            comment.viewer = comment.viewer || {};
            comment.viewer.like = likeURI;
          }
        }
      } catch (error) {
        console.error('Error liking comment:', error);
        Alert.alert('Error', 'Failed to like comment. Please try again.');
      }
    }, [isLiked, comment, viewer.like, properUri, properCid]);

    const navigation = useNavigation<NavigationProp<RootStackParamList>>();

    const handleAuthorPress = useCallback(
      (handle: string) => {
        if (handle && typeof handle === 'string' && handle.trim() !== '') {
          const cleanHandle = handle.trim();
          // Profiles are now batch prefetched, so we can navigate immediately
          navigation.navigate('AuthorProfile', { handle: cleanHandle });
          if (onDismiss) onDismiss();
        } else {
          console.error('CommentItem: Cannot navigate: Invalid handle:', handle);
        }
      },
      [navigation, onDismiss]
    );

    const handleAuthorAvatarPress = useCallback(() => {
      let handle = null;
      
      // Try to get the handle from either the post author or the comment author
      if (comment?.post?.author?.handle) {
        handle = comment.post.author.handle.trim();
      } else if (comment?.author?.handle) {
        handle = comment.author.handle.trim();
      }
      
      // Only navigate if we have a valid handle
      if (handle && typeof handle === 'string' && handle.trim() !== '') {
        // Ensure we navigate with a clean handle
        const cleanHandle = handle.trim();
        
        // Profiles are now batch prefetched, so we can navigate immediately
        navigation.navigate('AuthorProfile', { handle: cleanHandle });
        if (onDismiss) onDismiss();
      } else {
        console.error('CommentItem: Cannot navigate: Invalid or missing handle', comment?.author, comment?.post?.author);
      }
    }, [comment?.post?.author, comment?.author, navigation, onDismiss]);

    const handleReplyPress = useCallback(() => {
      // Focus the input and set reply context
      if (comment?.author?.handle && properUri && properCid) {
        // Set reply context in the parent component
        queryClient.setQueryData(['replyContext'], {
          authorName,
          parentUri: properUri,
          parentCid: properCid,
          level: level + 1
        });
        
        // Pass the reply information to parent component
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

    // Function to render a vertical line indicating reply nesting
    const renderReplyIndicator = (replyLevel: number) => {
      if (replyLevel === 0) return null;
      
      return (
        <View
          style={{
            position: 'absolute',
            left: 4, // Adjusted to line up with avatar
            top: -4, // Extend slightly above to connect with parent
            bottom: 0,
            width: 1.5,
            backgroundColor: '#444', // More consistent with other UI elements
          }}
        />
      );
    };

    const BLUESKY_CDN = 'https://cdn.bsky.app/img/feed_thumbnail/plain/';

    const LinkThumbnail: React.FC<{ external: { uri: string; thumb?: any; title?: string; description?: string } }> = React.memo(({ external }) => {
      // Only show if uri is a web link (http/https)
      if (!external?.uri || !/^https?:\/\//.test(external.uri)) return null;
      // Try to get a thumbnail image
      let thumbUrl: string | undefined = undefined;
      if (external.thumb && typeof external.thumb === 'object' && external.thumb.ref && external.thumb.ref.$link) {
        // Bluesky CDN blob thumbnail
        thumbUrl = `${BLUESKY_CDN}${external.thumb.ref.$link}@jpeg`;
      } else if (typeof external.thumb === 'string') {
        thumbUrl = external.thumb;
      }
      // Handler to open the link
      const handlePress = () => {
        if (external.uri) {
          Linking.openURL(external.uri).catch(() => {});
        }
      };
      return (
        <Pressable
          onPress={handlePress}
          style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#181818', borderRadius: 10, borderWidth: 1, borderColor: '#333', marginTop: 8, marginBottom: 4, overflow: 'hidden' }}
          android_ripple={{ color: '#222' }}
        >
          {thumbUrl && (
            <Image
              source={{ uri: thumbUrl }}
              style={{ width: 64, height: 64, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, backgroundColor: '#222' }}
              resizeMode="cover"
            />
          )}
          <View style={{ flex: 1, padding: 8, minWidth: 0 }}>
            {external.title && (
              <Text numberOfLines={2} style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>{external.title}</Text>
            )}
            {external.description && (
              <Text numberOfLines={2} style={{ color: '#aaa', fontSize: 13 }}>{external.description}</Text>
            )}
            <Text numberOfLines={1} style={{ color: '#4A90E2', fontSize: 12, marginTop: 2 }}>{external.uri.replace(/^https?:\/\//, '')}</Text>
          </View>
        </Pressable>
      );
    });

    // Function to render embedded images in a comment
    const renderImages = (hasText: boolean) => {
      // Support app.bsky.embed.external structure
      const record = comment?.record || comment?.post?.record;
      const embed = record?.embed || comment?.embed || comment?.post?.embed;
      // Type guard for external embed
      const isExternalEmbed = (e: any): e is { $type: string; external: { uri: string; thumb?: any; description?: string; title?: string } } => {
        return e && typeof e === 'object' && e.$type === 'app.bsky.embed.external' && !!e.external;
      };
      let external: { uri: string; thumb?: any; description?: string; title?: string } | undefined = undefined;
      if (isExternalEmbed(embed)) {
        external = embed.external;
      }
      // Dynamic aspect ratio state
      const [aspectRatio, setAspectRatio] = useState<number | null>(null);
      // Clamp aspect ratio to [0.5, 2.0]
      const getClampedAspectRatio = (ar: number) => Math.max(0.5, Math.min(2.0, ar));
      // Helper: is direct image URL
      const isDirectImageUrl = (url: string) => {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(url.split('?')[0]);
      };
      // If this is a web link, show a link preview card, unless it's a direct image
      if (external && external.uri && /^https?:\/\//.test(external.uri)) {
        if (isDirectImageUrl(external.uri)) {
          // Render as image
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
                <Image
                  source={{ uri: external.uri }}
                  style={[styles.commentImage, imageStyle]}
                  resizeMode="cover"
                  accessible={true}
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
          // Not a direct image, render as link preview
          return <LinkThumbnail external={external} />;
        }
      }
      // Fallback: check for images array (legacy)
      let embedImages: { alt: string; thumb: string; fullsize: string; aspectRatio?: { width: number; height: number } }[] = [];
      if (embed && Array.isArray((embed as any).images)) {
        embedImages = ((embed as any).images).filter((img: any) => img && (img.thumb || img.fullsize));
      }
      if (!embedImages || embedImages.length === 0) {
        return null;
      }
      
      // Determine the best layout based on number of images
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
          // 4 or more images
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
              <Image
                source={{ uri: img.thumb || img.fullsize }}
                style={[
                  styles.commentImage,
                  img.aspectRatio ? {
                    aspectRatio: img.aspectRatio.width / img.aspectRatio.height
                  } : { aspectRatio: 1 }
                ]}
                resizeMode="cover"
                accessible={true}
                accessibilityLabel={img.alt || "Comment image"}
                onError={(e: { nativeEvent: { error: string } }) => {
                  console.warn('Error loading comment image:', e.nativeEvent.error);
                }}
                onLoadStart={() => {
                  // Optional: Add loading state if needed
                }}
                onLoadEnd={() => {
                  // Optional: Remove loading state if needed
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
        <View style={[styles.repliesContainer, { marginLeft: 0, paddingLeft: 0, borderLeftWidth: 0 }]}> {/* Remove extra indentation here */}
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

    // Indentation per level
    const INDENT_PER_LEVEL = 14;

    return (
      <View style={[
        styles.commentThreadContainer,
        { marginLeft: 0, paddingLeft: 0 },
        level > 0 && { marginLeft: INDENT_PER_LEVEL * level },
      ]}>
        <View style={[
          styles.commentItemContainer,
          { zIndex: 1, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#333', paddingHorizontal: 0, alignItems: 'center' },
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
                  borderWidth: 1,
                  borderColor: '#333',
                }}
              />
            </TouchableOpacity>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
                  {authorName}
                </Text>
                {authorHandle && (
                  <VerificationBadge
                    handle={authorHandle}
                    textSize={14}
                    textColor="#FFFFFF"
                  />
                )}
              </View>
              <Text style={{ color: '#DDDDDD', fontSize: 14 }}>
                @{authorHandle}
              </Text>
              {/* Only render text line if there is text */}
              {commentText ? (
                <TextWithAuthorLinks
                  text={commentText}
                  style={{ color: '#fff', fontSize: 15, marginTop: 2 }}
                  onAuthorPress={handleAuthorPress}
                />
              ) : null}
              {/* Render images, pass whether there is text */}
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
              {/* Replies toggle button for comments with replies - moved below meta info */}
              {replyCount > 0 && (
                <TouchableOpacity
                  style={[styles.repliesToggleContainer, { paddingLeft: level > 0 ? 8 : 0 }]}
                  onPress={() => setRepliesVisible(v => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.repliesToggleText}>
                    {repliesVisible
                      ? `Hide ${replyCount === 1 ? 'reply' : 'replies'}`
                      : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.commentActionsContainer}>
            <TouchableOpacity onPress={handleLikeComment} style={styles.likeButton}>
              <Image
                source={
                  isLiked
                    ? require('../../../assets/Vector_Normal.png')
                    : require('../../../assets/Vector_Normal_Grey.png')
                }
                style={styles.likeIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
            {likeCount > 0 && <Text style={styles.likeCount}>{formatNumber(likeCount)}</Text>}
          </View>
        </View>

        {renderReplies()}
      </View>
    );
  }
);

// --- Custom comparison for CommentItem ---
function areEqualCommentItem(prevProps: CommentItemProps, nextProps: CommentItemProps) {
  // Only re-render if the comment object or its key props change
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

const CommentSection: React.FC<CommentSectionProps> = ({
  post,
  onDismiss,
  visible,
  totalLikes = 0,
  totalComments = 0,
}) => {
  const insets = useSafeAreaInsets();
  const [newCommentText, setNewCommentText] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');
  const [likesQueryEnabled, setLikesQueryEnabled] = useState(false); // <-- add
  const bottomSheetRef = useRef<BottomSheet>(null);
  // Only allow max height up to the top safe area (never fullscreen)
  const maxHeight = useMemo(() => Dimensions.get('window').height - insets.top, [insets.top]);
  const snapPoints = useMemo(() => ['60%', maxHeight], [maxHeight]);
  // Fullscreen image state
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const horizontalListRef = useRef<RNFlatList>(null);
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  // --- KeyboardController logic ---
  const { height: keyboardHeight } = useKeyboardState();

  // --- Add reply context state ---
  const [replyContext, setReplyContext] = useState<{
    authorName: string;
    parentUri: string;
    parentCid: string;
    level: number;
  } | null>(null);

  // Ref for the input to focus on reply
  const inputRef = useRef<any>(null);

  // Handler for when a reply is triggered from a comment
  const handleReplyPress = useCallback((comment: Comment) => {
    // Use the same logic as in CommentItem's handleReplyPress
    const properUri = comment?.uri || comment?.post?.uri;
    const properCid = comment?.cid || comment?.post?.cid;
    const authorName = comment?.post?.author?.displayName || comment?.author?.displayName || comment?.post?.author?.handle || comment?.author?.handle || 'Unknown';
    if (properUri && properCid) {
      setReplyContext({
        authorName,
        parentUri: properUri,
        parentCid: properCid,
        level: 1 // Not used for indent, but could be extended
      });
      // Focus the input after setting reply context
      setTimeout(() => {
        inputRef.current?.focus && inputRef.current.focus();
      }, 0);
    }
  }, []);

  // Handler to cancel reply
  const handleCancelReply = useCallback(() => {
    setReplyContext(null);
  }, []);

  // When tab is changed by tap, scroll horizontally
  const handleTabPress = (tabId: string) => {
    setActiveTab(tabId as 'comments' | 'likes');
    const index = tabId === 'comments' ? 0 : 1;
    horizontalListRef.current?.scrollToIndex({ index, animated: true });
    if (tabId === 'likes') setLikesQueryEnabled(true); // <-- enable likes query
  };

  // When horizontal swipe, update tab
  const handleHorizontalScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / Dimensions.get('window').width);
    // Update tab immediately as user swipes
    setActiveTab(index === 0 ? 'comments' : 'likes');
    if (index === 1) setLikesQueryEnabled(true); // <-- enable likes query
  };

  // Fetch comments and likes using react-query
  // Comments infinite query
  const {
    data: commentsPages,
    isLoading: commentsLoading,
    fetchNextPage: fetchNextCommentsPage,
    hasNextPage: hasNextCommentsPage,
    isFetchingNextPage: isFetchingNextCommentsPage,
    refetch: refetchComments,
  } = useInfiniteQuery<{ comments: any[]; cursor: string | null }, Error>({
    queryKey: queryKeys.comments.byPost(post.uri),
    queryFn: ({ pageParam }) => AtprotoService.getComments(post.uri, pageParam as string | null),
    getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post.uri,
  });
  const comments = useMemo(
    () => commentsPages?.pages.flatMap((page) => (page as { comments: any[] }).comments) ?? [],
    [commentsPages]
  );

  // Likes infinite query
  const {
    data: likesPages,
    isLoading: likesLoading,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
    refetch: refetchLikes,
  } = useInfiniteQuery<{ likes: any[]; cursor: string | null }, Error>({
    queryKey: queryKeys.likes.byPost(post.uri),
    queryFn: ({ pageParam }) => AtprotoService.getLikes(post.uri, pageParam as string | null),
    getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post.uri && likesQueryEnabled, // <-- only enabled when likesQueryEnabled is true
  });
  const likes = useMemo(
    () => likesPages?.pages.flatMap((page) => (page as { likes: any[] }).likes) ?? [],
    [likesPages]
  );

  // Memoized renderers
  const renderCommentItem = useCallback(
    ({ item }: { item: Comment }) => (
      <MemoizedCommentItem
        comment={item}
        onDismiss={onDismiss}
        onImagePress={setFullscreenImageUri}
        onReplyPress={handleReplyPress}
      />
    ),
    [onDismiss, handleReplyPress]
  );
  const renderLikeItem = useCallback(
    ({ item }: { item: Like }) => <MemoizedLikeItem like={item} />,
    []
  );

  // Memoized keyExtractors
  const commentKeyExtractor = useCallback((item: Comment) => item.uri, []);
  // Ensure a unique, stable key for likes (prefer like.uri, fallback to actor.did + createdAt)
  const likeKeyExtractor = useCallback((item: Like) => {
    if (item.uri) return item.uri;
    if (item.actor && item.actor.did && item.createdAt) return `${item.actor.did}-${item.createdAt}`;
    return Math.random().toString(36); // fallback (should not happen)
  }, []);

  // Close sheet handler
  const handleClose = useCallback(() => {
    if (onDismiss) onDismiss();
    bottomSheetRef.current?.close();
  }, [onDismiss]);

  // Tab options for TabNavigation
  const tabOptions: TabOption[] = [
    { id: 'comments', label: totalComments > 0 ? `Comments (${formatNumber(totalComments)})` : 'Comments' },
    { id: 'likes', label: totalLikes > 0 ? `Likes (${formatNumber(totalLikes)})` : 'Likes' },
  ];

  // Integrate @-mention user search
  const {
    inputProps: mentionInputProps,
    userSearchModalProps,
  } = useUserSearchTrigger({
    value: newCommentText,
    selection: inputSelection,
    onChangeText: setNewCommentText,
    onSelectionChange: (e) => setInputSelection(e.nativeEvent.selection),
  });

  // --- Add send handler for posting comments/replies ---
  const queryClient = useQueryClient();
  const [isPosting, setIsPosting] = useState(false);
  const MAX_COMMENT_LENGTH = 300;
  const charCount = newCommentText.length;
  const showCharCount = charCount >= 150;
  const handleSendComment = useCallback(async () => {
    if (!newCommentText.trim() || isPosting) return;
    setIsPosting(true);
    try {
      // If replying, use replyContext; else, post to root
      const rootUri = post.uri;
      const rootCid = post.cid || '';
      let parentUri = rootUri;
      let parentCid = rootCid;
      if (replyContext) {
        parentUri = replyContext.parentUri;
        parentCid = replyContext.parentCid;
      }
      await AtprotoService.postComment(
        newCommentText.trim(),
        rootUri,
        rootCid,
        parentUri,
        parentCid
      );
      setNewCommentText('');
      setReplyContext(null);
      // Refetch comments
      queryClient.invalidateQueries({ queryKey: queryKeys.comments.byPost(post.uri) });
    } catch (error) {
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }, [newCommentText, post, replyContext, isPosting, queryClient]);

  if (!visible) return null;

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={0} // open at 60%
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={handleClose}
        keyboardBehavior="extend"
        style={{ zIndex: 100 }}
        backgroundStyle={{ backgroundColor: '#000', borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0.5, borderTopColor: '#333' }}
        handleIndicatorStyle={{ backgroundColor: '#666', width: 40, height: 5 }}
        enableDynamicSizing={false}
      >
        {/* TabNavigation at the top left, matching header style */}
        <View style={{ width: '100%', backgroundColor: '#000', paddingHorizontal: 10, paddingTop: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <TabNavigation
            tabs={tabOptions}
            activeTab={activeTab}
            onTabPress={handleTabPress as any}
                                textColor="#FFFFFF"
            backgroundColor="transparent"
            style={{ marginBottom: 0, paddingVertical: 0, marginTop: 0 }}
            // @ts-ignore: Override tab text size via style
            tabTextStyleOverride={{ fontSize: 18 }}
          />
          <RelativeDate
            dateString={post.indexedAt}
            style={{ color: '#888', fontSize: 15, marginLeft: 10 }}
          />
        </View>
        {/* Horizontal swipeable content */}
        <RNFlatList
          ref={horizontalListRef}
          data={[{ key: 'comments' }, { key: 'likes' }]}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          decelerationRate="fast"
          onScroll={handleHorizontalScroll}
          scrollEventThrottle={16}
          initialScrollIndex={activeTab === 'comments' ? 0 : 1}
          getItemLayout={(_, index) => ({ length: Dimensions.get('window').width, offset: Dimensions.get('window').width * index, index })}
          renderItem={({ item }) => (
            <View style={{ width: Dimensions.get('window').width }}>
              {item.key === 'comments' ? (
                totalComments === 0 ? (
                  <View style={{ flex: 1, justifyContent: 'space-between', minHeight: 220, paddingHorizontal: 0 }}>
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                      <Text style={{ color: '#aaa', fontSize: 17, textAlign: 'center', fontWeight: '500', fontFamily: 'Firma-SemiBold' }}>No comments yet</Text>
                    </View>
                    {/* Input only for comments tab, always at the bottom of the sheet and handled by BottomSheetTextInput */}
                    {/* Show reply context indicator if replying, above the input container */}
                    {replyContext && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#181818', paddingHorizontal: 16, paddingVertical: 6, borderTopLeftRadius: 8, borderTopRightRadius: 8, marginHorizontal: 0, marginTop: 0, marginBottom: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 13, marginRight: 8 }}>
                          Replying to {replyContext.authorName}
                        </Text>
                        <TouchableOpacity onPress={handleCancelReply} style={{ padding: 2 }}>
                          <Text style={{ color: '#007AFF', fontSize: 13 }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={[
                      styles.inputContainer,
                      {
                        paddingBottom: Math.max(insets.bottom, 12),
                        backgroundColor: '#000',
                        borderTopColor: '#333',
                        alignItems: 'flex-start',
                      },
                    ]}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%' }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#1C1C1E', borderRadius: 18, borderWidth: 1, borderColor: '#333', position: 'relative' }}>
                          <BottomSheetTextInput
                            {...mentionInputProps}
                            style={[
                              styles.input,
                              {
                                backgroundColor: 'transparent',
                                color: '#fff',
                                borderColor: 'transparent',
                                flex: 1,
                                borderTopRightRadius: 0,
                                borderBottomRightRadius: 0,
                                minHeight: 36,
                                maxHeight: 100,
                                paddingRight: 0,
                              },
                            ]}
                            placeholder={replyContext ? `Reply to ${replyContext.authorName}...` : 'Add a comment...'}
                            placeholderTextColor="#888"
                            multiline
                            value={newCommentText}
                            onChangeText={setNewCommentText}
                            editable={!isPosting}
                            ref={inputRef}
                            maxLength={MAX_COMMENT_LENGTH + 25} // allow a little overflow for warning
                          />
                          {/* Separator */}
                          <View style={{ width: 1, backgroundColor: '#333', alignSelf: 'stretch', marginVertical: 6 }} />
                          {/* Send button */}
                          <TouchableOpacity
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              alignSelf: 'flex-start',
                              justifyContent: 'center',
                              borderTopRightRadius: 18,
                              borderBottomRightRadius: 18,
                            }}
                            onPress={handleSendComment}
                            disabled={isPosting || !newCommentText.trim() || charCount > MAX_COMMENT_LENGTH}
                          >
                            <UI.Icon name="arrow-up" size={22} color={isPosting || !newCommentText.trim() || charCount > MAX_COMMENT_LENGTH ? '#ccc' : '#fff'} />
                          </TouchableOpacity>
                          {/* Character count centered below send button */}
                          {showCharCount && (
                            <View
                              style={{
                                position: 'absolute',
                                bottom: 6,
                                right: 0,
                                width: 22 + 2 * 10, // icon size + 2 * horizontal padding
                                alignItems: 'center',
                                pointerEvents: 'none',
                              }}
                            >
                              <Text
                                style={{
                                  color: (MAX_COMMENT_LENGTH - charCount) <= 0 ? '#FF4D4F' : '#888',
                                  fontSize: 12,
                                  textAlign: 'center',
                                  marginTop: 4,
                                }}
                              >
                                {MAX_COMMENT_LENGTH - charCount}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* User search modal for @-mention */}
                      <UserSearchModal {...userSearchModalProps} />
                    </View>
                  </View>
                ) : commentsLoading ? (
                  <BottomSheetFlatList
                    data={Array.from({ length: totalComments > 0 ? totalComments : 4 })}
                    renderItem={() => (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 0, borderBottomWidth: 0.5, borderBottomColor: '#333' }}>
                        <ShimmerPlaceholder
                          LinearGradient={LinearGradient}
                          style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, borderWidth: 1, borderColor: '#333' }}
                          shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                        />
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <ShimmerPlaceholder
                            LinearGradient={LinearGradient}
                            style={{ width: '60%', height: 14, borderRadius: 3, marginBottom: 0 }}
                            shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                          />
                          <ShimmerPlaceholder
                            LinearGradient={LinearGradient}
                            style={{ width: '40%', height: 12, borderRadius: 3, marginBottom: 2 }}
                            shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                          />
                          <ShimmerPlaceholder
                            LinearGradient={LinearGradient}
                            style={{ width: '90%', height: 15, borderRadius: 4, marginTop: 2, marginBottom: 4 }}
                            shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                          />
                          <ShimmerPlaceholder
                            LinearGradient={LinearGradient}
                            style={{ width: '30%', height: 10, borderRadius: 2 }}
                            shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                          />
                        </View>
                        <View style={{ alignItems: 'center', justifyContent: 'center', marginLeft: 8, width: 32, alignSelf: 'flex-start' }}>
                          <ShimmerPlaceholder
                            LinearGradient={LinearGradient}
                            style={{ width: 18, height: 18, borderRadius: 9 }}
                            shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                          />
                        </View>
                      </View>
                    )}
                    keyExtractor={(_, idx) => `shimmer-${idx}`}
                    contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
                  />
                ) : (
                  <>
                    <BottomSheetVirtualizedList
                      data={comments}
                      keyExtractor={commentKeyExtractor}
                      getItemCount={(data) => data.length}
                      getItem={(data, index) => data[index]}
                      renderItem={renderCommentItem}
                      contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
                      keyboardShouldPersistTaps="handled"
                      onEndReached={() => {
                        if (hasNextCommentsPage && !isFetchingNextCommentsPage) {
                          fetchNextCommentsPage();
                        }
                      }}
                      onEndReachedThreshold={0.5}
                      initialNumToRender={8}
                      maxToRenderPerBatch={8}
                      windowSize={5}
                      removeClippedSubviews={true}
                    />
                    {/* Input only for comments tab, always at the bottom of the sheet and handled by BottomSheetTextInput */}
                    {/* Show reply context indicator if replying, above the input container */}
                    {replyContext && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#181818', paddingHorizontal: 16, paddingVertical: 6, borderTopLeftRadius: 8, borderTopRightRadius: 8, marginHorizontal: 0, marginTop: 0, marginBottom: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 13, marginRight: 8 }}>
                          Replying to {replyContext.authorName}
                        </Text>
                        <TouchableOpacity onPress={handleCancelReply} style={{ padding: 2 }}>
                          <Text style={{ color: '#007AFF', fontSize: 13 }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={[
                      styles.inputContainer,
                      {
                        paddingBottom: Math.max(insets.bottom, 12),
                        backgroundColor: '#000',
                        borderTopColor: '#333',
                        alignItems: 'flex-start',
                      },
                    ]}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%' }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#1C1C1E', borderRadius: 18, borderWidth: 1, borderColor: '#333', position: 'relative' }}>
                          <BottomSheetTextInput
                            {...mentionInputProps}
                            style={[
                              styles.input,
                              {
                                backgroundColor: 'transparent',
                                color: '#fff',
                                borderColor: 'transparent',
                                flex: 1,
                                borderTopRightRadius: 0,
                                borderBottomRightRadius: 0,
                                minHeight: 36,
                                maxHeight: 100,
                                paddingRight: 0,
                              },
                            ]}
                            placeholder={replyContext ? `Reply to ${replyContext.authorName}...` : 'Add a comment...'}
                            placeholderTextColor="#888"
                            multiline
                            value={newCommentText}
                            onChangeText={setNewCommentText}
                            editable={!isPosting}
                            ref={inputRef}
                            maxLength={MAX_COMMENT_LENGTH + 25} // allow a little overflow for warning
                          />
                          {/* Separator */}
                          <View style={{ width: 1, backgroundColor: '#333', alignSelf: 'stretch', marginVertical: 6 }} />
                          {/* Send button */}
                          <TouchableOpacity
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              alignSelf: 'flex-start',
                              justifyContent: 'center',
                              borderTopRightRadius: 18,
                              borderBottomRightRadius: 18,
                            }}
                            onPress={handleSendComment}
                            disabled={isPosting || !newCommentText.trim() || charCount > MAX_COMMENT_LENGTH}
                          >
                            <UI.Icon name="arrow-up" size={22} color={isPosting || !newCommentText.trim() || charCount > MAX_COMMENT_LENGTH ? '#ccc' : '#fff'} />
                          </TouchableOpacity>
                          {/* Character count centered below send button */}
                          {showCharCount && (
                            <View
                              style={{
                                position: 'absolute',
                                bottom: 6,
                                right: 0,
                                width: 22 + 2 * 10, // icon size + 2 * horizontal padding
                                alignItems: 'center',
                                pointerEvents: 'none',
                              }}
                            >
                              <Text
                                style={{
                                  color: (MAX_COMMENT_LENGTH - charCount) <= 0 ? '#FF4D4F' : '#888',
                                  fontSize: 12,
                                  textAlign: 'center',
                                  marginTop: 4,
                                }}
                              >
                                {MAX_COMMENT_LENGTH - charCount}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* User search modal for @-mention */}
                      <UserSearchModal {...userSearchModalProps} />
                    </View>
                  </>
                )
              ) : (
                totalLikes === 0 ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220, paddingHorizontal: 24 }}>
                    <Text style={{ color: '#aaa', fontSize: 17, textAlign: 'center', fontWeight: '500', fontFamily: 'Firma-SemiBold' }}>No likes yet</Text>
                  </View>
                ) : likesLoading ? (
                  <BottomSheetFlatList
                    data={Array.from({ length: totalLikes > 0 ? totalLikes : 4 })}
                    renderItem={() => (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#333', paddingHorizontal: 0 }}>
                        {/* Avatar shimmer */}
                        <ShimmerPlaceholder
                          LinearGradient={LinearGradient}
                          style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, borderWidth: 1, borderColor: '#333' }}
                          shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                        />
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          {/* First text shimmer */}
                          <ShimmerPlaceholder
                            LinearGradient={LinearGradient}
                            style={{ width: '40%', height: 16, borderRadius: 2, marginBottom: 4 }}
                            shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                          />
                          {/* Second text shimmer */}
                          <ShimmerPlaceholder
                            LinearGradient={LinearGradient}
                            style={{ width: '55%', height: 16, borderRadius: 2 }}
                            shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                          />
                        </View>
                      </View>
                    )}
                    keyExtractor={(_, idx) => `shimmer-like-${idx}`}
                    contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
                  />
                ) : (
                  <BottomSheetVirtualizedList
                    data={likes}
                    keyExtractor={likeKeyExtractor}
                    getItemCount={(data) => data.length}
                    getItem={(data, index) => data[index]}
                    renderItem={renderLikeItem}
                    contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
                    onEndReached={() => {
                      if (hasNextLikesPage && !isFetchingNextLikesPage) {
                        fetchNextLikesPage();
                      }
                    }}
                    onEndReachedThreshold={0.5}
                    initialNumToRender={8}
                    maxToRenderPerBatch={8}
                    windowSize={5}
                    removeClippedSubviews={true}
                  />
                )
              )}
            </View>
          )}
          keyExtractor={item => item.key}
          style={{ flexGrow: 0 }}
          extraData={{ commentsLoading, likesLoading, comments, likes, totalComments, totalLikes, activeTab }}
        />
        {/* Input only for comments tab, always at the bottom of the sheet and handled by BottomSheetTextInput */}
        {/* REMOVE THIS BLOCK: {activeTab === 'comments' && ( ... ) } */}
      </BottomSheet>
      {/* Fullscreen image modal */}
      <Modal
        visible={!!fullscreenImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenImageUri(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setFullscreenImageUri(null)}
        >
          {fullscreenImageUri && (
            <>
              <Image
                source={{ uri: fullscreenImageUri }}
                style={{ width: '95%', height: '80%', resizeMode: 'contain', borderRadius: 12 }}
              />
              {/* Alt text below image, if available */}
              {/* Find alt text for the fullscreen image */}
              {(() => {
                // Search comments and likes for the image and get its alt text
                let altText: string | undefined = undefined;
                // Search comments for embed images or external
                for (const comment of comments) {
                  // Check for external embed
                  const record = comment?.record || comment?.post?.record;
                  const embed = record?.embed || comment?.embed || comment?.post?.embed;
                  // Check for external image
                  if (embed && typeof embed === 'object') {
                    // app.bsky.embed.external
                    if (embed.$type === 'app.bsky.embed.external' && embed.external && embed.external.uri === fullscreenImageUri) {
                      altText = embed.external.description || embed.external.title || undefined;
                      break;
                    }
                    // images array
                    if (Array.isArray(embed.images)) {
                      for (const img of embed.images) {
                        if ((img.fullsize === fullscreenImageUri || img.thumb === fullscreenImageUri) && img.alt) {
                          altText = img.alt;
                          break;
                        }
                      }
                    }
                  }
                  if (altText) break;
                }
                if (altText) {
                  return (
                    <Text style={{ color: '#ccc', fontSize: 15, marginTop: 16, textAlign: 'center', maxWidth: '90%' }}>{altText}</Text>
                  );
                }
                return null;
              })()}
            </>
          )}
          <Pressable
            style={{ position: 'absolute', top: 40, right: 24, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20, padding: 8 }}
            onPress={() => setFullscreenImageUri(null)}
          >
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✕</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
  },
  closeButton: {
    padding: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: UI.Colors.BACKGROUND.PRIMARY,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UI.Colors.BORDER.PRIMARY,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    fontSize: 15,
    backgroundColor: UI.Colors.BACKGROUND.ITEM,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    color: UI.Colors.TEXT.PRIMARY,
    borderWidth: 1,
    borderColor: UI.Colors.BORDER.PRIMARY,
  },
  sendButton: {
    padding: 8,
  },
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
    backgroundColor: '#eee',
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
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  repliesContainer: {
    // Remove marginLeft, borderLeft, and paddingLeft for cleaner nesting
    // marginLeft: 16,
    // borderLeftWidth: 1,
    // borderLeftColor: '#eee',
    // paddingLeft: 8,
  },
  commentThreadContainer: {
    marginBottom: 8,
    backgroundColor: UI.Colors.BACKGROUND.PRIMARY,
  },
  commentItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: UI.Colors.BORDER.PRIMARY,
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
    fontWeight: 'bold',
    color: '#fff',
  },
  commentAuthorNameNested: {
    fontWeight: 'bold',
    color: '#fff',
    fontSize: 14,
  },
  commentText: {
    color: '#fff',
    fontSize: 15,
  },
  commentTextNested: {
    color: '#fff',
    fontSize: 14,
  },
  commentMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  commentTimestamp: {
    fontSize: 12,
    color: '#888',
    marginRight: 12,
  },
  replyButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  replyButtonText: {
    fontSize: 12,
    color: UI.Colors.TEXT.SECONDARY,
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
    color: UI.Colors.BRAND.SECONDARY,
    fontSize: 12.5,
    fontFamily: 'Firma-SemiBold',
    marginTop: 2,
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
  repliesToggleText: {
    color: UI.Colors.TEXT.SECONDARY,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  replyButtonNested: {
    marginLeft: 20,
  },
});

export default CommentSection;