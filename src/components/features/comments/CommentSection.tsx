import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  UIManager,
  Dimensions,
  StyleSheet,
  Alert,
  Image,
  Modal,
  Pressable,
  Linking,
  TextInput,
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
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useQuery, useQueryClient, useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { createQueryKeys } from '../../../services/FeedService';
import { Colors } from '../../ui/UI';
import UI from '../../ui/UI';
import Icon, { HeartFillIcon, MoreFillIcon, CloseFillIcon } from '../../ui/Icon';
import ProfileCache, { profileKeys, useProfile } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../verification/VerificationBadge';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate, { formatPostDate } from '../../ui/RelativeDate';
import PopUpModal from '../../ui/PopUpModal';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { GestureHandlerRootView, NativeViewGestureHandler } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ListRenderItemInfo } from 'react-native';
import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import { useUserSearchTrigger, UserSearchModal } from '../../ui/usersearch';
import { useKeyboardState } from 'react-native-keyboard-controller';
import CommentItem, { Comment, Like } from './CommentItem';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGlobalCommentSection } from '../../../hooks/useGlobalCommentSection';
import { useGlobalShareSheet } from '../../../hooks/useGlobalShareSheet';

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

const LikeItem: React.FC<{ like: Like }> = React.memo(({ like }) => (
  <View style={styles.likeItem}>
    <UI.Avatar
      uri={like.actor.avatar}
      type="profile"
      size={40}
      style={styles.likeAvatar}
    />
    <View style={styles.likeContent}>
      <View style={styles.likeNameRow}>
        <Text style={styles.likeName}>
          {like.actor.displayName || like.actor.handle}
        </Text>
        {like.actor.handle && (
          <VerificationBadge
            handle={like.actor.handle}
            textSize={14}
            textColor={Colors.white}
            autoPosition={true}
          />
        )}
      </View>
    </View>
  </View>
));

const MemoizedLikeItem = React.memo(LikeItem);

