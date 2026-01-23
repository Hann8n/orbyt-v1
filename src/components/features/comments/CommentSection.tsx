import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  LayoutAnimation,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { FlashList, ListRenderItem, FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../../utils/components/truesheet/utils';

import AtprotoService from '../../../services/api/AtprotoService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useProfile } from '../../../services/data/ProfileService';
import { useUserStore } from '../../../stores/userStore';
import { usePostInteractionStore } from '../../../stores/postInteractionStore';
import { useCommentStore } from '../../../stores/commentStore';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';
import { useGlobalCommentSection, useGlobalShareSheet } from '../../../hooks/useGlobalModals';

import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { Colors } from '../../ui/UI';
import { HeartFillIcon, MoreFillIcon, CloseFillIcon, Loading3FillIcon } from '../../ui/Icon';
import RelativeDate from '../../ui/RelativeDate';
import AuthorItem from '../../ui/AuthorItem';
import { useUserSearchTrigger } from '../../ui/usersearch';
import { BORDER_RADIUS } from '../../../utils/constants';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import CommentInputFooter from './CommentInputFooter';
import CommentItem from './CommentItem';
import type { Comment, Like } from '../../../services/api/types';

/**
 * Types (kept compatible with your current usage)
 */

// CommentRecord interface removed - using Comment type from API instead

// Re-export types from API
export type { Comment, Like } from '../../../services/api/types';

interface Post {
  uri: string;
  cid?: string;
  indexedAt?: string;
  author?: {
    did: string;
    handle: string;
    displayName?: string;
  };
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

const COMMENT_ITEM_ESTIMATE = 150;
const LIKE_ITEM_ESTIMATE = 72;
const END_REACHED_THRESHOLD = 0.45;
const MAX_COMMENT_LENGTH = 300;

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
  const { getCurrentData, dismissCommentSection } = useGlobalCommentSection();
  const globalData = getCurrentData();

  const { presentShareSheet } = useGlobalShareSheet();

  const post = globalData?.post || propPost;
  const onDismiss = propOnDismiss || dismissCommentSection;
  const visible = propVisible !== undefined ? propVisible : !!globalData;

  const totalLikes = globalData?.totalLikes ?? propTotalLikes;
  const totalComments = globalData?.totalComments ?? propTotalComments;
  const isLiked = globalData?.isLiked ?? propIsLiked;
  const postedAt = globalData?.postedAt ?? propPostedAt;
  const onToggleLike = globalData?.onToggleLike ?? propOnToggleLike;
  const isLikePending = globalData?.isLikePending ?? propIsLikePending;
  const scrollToCommentUri = globalData?.scrollToCommentUri;

  const insets = useSafeAreaInsets();
  const listBottomPadding = 96 + (typeof insets?.bottom === 'number' ? insets.bottom : 0);
  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: listBottomPadding }],
    [listBottomPadding]
  );

  const sheetRef = useRef<TrueSheet>(null);
  const commentsListRef = useRef<FlashListRef<Comment> | null>(null);
  const likesListRef = useRef<FlashListRef<Like> | null>(null);

  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');
  const [likesQueryEnabled, setLikesQueryEnabled] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  const [newCommentText, setNewCommentText] = useState('');
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const inputRef = useRef<TextInput>(null);

  const [replyContext, setReplyContext] = useState<{
    authorName: string;
    parentUri: string;
    parentCid: string;
  } | null>(null);

  const handleCancelReply = useCallback(() => {
    setReplyContext(null);
    setTimeout(() => inputRef.current?.focus?.(), 50);
  }, []);

  const handleReplyPress = useCallback((comment: Comment) => {
    const uri = comment?.uri;
    const cid = comment?.cid;
    const authorName = formatHandle(comment?.author?.handle || '') || 'Unknown';

    if (!uri || !cid) return;

    setReplyContext({ authorName, parentUri: uri, parentCid: cid });
    setTimeout(() => inputRef.current?.focus?.(), 150);
  }, []);

  const { currentUser } = useUserStore();
  const currentUserHandle = currentUser?.handle || null;
  const { data: currentUserProfile } = useProfile(currentUserHandle);

  const { inputProps: mentionInputProps, userSearchModalProps } = useUserSearchTrigger({
    value: newCommentText,
    selection: inputSelection,
    onChangeText: setNewCommentText,
    onSelectionChange: e => setInputSelection(e.nativeEvent.selection),
  });

  const { updatePostInteraction, getPostInteraction } = usePostInteractionStore();
  const deletedComments = useCommentStore(state => state.deletedComments);

  const [headerIsLiked, setHeaderIsLiked] = useState<boolean>(() => {
    if (!post?.uri || onToggleLike) {
      return !!isLiked;
    }
    return getPostInteraction(post.uri, {
      isLiked: !!isLiked,
      likeCount: totalLikes,
      likeUri: undefined,
      isReposted: false,
      isBookmarked: false,
      repostCount: 0,
    }).isLiked;
  });

  const [headerLikeUri, setHeaderLikeUri] = useState<string | undefined>(() => {
    if (!post?.uri || onToggleLike) {
      return undefined;
    }
    return getPostInteraction(post.uri, {
      isLiked: !!isLiked,
      likeCount: totalLikes,
      likeUri: undefined,
      isReposted: false,
      isBookmarked: false,
      repostCount: 0,
    }).likeUri;
  });

  const [headerIsPending, setHeaderIsPending] = useState<boolean>(false);

  const [headerVisualLiked, setHeaderVisualLiked] = useState<boolean>(() => {
    if (!post?.uri || onToggleLike) {
      return !!isLiked;
    }
    return getPostInteraction(post.uri, {
      isLiked: !!isLiked,
      likeCount: totalLikes,
      likeUri: undefined,
      isReposted: false,
      isBookmarked: false,
      repostCount: 0,
    }).isLiked;
  });

  useEffect(() => {
    if (onToggleLike) {
      setHeaderIsLiked(!!isLiked);
      setHeaderVisualLiked(!!isLiked);
      return;
    }

    if (post?.uri && isLiked !== undefined) {
      const storeState = getPostInteraction(post.uri, {
        isLiked: !!isLiked,
        likeCount: totalLikes,
        likeUri: undefined,
        isReposted: false,
        isBookmarked: false,
        repostCount: 0,
      });

      if (storeState.isLiked !== !!isLiked) {
        setHeaderIsLiked(!!isLiked);
        setHeaderVisualLiked(!!isLiked);
        updatePostInteraction(post.uri, {
          isLiked: !!isLiked,
          likeCount: totalLikes,
        });
      }
      if (storeState.likeCount !== totalLikes) {
        updatePostInteraction(post.uri, {
          likeCount: totalLikes,
        });
      }
    }
  }, [isLiked, totalLikes, post?.uri, onToggleLike, getPostInteraction, updatePostInteraction]);

  const headerHeartScale = useSharedValue(1);
  const headerHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerHeartScale.value }],
  }));

  const handleHeaderToggleLikeInternal = useCallback(async () => {
    if (!post?.uri || headerIsPending) return;

    const storeState = getPostInteraction(post.uri, {
      isLiked: !!isLiked,
      likeCount: totalLikes,
      likeUri: undefined,
      isReposted: false,
      isBookmarked: false,
      repostCount: 0,
    });
    const currentLikeCount = storeState.likeCount;
    const newIsLiked = !headerIsLiked;
    const newLikeCount = newIsLiked ? currentLikeCount + 1 : Math.max(0, currentLikeCount - 1);

    setHeaderIsPending(true);
    setHeaderIsLiked(newIsLiked);
    setHeaderVisualLiked(newIsLiked);

    try {
      if (newIsLiked) {
        headerHeartScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
          headerHeartScale.value = withSpring(1);
        });
        const likeURI = await AtprotoService.likePost(post.uri, post.cid || '');
        setHeaderLikeUri(likeURI);
        updatePostInteraction(post.uri, {
          isLiked: true,
          likeCount: newLikeCount,
          likeUri: likeURI,
        });
      } else {
        if (headerLikeUri) {
          await AtprotoService.deleteLike(headerLikeUri);
          setHeaderLikeUri(undefined);
          updatePostInteraction(post.uri, {
            isLiked: false,
            likeCount: newLikeCount,
            likeUri: undefined,
          });
        } else {
          setHeaderIsLiked(true);
          setHeaderVisualLiked(true);
          updatePostInteraction(post.uri, {
            isLiked: true,
            likeCount: currentLikeCount,
          });
        }
      }
    } catch {
      setHeaderIsLiked(headerIsLiked);
      setHeaderVisualLiked(headerIsLiked);
      updatePostInteraction(post.uri, {
        isLiked: headerIsLiked,
        likeCount: currentLikeCount,
        likeUri: headerLikeUri,
      });
    } finally {
      setHeaderIsPending(false);
    }
  }, [
    post?.uri,
    post?.cid,
    headerIsPending,
    headerIsLiked,
    headerLikeUri,
    headerHeartScale,
    isLiked,
    totalLikes,
    getPostInteraction,
    updatePostInteraction,
  ]);

  const handleHeaderToggleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onToggleLike) {
      const next = !headerVisualLiked;
      setHeaderVisualLiked(next);
      if (next) {
        headerHeartScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
          headerHeartScale.value = withSpring(1);
        });
      } else {
        headerHeartScale.value = withSpring(1);
      }
      onToggleLike();
      return;
    }
    handleHeaderToggleLikeInternal();
  }, [onToggleLike, headerVisualLiked, headerHeartScale, handleHeaderToggleLikeInternal]);

  const handleHeaderSharePress = useCallback(() => {
    onDismiss?.();

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
        propOnOpenShareSheet?.();
      }
    }, 300);
  }, [onDismiss, post, presentShareSheet, propOnOpenShareSheet]);

  const queryClient = useQueryClient();

  const {
    data: commentsPages,
    isLoading: commentsLoading,
    fetchNextPage: fetchNextCommentsPage,
    hasNextPage: hasNextCommentsPage,
    isFetchingNextPage: isFetchingNextCommentsPage,
  } = useInfiniteQuery<{ comments: Comment[]; cursor: string | null }, Error>({
    queryKey: queryKeys.comments.byPost(post?.uri || ''),
    queryFn: ({ pageParam }) =>
      AtprotoService.getComments(post?.uri || '', pageParam as string | null),
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post?.uri,
    structuralSharing: false, // Disable structural sharing to avoid circular reference issues with nested comment structures
  });

  const comments = useMemo(
    () => commentsPages?.pages.flatMap(p => p.comments) ?? [],
    [commentsPages]
  );

  // Track reported comments for animated removal
  const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);
  const previousCommentsLengthRef = useRef<number>(0);

  const flattenedComments = useMemo<Comment[]>(() => {
    const flat: Comment[] = [];
    const addComments = (commentList: Comment[], parentComment?: Comment) => {
      commentList.forEach((c: Comment) => {
        if (c && typeof c === 'object') {
          const commentUri = c?.uri;
          // Filter out deleted and reported comments
          if (commentUri && (deletedComments.has(commentUri) || reportedPostUris.has(commentUri))) {
            return;
          }
          const flatComment: Comment = {
            ...c,
            parent: parentComment,
            replies: undefined,
          };
          flat.push(flatComment);
          if (c.replies && Array.isArray(c.replies)) {
            addComments(c.replies, c);
          }
        }
      });
    };
    if (comments && comments.length > 0) {
      addComments(comments);
    }
    return flat;
  }, [comments, deletedComments, reportedPostUris]);

  // Prepare layout animation when comments are removed
  useEffect(() => {
    const currentLength = flattenedComments.length;
    const previousLength = previousCommentsLengthRef.current;

    if (previousLength > 0 && currentLength !== previousLength) {
      LayoutAnimation.configureNext({
        duration: 300,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        },
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
      });
    }

    previousCommentsLengthRef.current = currentLength;
  }, [flattenedComments.length]);

  const {
    data: likesPages,
    isLoading: likesLoading,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
  } = useInfiniteQuery<{ likes: Like[]; cursor: string | null }, Error>({
    queryKey: queryKeys.likes.byPost(post?.uri || ''),
    queryFn: ({ pageParam }) =>
      AtprotoService.getLikes(post?.uri || '', pageParam as string | null),
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post?.uri && likesQueryEnabled,
  });

  const likes = useMemo(() => likesPages?.pages.flatMap(p => p.likes) ?? [], [likesPages]);

  useEffect(() => {
    if (
      !scrollToCommentUri ||
      !flattenedComments.length ||
      commentsLoading ||
      !commentsListRef.current
    )
      return;

    const idx = flattenedComments.findIndex(c => {
      const uri = c?.uri;
      return uri === scrollToCommentUri;
    });

    if (idx >= 0 && idx < flattenedComments.length) {
      setTimeout(() => {
        try {
          commentsListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
        } catch {
          // ignore
        }
      }, 600);
    }
  }, [scrollToCommentUri, flattenedComments, commentsLoading]);

  const [isPosting, setIsPosting] = useState(false);

  const handleSendComment = useCallback(async () => {
    if (!post?.uri) return;

    const text = newCommentText.trim();
    if (!text || isPosting) return;

    setIsPosting(true);

    try {
      const rootUri = post.uri;
      const rootCid = post.cid || '';

      const parentUri = replyContext?.parentUri ?? rootUri;
      const parentCid = replyContext?.parentCid ?? rootCid;

      await AtprotoService.postComment(text, rootUri, rootCid, parentUri, parentCid);

      setNewCommentText('');
      setReplyContext(null);

      queryClient.invalidateQueries({
        queryKey: queryKeys.comments.byPost(post.uri),
        refetchType: 'active',
      });

      setTimeout(() => inputRef.current?.focus?.(), 100);
    } catch {
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }, [post, newCommentText, replyContext, isPosting, queryClient]);

  const tabOptions: TabOption[] = useMemo(
    () => [
      {
        id: 'comments',
        label: totalComments > 0 ? `${formatNumber(totalComments)} Comments` : 'Comments',
      },
      { id: 'likes', label: totalLikes > 0 ? `${formatNumber(totalLikes)} Likes` : 'Likes' },
    ],
    [totalComments, totalLikes]
  );

  const handleTabPress = useCallback((tabId: string) => {
    const next = tabId as 'comments' | 'likes';
    setActiveTab(next);
    if (next === 'likes') setLikesQueryEnabled(true);
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

  useEffect(() => {
    if (visible && post) safePresent('comment-section');
    else safeDismiss('comment-section');
  }, [visible, post]);

  const router = useRouter();

  const renderCommentItem = useCallback<ListRenderItem<Comment>>(
    ({ item }) => {
      const level = item.parent ? 1 : 0;
      return (
        <CommentItem
          comment={item}
          onDismiss={onDismiss}
          onImagePress={setFullscreenImageUri}
          onReplyPress={handleReplyPress}
          highlightUri={scrollToCommentUri}
          level={level}
        />
      );
    },
    [scrollToCommentUri, onDismiss, handleReplyPress]
  );

  const renderLikeItem = useCallback<ListRenderItem<Like>>(
    ({ item }) => {
      const handlePress = () => {
        onDismiss?.();
        setTimeout(() => router.push(`/profile/${item.actor.handle}`), 100);
      };

      return (
        <AuthorItem
          handle={item.actor.handle}
          displayName={item.actor.displayName}
          avatar={item.actor.avatar}
          size="medium"
          showArrow={false}
          backgroundColor="transparent"
          hideHandleLine={true}
          customFontSize={16}
          onPress={handlePress}
          style={styles.likeItem}
        />
      );
    },
    [onDismiss, router]
  );

  const commentKeyExtractor = useCallback(
    (item: Comment) => item?.uri || item?.cid || Math.random().toString(36),
    []
  );
  const likeKeyExtractor = useCallback((item: Like) => `${item.actor.did}-${item.createdAt}`, []);

  const CommentsEmptyComponent = useMemo(
    () =>
      commentsLoading ? (
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={24} color={Colors.lightGray} />
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyContent}>
            <Text style={styles.emptyText}>start the conversation</Text>
          </View>
        </View>
      ),
    [commentsLoading]
  );

  const LikesEmptyComponent = useMemo(
    () =>
      likesLoading ? (
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={24} color={Colors.lightGray} />
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyContent}>
            <Text style={styles.emptyText}>be the first like</Text>
          </View>
        </View>
      ),
    [likesLoading]
  );

  const onEndReachedComments = useCallback(() => {
    if (hasNextCommentsPage && !isFetchingNextCommentsPage) fetchNextCommentsPage();
  }, [hasNextCommentsPage, isFetchingNextCommentsPage, fetchNextCommentsPage]);

  const onEndReachedLikes = useCallback(() => {
    if (hasNextLikesPage && !isFetchingNextLikesPage) fetchNextLikesPage();
  }, [hasNextLikesPage, isFetchingNextLikesPage, fetchNextLikesPage]);

  const placeholder = replyContext
    ? `Replying to ${replyContext.authorName}`
    : 'Say something nice...';

  const handleInputFocus = useCallback(() => {
    // TrueSheet's native footer handles keyboard automatically
    // Resize to full height to ensure footer remains visible when keyboard appears
    sheetRef.current?.resize(1);
  }, []);

  const ComposerFooter = useMemo(() => {
    return (
      <CommentInputFooter
        value={newCommentText}
        onChangeText={setNewCommentText}
        inputSelection={inputSelection}
        onSelectionChange={e => setInputSelection(e.nativeEvent.selection)}
        placeholder={placeholder}
        onSubmit={handleSendComment}
        onCancelReply={handleCancelReply}
        replyContext={
          replyContext
            ? {
                authorName: replyContext.authorName,
                parentUri: replyContext.parentUri,
                parentCid: replyContext.parentCid,
                level: 0,
              }
            : null
        }
        isPosting={isPosting}
        maxLength={MAX_COMMENT_LENGTH}
        inputRef={inputRef}
        currentUserAvatar={currentUserProfile?.avatar}
        userSearchModalProps={userSearchModalProps}
        mentionInputProps={mentionInputProps}
        onFocus={handleInputFocus}
      />
    );
  }, [
    newCommentText,
    inputSelection,
    placeholder,
    handleSendComment,
    handleCancelReply,
    replyContext,
    isPosting,
    inputRef,
    currentUserProfile?.avatar,
    userSearchModalProps,
    mentionInputProps,
    handleInputFocus,
  ]);

  const headerComponent = useMemo(
    () => (
      <View style={styles.header}>
        <View style={styles.tabContainer}>
          <TabNavigation
            tabs={tabOptions}
            activeTab={activeTab}
            onTabPress={handleTabPress}
            textColor={Colors.white}
            backgroundColor="transparent"
            variant="comments"
            style={styles.tabNavigation}
          />
        </View>

        <View style={styles.headerActions}>
          <RelativeDate dateString={postedAt || post?.indexedAt} style={styles.dateText} />

          <Pressable
            onPress={handleHeaderSharePress}
            style={styles.actionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreFillIcon size={20} color={Colors.lightGray} />
          </Pressable>

          <Pressable
            onPress={handleHeaderToggleLike}
            disabled={!!isLikePending || headerIsPending}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.actionButton}
          >
            <Animated.View style={headerHeartStyle}>
              <HeartFillIcon
                size={26}
                color={
                  (onToggleLike ? headerVisualLiked : headerIsLiked)
                    ? Colors.INTERACTIVE.HEART.ACTIVE
                    : Colors.gray
                }
              />
            </Animated.View>
          </Pressable>
        </View>
      </View>
    ),
    [
      tabOptions,
      activeTab,
      handleTabPress,
      postedAt,
      post?.indexedAt,
      handleHeaderSharePress,
      handleHeaderToggleLike,
      isLikePending,
      headerIsPending,
      headerHeartStyle,
      onToggleLike,
      headerVisualLiked,
      headerIsLiked,
    ]
  );

  return (
    <>
      <TrueSheet
        ref={sheetRef}
        name="comment-section"
        detents={scrollToCommentUri ? [1] : [0.5, 1]}
        backgroundColor={Colors.black}
        onDidDismiss={handleClose}
        scrollable
        grabber={false}
        header={headerComponent}
        footer={activeTab === 'comments' ? ComposerFooter : undefined}
      >
        <View style={styles.container}>
          {activeTab === 'comments' ? (
            <FlashList
              ref={commentsListRef}
              data={post ? flattenedComments : []}
              keyExtractor={commentKeyExtractor}
              renderItem={renderCommentItem}
              contentContainerStyle={listContentStyle}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onEndReached={onEndReachedComments}
              onEndReachedThreshold={END_REACHED_THRESHOLD}
              overrideItemLayout={layout => {
                layout.span = COMMENT_ITEM_ESTIMATE;
              }}
              removeClippedSubviews={true}
              drawDistance={250}
              ListEmptyComponent={CommentsEmptyComponent}
            />
          ) : (
            <FlashList
              ref={likesListRef}
              data={post ? likes : []}
              keyExtractor={likeKeyExtractor}
              renderItem={renderLikeItem}
              contentContainerStyle={listContentStyle}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onEndReached={onEndReachedLikes}
              onEndReachedThreshold={END_REACHED_THRESHOLD}
              overrideItemLayout={layout => {
                layout.span = LIKE_ITEM_ESTIMATE;
              }}
              removeClippedSubviews={true}
              drawDistance={250}
              ListEmptyComponent={LikesEmptyComponent}
            />
          )}
        </View>
      </TrueSheet>

      <Modal
        visible={!!fullscreenImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenImageUri(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFullscreenImageUri(null)}>
          {fullscreenImageUri && (
            <Image
              source={{ uri: fullscreenImageUri }}
              style={styles.fullscreenImage}
              contentFit="contain"
            />
          )}
          <Pressable style={styles.closeButton} onPress={() => setFullscreenImageUri(null)}>
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
    position: 'relative',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
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
    fontFamily: 'Figtree-Regular',
  },
  actionButton: {
    padding: 0,
  },

  listContent: {
    backgroundColor: Colors.black,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
    minHeight: 200,
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
    fontFamily: 'Figtree-SemiBold',
  },

  likeItem: {
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 2,
    alignItems: 'flex-start',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayBlack95,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '95%',
    height: '80%',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    backgroundColor: Colors.overlayBlack70,
    borderRadius: BORDER_RADIUS.LARGE,
    padding: 12,
  },
});

export default CommentSection;
