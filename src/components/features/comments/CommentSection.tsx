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
  TextInput,
  Keyboard,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createQueryKeys } from '../../../services/FeedService';
import { Colors } from '../../ui/UI';
import UI from '../../ui/UI';
import Icon, { HeartFillIcon, MoreFillIcon, CloseFillIcon, Loading3FillIcon } from '../../ui/Icon';
import ProfileCache, { useProfile } from '../../../services/cache/ProfileCache';
import { VerificationBadge } from '../badging';
import RelativeDate from '../../ui/RelativeDate';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../../utils/truesheet/trueSheetUtils';
import { useFocusEffect } from '@react-navigation/native';
import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { formatNumber, formatHandle } from '../../../utils/helpers';
import { useUserSearchTrigger, UserSearchModal } from '../../ui/usersearch';
import CommentItem, { Comment, Like } from './CommentItem';
import { useUserStore } from '../../../stores/userStore';
import { useGlobalCommentSection, useGlobalShareSheet } from '../../../hooks/useGlobalModals';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import AuthorItem from '../../ui/AuthorItem';
import { useRouter } from 'expo-router';
import CommentInputFooter from './CommentInputFooter';

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
  const scrollToCommentUri = globalData?.scrollToCommentUri;
  const handleHeaderSharePress = useCallback(async () => {
    // Dismiss the comment section first
    onDismiss?.();
    
    // Wait for dismiss animation then open share sheet
    setTimeout(() => {
      if (post?.uri && post?.author?.did) {
        presentShareSheet({
          postUri: post.uri,
          postCid: post.cid,
          authorDid: post.author.did,
          authorName: post.author.displayName,
          authorHandle: post.author.handle,
        });
      } else {
        onOpenShareSheet?.();
      }
    }, 300);
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
  
  // Simple scroll ref for active tab
  const currentScrollRef = activeTab === 'comments' ? commentsListRef : likesListRef;

  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const [replyContext, setReplyContext] = useState<{
    authorName: string;
    parentUri: string;
    parentCid: string;
    level: number;
  } | null>(null);

  const inputRef = useRef<any>(null);

  // Get current user's profile for avatar
  const { currentUser } = useUserStore();
  const currentUserHandle = currentUser?.handle || null;
  const { data: currentUserProfile } = useProfile(currentUserHandle);

  const handleReplyPress = useCallback((comment: Comment) => {
    const properUri = comment?.uri || comment?.post?.uri;
    const properCid = comment?.cid || comment?.post?.cid;
    const authorName = formatHandle(comment?.post?.author?.handle || comment?.author?.handle || '') || 'Unknown';
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

  // Clear reply context when post changes or component unmounts
  useEffect(() => {
    return () => {
      setReplyContext(null);
    };
  }, [post?.uri]);

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

  // Scroll to specific comment when scrollToCommentUri is provided
  useEffect(() => {
    if (!scrollToCommentUri || !comments.length || commentsLoading || !commentsListRef.current) return;

    // Recursively search for comment URI in comments and their replies
    const findCommentIndex = (commentList: Comment[], targetUri: string): number => {
      for (let i = 0; i < commentList.length; i++) {
        const comment = commentList[i];
        if (comment.uri === targetUri) return i;
        // Check nested replies
        if (comment.replies && comment.replies.length > 0) {
          const nestedIndex = findCommentIndex(comment.replies, targetUri);
          if (nestedIndex >= 0) return i; // Return parent index if found in replies
        }
      }
      return -1;
    };

    const targetIndex = findCommentIndex(comments, scrollToCommentUri);
    if (targetIndex >= 0 && targetIndex < comments.length) {
      // Delay to ensure FlashList is ready and rendered
      setTimeout(() => {
        try {
          commentsListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0.5,
          });
        } catch (error) {
          // Silently handle scroll errors (index out of bounds, etc.)
        }
      }, 300);
    }
  }, [scrollToCommentUri, comments, commentsLoading]);

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
        highlightUri={scrollToCommentUri}
      />
    ),
    [onDismiss, handleReplyPress, scrollToCommentUri]
  );
  
  const renderLikeItem = useCallback(
    ({ item }: { item: Like }) => <LikeItem like={item} />,
    []
  );

  const commentKeyExtractor = useCallback((item: Comment) => item.uri, []);
  const likeKeyExtractor = useCallback((item: Like) => {
    if (item.uri) return item.uri;
    if (item.actor && item.actor.did && item.createdAt) return `${item.actor.did}-${item.createdAt}`;
    return Math.random().toString(36);
  }, []);


  const handleClose = useCallback(() => {
    setNewCommentText('');
    setActiveTab('comments');
    setLikesQueryEnabled(false);
    setFullscreenImageUri(null);
    setInputSelection({ start: 0, end: 0 });
    setReplyContext(null);
    setIsPosting(false);
    onDismiss?.();
  }, [onDismiss]);

  // Dismiss keyboard when user starts scrolling
  const handleScrollBeginDrag = useCallback(() => {
    Keyboard.dismiss();
    if (inputRef.current?.blur) {
      inputRef.current.blur();
    }
  }, []);

  const LikeItem: React.FC<{ like: Like }> = React.memo(({ like }) => {
    const navigation = useRouter();
    
    const handlePress = () => {
      // Close the comments section first
      onDismiss?.();
      
      // Then navigate to profile after a short delay
      setTimeout(() => {
        navigation.push(`/profile/${like.actor.handle}`);
      }, 100);
    };

    return (
      <AuthorItem
        handle={like.actor.handle}
        displayName={like.actor.displayName}
        avatar={like.actor.avatar}
        size="medium"
        showArrow={false}
        backgroundColor="transparent"
        hideHandleLine={true}
        customFontSize={16}
        onPress={handlePress}
        style={styles.likeItem}
      />
    );
  });


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
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }, [newCommentText, post, replyContext, isPosting, queryClient]);

  // Footer component - extracted to separate component for better performance and maintainability
  const FooterComponent = useMemo(() => {
    const placeholder = replyContext 
      ? `Replying to ${replyContext.authorName}`
      : 'Say something nice...';

    return (
      <CommentInputFooter
        value={newCommentText}
        onChangeText={setNewCommentText}
        inputSelection={inputSelection}
        onSelectionChange={(e) => setInputSelection(e.nativeEvent.selection)}
        placeholder={placeholder}
        onSubmit={handleSendComment}
        onCancelReply={handleCancelReply}
        replyContext={replyContext}
        isPosting={isPosting}
        maxLength={MAX_COMMENT_LENGTH}
        inputRef={inputRef}
        currentUserAvatar={currentUserProfile?.avatar}
        userSearchModalProps={userSearchModalProps}
        mentionInputProps={mentionInputProps}
      />
    );
  }, [
    replyContext,
    newCommentText,
    inputSelection,
    isPosting,
    handleSendComment,
    handleCancelReply,
    currentUserProfile?.avatar,
    userSearchModalProps,
    mentionInputProps,
  ]);

  // Handle TrueSheet visibility
  useEffect(() => {
    if (visible) {
      safePresent('comment-section');
    } else {
      safeDismiss('comment-section');
    }
  }, [visible]);




    // Render header component for TrueSheet header prop
  const headerComponent = (
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
            data={[]}
            renderItem={() => null}
            ListEmptyComponent={() => (
              <View style={styles.loadingContainer}>
                <Loading3FillIcon size={24} color={Colors.lightGray} />
              </View>
            )}
            keyExtractor={() => 'empty'}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScrollBeginDrag={handleScrollBeginDrag}
          />
        );
      }
      
      return (
        <FlashList
          ref={commentsListRef}
          data={post ? comments : []}
          keyExtractor={commentKeyExtractor}
          renderItem={renderCommentItem}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyContent}>
                <Text style={styles.emptyText}>start the conversation</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          scrollEventThrottle={16}
          onScrollBeginDrag={handleScrollBeginDrag}
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
            data={[]}
            renderItem={() => null}
            ListEmptyComponent={() => (
              <View style={styles.loadingContainer}>
                <Loading3FillIcon size={24} color={Colors.lightGray} />
              </View>
            )}
            keyExtractor={() => 'empty'}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScrollBeginDrag={handleScrollBeginDrag}
          />
        );
      }
      
      return (
        <FlashList
          ref={likesListRef}
          data={post ? likes : []}
          keyExtractor={likeKeyExtractor}
          renderItem={renderLikeItem}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyContent}>
                <Text style={styles.emptyText}>be the first like</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          scrollEventThrottle={16}
          onScrollBeginDrag={handleScrollBeginDrag}
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
        detents={scrollToCommentUri ? [1] : [0.5, 1]}
        backgroundColor={Colors.black}
        onDidDismiss={handleClose}
        scrollable
        keyboardMode="pan"
        grabber={false}
        header={headerComponent}
        footer={activeTab === 'comments' ? FooterComponent : undefined}
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
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
    fontFamily: 'Firma-Regular',
    marginRight: 0,
  },
  actionButton: {
    padding: 0,
    marginRight: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
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
    paddingHorizontal: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
    minHeight: 200,
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
    fontFamily: 'Firma-Regular',
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
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 2,
    alignItems: 'flex-start',
  },
});

export default CommentSection;