interface CommentSectionProps {
  post?: Post;
  onDismiss?: () => void;
  visible?: boolean;
  totalLikes?: number;
  totalComments?: number;
  isLiked?: boolean;
  onOpenShareSheet?: () => void;
  postedAt?: string;
  onToggleLike?: () => void;
  isLikePending?: boolean;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  post: propPost,
  onDismiss: propOnDismiss,
  visible: propVisible,
  totalLikes: propTotalLikes = 0,
  totalComments: propTotalComments = 0,
  isLiked: propIsLiked,
  onOpenShareSheet: propOnOpenShareSheet,
  postedAt: propPostedAt,
  onToggleLike: propOnToggleLike,
  isLikePending: propIsLikePending,
}) => {
  // Get global data from the hook
  const { getCurrentData, dismissCommentSection } = useGlobalCommentSection();
  const globalData = getCurrentData();
  
  // Get global share sheet hook
  const { presentShareSheet } = useGlobalShareSheet();
  
  // Use global data if available, otherwise fall back to props
  const post = globalData?.post || propPost;
  const onDismiss = propOnDismiss || dismissCommentSection;
  const visible = propVisible !== undefined ? propVisible : !!globalData;
  const totalLikes = globalData?.totalLikes ?? propTotalLikes;
  const totalComments = globalData?.totalComments ?? propTotalComments;
  const isLiked = globalData?.isLiked ?? propIsLiked;
  const onOpenShareSheet = propOnOpenShareSheet;
  const postedAt = globalData?.postedAt ?? propPostedAt;
  const onToggleLike = globalData?.onToggleLike ?? propOnToggleLike;
  const isLikePending = globalData?.isLikePending ?? propIsLikePending;
  const handleHeaderSharePress = useCallback(async () => {
    // Dismiss the comment section first to avoid sheet stacking issues
    try {
      await sheetRef.current?.dismiss();
    } catch {}
    
    // Wait a bit for the dismiss animation to complete
    setTimeout(() => {
      // Use global share sheet if post data is available
      if (post?.uri && post?.author?.did) {
        presentShareSheet({
          postUri: post.uri,
          postCid: post.cid,
          authorDid: post.author.did,
          authorName: post.author.displayName || post.author.handle,
          feedOption: undefined, // Not available in comment section context
          sourceFeed: undefined, // Not available in comment section context
        });
      } else {
        // Fallback to prop callback if available
        onOpenShareSheet?.();
      }
    }, ); // Wait 300ms for dismiss animation
    
    onDismiss?.();
  }, [post, presentShareSheet, onOpenShareSheet, onDismiss]);
  
  const insets = useSafeAreaInsets();
  // Local like state fallback for header like button when no external handler is provided
  const [headerIsLiked, setHeaderIsLiked] = useState<boolean>(!!isLiked);
  const [headerLikeUri, setHeaderLikeUri] = useState<string | undefined>(undefined);
  const [headerIsPending, setHeaderIsPending] = useState<boolean>(false);
  const [headerVisualLiked, setHeaderVisualLiked] = useState<boolean>(!!isLiked);
  const headerHeartScale = useSharedValue(1);
  const headerHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerHeartScale.value }],
  }));

  useEffect(() => {
    setHeaderIsLiked(!!isLiked);
    setHeaderVisualLiked(!!isLiked);
  }, [isLiked]);

  const handleHeaderToggleLikeInternal = useCallback(async () => {
    if (!post?.uri || headerIsPending) return;
    try {
      setHeaderIsPending(true);
      const nextLiked = !headerIsLiked;
      setHeaderIsLiked(nextLiked);
      setHeaderVisualLiked(nextLiked);
      // animate only when liking
      if (nextLiked) {
        headerHeartScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
          headerHeartScale.value = withSpring(1);
        });
      }
      if (nextLiked) {
        // Like
        const likeURI = await AtprotoService.likePost(post.uri, post.cid || '');
        setHeaderLikeUri(likeURI);
      } else {
        // Unlike
        if (headerLikeUri) {
          await AtprotoService.deleteLike(headerLikeUri);
          setHeaderLikeUri(undefined);
        } else {
          // Best-effort: if we don't have the like URI, fall back to external handler or revert
          setHeaderIsLiked(true);
        }
      }
    } catch (e) {
      // Revert on failure
      setHeaderIsLiked((prev) => !prev);
    } finally {
      setHeaderIsPending(false);
    }
  }, [post?.uri, post?.cid, headerIsLiked, headerIsPending, headerLikeUri]);

  const handleHeaderToggleLike = useCallback(() => {
    if (onToggleLike) {
      // Optimistic visual feedback even when external handler is used
      const nextLiked = !headerVisualLiked;
      setHeaderVisualLiked(nextLiked);
      if (nextLiked) {
        headerHeartScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
          headerHeartScale.value = withSpring(1);
        });
      } else {
        // reset any lingering animation when unliking
        headerHeartScale.value = withSpring(1);
      }
      onToggleLike();
      return;
    }
    handleHeaderToggleLikeInternal();
  }, [onToggleLike, handleHeaderToggleLikeInternal, headerVisualLiked]);
  const [newCommentText, setNewCommentText] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');
  const [likesQueryEnabled, setLikesQueryEnabled] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  // TrueSheet refs
  const sheetRef = useRef<TrueSheet>(null);
  const commentsListRef = useRef<any>(null);
  const likesListRef = useRef<any>(null);
  
  // Create a stable scrollRef that points to the active list
  const currentScrollRef = useMemo(() => {
    return activeTab === 'comments' ? commentsListRef : likesListRef;
  }, [activeTab]);

  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const { height: keyboardHeight } = useKeyboardState();

  const [replyContext, setReplyContext] = useState<{
    authorName: string;
    parentUri: string;
    parentCid: string;
    level: number;
  } | null>(null);

  const inputRef = useRef<any>(null);
  // Disable auto-engage of input when the comment sheet opens
  const autoFocusOnOpen = false;

  // Get current user's profile for avatar
  const [currentUserHandle, setCurrentUserHandle] = useState<string | null>(null);
  const { data: currentUserProfile } = useProfile(currentUserHandle);

  // Load current user handle
  useEffect(() => {
    const loadCurrentUserHandle = async () => {
      try {
        const storedHandle = await AsyncStorage.getItem('CURRENT_USER_HANDLE');
        if (storedHandle) {
          setCurrentUserHandle(storedHandle);
        } else {
          const user = await AtprotoService.getCurrentUser();
          if (user?.handle) {
            setCurrentUserHandle(user.handle);
          }
        }
      } catch (error) {
        console.error('Error loading current user handle for comment input:', error);
      }
    };

    loadCurrentUserHandle();
  }, []);

  const handleReplyPress = useCallback((comment: Comment) => {
    const properUri = comment?.uri || comment?.post?.uri;
    const properCid = comment?.cid || comment?.post?.cid;
    const authorName = comment?.post?.author?.displayName || comment?.author?.displayName || comment?.post?.author?.handle || comment?.author?.handle || 'Unknown';
    if (properUri && properCid) {
      setReplyContext({
        authorName,
        parentUri: properUri,
        parentCid: properCid,
        level: 1
      });
      // Focus input after a short delay to ensure TrueSheet is ready
      setTimeout(() => {
        if (inputRef.current?.focus) {
          inputRef.current.focus();
        }
      }, 150);
    }
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyContext(null);
    // Keep focus on input after canceling reply
    setTimeout(() => {
      if (inputRef.current?.focus) {
        inputRef.current.focus();
      }
    }, 50);
  }, []);

  const handleTabPress = (tabId: string) => {
    setActiveTab(tabId as 'comments' | 'likes');
    if (tabId === 'likes') setLikesQueryEnabled(true);
  };

  const {
    data: commentsPages,
    isLoading: commentsLoading,
    fetchNextPage: fetchNextCommentsPage,
    hasNextPage: hasNextCommentsPage,
    isFetchingNextPage: isFetchingNextCommentsPage,
    refetch: refetchComments,
  } = useInfiniteQuery<{ comments: any[]; cursor: string | null }, Error>({
    queryKey: createQueryKeys.comments.byPost(post?.uri || ''),
    queryFn: ({ pageParam }) => AtprotoService.getComments(post?.uri || '', pageParam as string | null),
    getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post?.uri,
  });
  const comments = useMemo(
    () => commentsPages?.pages.flatMap((page) => (page as { comments: any[] }).comments) ?? [],
    [commentsPages]
  );

  const {
    data: likesPages,
    isLoading: likesLoading,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
    refetch: refetchLikes,
  } = useInfiniteQuery<{ likes: any[]; cursor: string | null }, Error>({
    queryKey: createQueryKeys.likes.byPost(post?.uri || ''),
    queryFn: ({ pageParam }) => AtprotoService.getLikes(post?.uri || '', pageParam as string | null),
    getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post?.uri && likesQueryEnabled,
  });
  const likes = useMemo(
    () => likesPages?.pages.flatMap((page) => (page as { likes: any[] }).likes) ?? [],
    [likesPages]
  );

  const renderCommentItem = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentItem
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

  const commentKeyExtractor = useCallback((item: Comment) => item.uri, []);
  const likeKeyExtractor = useCallback((item: Like) => {
    if (item.uri) return item.uri;
    if (item.actor && item.actor.did && item.createdAt) return `${item.actor.did}-${item.createdAt}`;
    return Math.random().toString(36);
  }, []);

  const handleClose = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  const tabOptions: TabOption[] = [
    { id: 'comments', label: totalComments > 0 ? `${formatNumber(totalComments)} Comments` : 'Comments' },
    { id: 'likes', label: totalLikes > 0 ? `${formatNumber(totalLikes)} Likes` : 'Likes' },
  ];

  const {
    inputProps: mentionInputProps,
    userSearchModalProps,
  } = useUserSearchTrigger({
    value: newCommentText,
    selection: inputSelection,
    onChangeText: setNewCommentText,
    onSelectionChange: (e) => setInputSelection(e.nativeEvent.selection),
  });

  const queryClient = useQueryClient();
  const [isPosting, setIsPosting] = useState(false);
  const MAX_COMMENT_LENGTH = 300;
  const charCount = newCommentText.length;
  const showCharCount = charCount >= 150;
  
  const handleSendComment = useCallback(async () => {
    if (!newCommentText.trim() || isPosting || !post?.uri) return;
    
    setIsPosting(true);
    const commentText = newCommentText.trim();
    
    try {
      const rootUri = post.uri;
      const rootCid = post.cid || '';
      let parentUri = rootUri;
      let parentCid = rootCid;
      
      if (replyContext) {
        parentUri = replyContext.parentUri;
        parentCid = replyContext.parentCid;
      }
      
      await AtprotoService.postComment(
        commentText,
        rootUri,
        rootCid,
        parentUri,
        parentCid
      );
      
      // Clear input and reply context
      setNewCommentText('');
      setReplyContext(null);
      
      // Invalidate queries to refresh comments
      queryClient.invalidateQueries({ queryKey: createQueryKeys.comments.byPost(post.uri) });
      
      // Keep focus on input after successful post
      setTimeout(() => {
        if (inputRef.current?.focus) {
          inputRef.current.focus();
        }
      }, 100);
      
    } catch (error) {
      console.error('Error posting comment:', error);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }, [newCommentText, post, replyContext, isPosting, queryClient]);

  // Create a stable footer component as ReactElement for TrueSheet compatibility
  const FooterComponent = useMemo(() => {
    const placeholder = (totalComments === 0 ? 'add a comment...' : 'Say something nice...');

    const hasText = newCommentText.trim().length > 0;
    const showSendButton = hasText;
    const isSendDisabled = isPosting || !hasText || charCount > MAX_COMMENT_LENGTH;

    return (
      <View style={[styles.inputContainer, { paddingBottom: Math.max(5, insets.bottom) }]}>
        {replyContext && (
          <View style={styles.replyContextContainer}>
            <Text
              style={styles.replyContextText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {`Replying to ${replyContext.authorName}`}
            </Text>
            <TouchableOpacity
              onPress={handleCancelReply}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Icon name="close" size={18} color={Colors.black} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          {currentUserProfile?.avatar && (
            <View style={styles.avatarContainer}>
              <UI.Avatar
                uri={currentUserProfile.avatar}
                type="profile"
                size={42}
                style={styles.avatar}
              />
            </View>
          )}
          <View style={styles.inputWrapper}>
            <TextInput
              {...mentionInputProps}
              style={styles.textInput}
              placeholder={placeholder}
              placeholderTextColor={Colors.lightGray}
              multiline
              editable={!isPosting}
              ref={inputRef}
              maxLength={MAX_COMMENT_LENGTH + 25}
              keyboardType="default"
              returnKeyType="default"
              blurOnSubmit={false}
              autoCorrect={true}
              autoCapitalize="sentences"
              textAlignVertical="top"
              onFocus={() => {
                // Ensure proper keyboard handling for TrueSheet
                if (Platform.OS === 'ios') {
                  setTimeout(() => {
                    if (inputRef.current?.focus) {
                      inputRef.current.focus();
                    }
                  }, 50);
                }
              }}
            />
          </View>
          <View style={styles.sendColumn}>
            {showSendButton && (
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  isSendDisabled && styles.sendButtonDisabled
                ]}
                onPress={handleSendComment}
                disabled={isSendDisabled}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon 
                  name="send-plane-fill" 
                  size={22} 
                  color={Colors.black}
                />
              </TouchableOpacity>
            )}
            {showCharCount && (
              <Text style={[
                styles.charCountText,
                styles.charCountBelow,
                charCount > MAX_COMMENT_LENGTH && styles.charCountTextError
              ]}>
                {MAX_COMMENT_LENGTH - charCount}
              </Text>
            )}
          </View>
        </View>
        <UserSearchModal {...userSearchModalProps} />
      </View>
    );
  }, [
    mentionInputProps, 
    replyContext, 
    totalComments, 
    newCommentText, 
    isPosting, 
    charCount, 
    showCharCount, 
    handleCancelReply, 
    handleSendComment, 
    userSearchModalProps, 
    currentUserProfile, 
    insets.bottom
  ]);

  // Handle TrueSheet visibility
  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  // Focus input when sheet becomes visible and comments tab is active (disabled by autoFocusOnOpen)
  useFocusEffect(
    useCallback(() => {
      if (autoFocusOnOpen && visible && activeTab === 'comments') {
        const timer = setTimeout(() => {
          if (inputRef.current?.focus) {
            inputRef.current.focus();
          }
        }, 200);
        return () => clearTimeout(timer);
      }
      return () => {};
    }, [visible, activeTab, autoFocusOnOpen])
  );

  // Handle tab changes to focus input when switching to comments (disabled by autoFocusOnOpen)
  useEffect(() => {
    if (autoFocusOnOpen && activeTab === 'comments' && visible) {
      const timer = setTimeout(() => {
        if (inputRef.current?.focus) {
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, visible, autoFocusOnOpen]);



    // Render header component for lists
  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.tabContainer}>
        <TabNavigation
          tabs={tabOptions}
          activeTab={activeTab}
          onTabPress={handleTabPress as any}
          textColor={Colors.white}
          backgroundColor="transparent"
          variant="comments"
          style={styles.tabNavigation}
        />
      </View>
      <View style={styles.headerActions}>
        <RelativeDate
          dateString={postedAt || post?.indexedAt}
          style={styles.dateText}
        />
        <TouchableOpacity
          onPress={handleHeaderSharePress}
          activeOpacity={0.7}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreFillIcon size={20} color={Colors.lightGray} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleHeaderToggleLike}
          activeOpacity={0.7}
          disabled={!!isLikePending || headerIsPending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.actionButton}
        >
          <Animated.View style={headerHeartStyle}>
            <HeartFillIcon size={26} color={(onToggleLike ? headerVisualLiked : headerIsLiked) ? Colors.INTERACTIVE.HEART.ACTIVE : Colors.gray} />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render content based on active tab
  const renderContent = () => {
    if (activeTab === 'comments') {
      if (commentsLoading || !post) {
        return (
          <FlashList
            ref={commentsListRef}
            ListHeaderComponent={renderHeader}
            data={Array.from({ length: 6 })}
            renderItem={() => (
              <View style={styles.shimmerItem}>
                <ShimmerPlaceholder
                  LinearGradient={LinearGradient}
                  style={styles.shimmerAvatar}
                  shimmerColors={Colors.SHIMMER.PRIMARY}
                />
                <View style={styles.shimmerContent}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={styles.shimmerName}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={styles.shimmerText}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                </View>
              </View>
            )}
            keyExtractor={(_, idx) => `shimmer-${idx}`}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
          />
        );
      }
      
      return (
        <FlashList
          ref={commentsListRef}
          ListHeaderComponent={renderHeader}
          data={post ? comments : []}
          keyExtractor={commentKeyExtractor}
          renderItem={renderCommentItem}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyContent}>
                <Text style={styles.emptyText}>no comments yet</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          scrollEventThrottle={16}
          onEndReached={() => {
            if (hasNextCommentsPage && !isFetchingNextCommentsPage) {
              fetchNextCommentsPage();
            }
          }}
          onEndReachedThreshold={0.5}
        />
      );
    } else {
      if (likesLoading || !post) {
        return (
          <FlashList
            ref={likesListRef}
            ListHeaderComponent={renderHeader}
            data={Array.from({ length: 6 })}
            renderItem={() => (
              <View style={styles.shimmerItem}>
                <ShimmerPlaceholder
                  LinearGradient={LinearGradient}
                  style={styles.shimmerAvatar}
                  shimmerColors={Colors.SHIMMER.PRIMARY}
                />
                <View style={styles.shimmerContent}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={styles.shimmerName}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                </View>
              </View>
            )}
            keyExtractor={(_, idx) => `shimmer-like-${idx}`}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
          />
        );
      }
      
      return (
        <FlashList
          ref={likesListRef}
          ListHeaderComponent={renderHeader}
          data={post ? likes : []}
          keyExtractor={likeKeyExtractor}
          renderItem={renderLikeItem}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>no likes yet</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          scrollEventThrottle={16}
          onEndReached={() => {
            if (hasNextLikesPage && !isFetchingNextLikesPage) {
              fetchNextLikesPage();
            }
          }}
          onEndReachedThreshold={0.5}
        />
      );
    }
  };

  return (
    <>
      <TrueSheet
        ref={sheetRef}
        name="comment-section"
        sizes={['medium', 'large']}
        cornerRadius={20}
        backgroundColor={Colors.black}
        onDismiss={handleClose}
        scrollRef={currentScrollRef}
        keyboardMode="pan"
        grabber={false}
        FooterComponent={activeTab === 'comments' ? FooterComponent : undefined}


      >
        <View style={styles.container}>
          {renderContent()}
        </View>
      </TrueSheet>
      
      <Modal
        visible={!!fullscreenImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenImageUri(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setFullscreenImageUri(null)}
        >
          {fullscreenImageUri && (
            <>
              <Image
                source={{ uri: fullscreenImageUri }}
                style={styles.fullscreenImage}
              />
              {(() => {
                let altText: string | undefined = undefined;
                for (const comment of comments) {
                  const record = comment?.record || comment?.post?.record;
                  const embed = record?.embed || comment?.embed || comment?.post?.embed;
                  if (embed && typeof embed === 'object') {
                    if (embed.$type === 'app.bsky.embed.external' && embed.external && embed.external.uri === fullscreenImageUri) {
                      altText = embed.external.description || embed.external.title || undefined;
                      break;
                    }
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
                    <Text style={styles.altText}>{altText}</Text>
                  );
                }
                return null;
              })()}
            </>
          )}
          <Pressable
            style={styles.closeButton}
            onPress={() => setFullscreenImageUri(null)}
          >
            <CloseFillIcon size={28} color={Colors.white} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  tabContainer: {
    flex: 1,
    minWidth: 0,
  },
  tabNavigation: {
    marginBottom: 0,
    paddingVertical: 0,
    marginTop: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: {
    color: Colors.gray,
    fontSize: 15,
    marginRight: 0,
  },
  actionButton: {
    padding: 0,
    marginRight: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 220,
    backgroundColor: Colors.black,
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: Colors.white,
    fontSize: 17,
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  listContent: {
    paddingBottom: 80,
    backgroundColor: Colors.black,
    paddingHorizontal: 10,
  },
  loadingContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: Colors.black,
  },
  loadingShimmer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
  },
  shimmerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  shimmerAvatar: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
  },
  shimmerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  shimmerName: {
    width: '55%',
    height: 18,
    borderRadius: BORDER_RADIUS.SMALL,
    marginBottom: 2,
  },
  shimmerText: {
    width: '85%',
    height: 16,
    borderRadius: BORDER_RADIUS.SMALL,
    marginTop: 2,
  },
  inputContainer: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom:5,
    backgroundColor: 'rgba(0, 0, 0)',
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  sendColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  avatarContainer: {
    marginRight: 10,
    marginTop: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: BORDER_RADIUS.FULL,
    borderWidth: 0,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 0,
    borderColor: 'transparent',
    position: 'relative',
  },
  textInput: {
    backgroundColor: 'transparent',
    color: Colors.white,
    borderColor: 'transparent',
    flex: 1,
    minHeight: 28,
    maxHeight: 120,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    textAlignVertical: 'top',
    fontFamily: 'Firma-Regular',
    fontSize: 18,
    lineHeight: 24,
  },
  sendButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    backgroundColor: Colors.gray,
    borderRadius: BORDER_RADIUS.FULL,
    width: 42,
    height: 42,
    alignItems: 'center',
    marginLeft: 6,
    marginTop: 0,
  },
    charCount: {
      position: 'absolute',
      borderRadius: BORDER_RADIUS.SMALL,
      pointerEvents: 'none',
    },
    charCountBelow: {
      marginTop: 6,
      color: Colors.lightGray,
      fontSize: 11,
      textAlign: 'center',
      fontFamily: 'Firma-Medium',
      width: 42,
      alignSelf: 'center',
    },
    charCountText: {
      color: Colors.lightGray,
      fontSize: 11,
      textAlign: 'center',
      fontFamily: 'Firma-Medium',
    },
    charCountTextError: {
      color: Colors.lightRed,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    replyContextContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: 'white',
      borderRadius: BORDER_RADIUS.MEDIUM,
      marginBottom: 12,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    replyContextText: {
      color: Colors.black,
      fontSize: 14,
      fontFamily: 'Firma-SemiBold',
    },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '95%',
    height: '80%',
    resizeMode: 'contain',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  altText: {
    color: Colors.white,
    fontSize: 15,
    marginTop: 16,
    textAlign: 'center',
    maxWidth: '90%',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BORDER_RADIUS.LARGE,
    padding: 12,
  },
  likeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  likeAvatar: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
    borderWidth: 0,
  },
  likeContent: {
    flex: 1,
    justifyContent: 'center',
  },
  likeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeName: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Firma-Bold',
  },
});

export default CommentSection;
