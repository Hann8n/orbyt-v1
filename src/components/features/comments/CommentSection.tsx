import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  LayoutAnimation,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { FlashList, ListRenderItem, FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';

import { TrueSheet } from '@lodev09/react-native-true-sheet';
import type { TrueSheet as TrueSheetHandle } from '@lodev09/react-native-true-sheet';
import { AppTrueSheet, useMeasuredFooterHeight } from '../../../utils/components/truesheet';

import { usePostCommentMutation } from '../../../hooks/useCommentMutations';
import { AtprotoCore } from '../../../services/api/core';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useProfileByDid } from '../../../services/data/ProfileService';
import { useUserStore } from '../../../stores/userStore';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';
import { useShallow } from 'zustand/react/shallow';
import { useModalStore } from '../../../stores/modalStore';
import { useShareSheet } from '../../../stores/modalStore';
import { useLikeMutation } from '@/hooks/useLikeMutation';
import { useQueryClient } from '@tanstack/react-query';
import type { FeedResponse } from '../../../services/api/types';

import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { Colors } from '../../../theme';
import { NanoIcon } from '../../ui/NanoIcon';
import RelativeDate from '../../ui/RelativeDate';
import {
  APP_CONSTANTS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { formatHandle } from '../../../utils/formatting/handles';
import { FontFamily, Typography, TextStyles } from '../../../utils/components/typography';
import CommentInputFooter from './CommentInputFooter';
import CommentItem from './CommentItem';
import { CommentLikeItem } from './CommentLikeItem';
import KlipyGifPickerSheet from './KlipyGifPickerSheet';
import type { Comment, Like, ExtendedPostView } from '../../../services/api/types';
import type { KlipyItem } from '../../../services/klipy/KlipyService';
import type { InfiniteData } from '@tanstack/react-query';

type HeaderLikeState = { isLiked: boolean; likeCount: number; likeUri?: string };

/**
 * Read the like state for a post from the feed cache.
 * This ensures the header like button shows the correct state when opening comments.
 */
function readPostFromFeedCache(
  queryClient: ReturnType<typeof useQueryClient>,
  postUri: string
): HeaderLikeState {
  const feedData = queryClient.getQueryData<InfiniteData<FeedResponse>>(queryKeys.feed.all);

  if (!feedData) {
    return { isLiked: false, likeCount: 0, likeUri: undefined };
  }

  for (const page of feedData.pages) {
    for (const item of page.feed) {
      if (item.post.uri === postUri) {
        const { likeCount, viewer } = item.post;
        const likeUri = viewer && typeof viewer.like === 'string' ? viewer.like : undefined;
        const isLiked = !!likeUri;
        return { isLiked, likeCount: likeCount ?? 0, likeUri };
      }
    }
  }

  return { isLiked: false, likeCount: 0, likeUri: undefined };
}

import {
  ensureCommentUploadImage,
  klipyThumbUrlForEmbed,
} from '../../../utils/comments/mediaHelpers';

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
  onOpenShareSheet?: () => void;
  postedAt?: string;
}

const MAX_COMMENT_LENGTH = 300;

const commentKeyExtractor = (item: Comment, index: number): string =>
  item?.uri || item?.cid || `comment-${index}`;

const likeKeyExtractor = (item: Like): string => `${item.actor.did}-${item.createdAt}`;

const CommentSection: React.FC<CommentSectionProps> = ({
  post: propPost,
  onDismiss: propOnDismiss,
  visible: propVisible,
  onOpenShareSheet: propOnOpenShareSheet,
  postedAt: propPostedAt,
}) => {
  const { t } = useTranslation();
  const { globalData, dismissCommentSection } = useModalStore(
    useShallow(state => ({
      globalData: state.commentSectionData,
      dismissCommentSection: state.dismissCommentSection,
    }))
  );

  const { presentShareSheet } = useShareSheet();

  const post = globalData?.post || propPost;
  const onDismiss = propOnDismiss || dismissCommentSection;
  const visible = propVisible !== undefined ? propVisible : !!globalData;

  const postedAt = globalData?.postedAt ?? propPostedAt;
  const scrollToCommentUri = globalData?.scrollToCommentUri;

  const [listBottomPadding, wrapFooter] = useMeasuredFooterHeight(96);
  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: listBottomPadding }],
    [listBottomPadding]
  );

  const klipySheetRef = useRef<TrueSheetHandle>(null);
  const [presentedPostUri, setPresentedPostUri] = useState<string | null>(null);
  const commentsListRef = useRef<FlashListRef<Comment> | null>(null);
  const likesListRef = useRef<FlashListRef<Like> | null>(null);

  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');
  const [likesQueryEnabled, setLikesQueryEnabled] = useState(false);
  const [isListScrolled, setIsListScrolled] = useState(false);

  const [newCommentText, setNewCommentText] = useState('');
  const [selectedGif, setSelectedGif] = useState<KlipyItem | null>(null);
  const [selectedImages, setSelectedImages] = useState<
    Array<{ uri: string; alt: string; aspectRatio?: { width: number; height: number } }>
  >([]);
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

  const openGifPicker = useCallback(() => {
    klipySheetRef.current?.present().catch(() => {});
  }, []);

  const closeGifPicker = useCallback(() => {
    klipySheetRef.current?.dismiss().catch(() => {});
  }, []);

  const refocusInputAfterAttachment = useCallback(() => {
    const focusInput = () => {
      setTimeout(() => inputRef.current?.focus?.(), 120);
      setTimeout(() => inputRef.current?.focus?.(), 260);
    };

    InteractionManager.runAfterInteractions(() => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(focusInput, { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT });
        return;
      }
      focusInput();
    });
  }, []);

  const handleGifPickerClosed = useCallback(() => {
    closeGifPicker();
    refocusInputAfterAttachment();
  }, [closeGifPicker, refocusInputAfterAttachment]);

  const handleSelectGif = useCallback(
    (item: KlipyItem) => {
      setSelectedGif(item);
      setSelectedImages([]);
      closeGifPicker();
      refocusInputAfterAttachment();
    },
    [closeGifPicker, refocusInputAfterAttachment]
  );

  const handlePickImages = useCallback(async () => {
    let shouldRefocusInput = false;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(t('video.permissionRequired'), t('video.mediaLibraryPermissionRequired'));
        shouldRefocusInput = true;
        return;
      }

      shouldRefocusInput = true;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled) return;
      const assets = result.assets ?? [];
      if (!assets.length) return;

      const next = await Promise.all(
        assets
          .filter(a => a?.uri)
          .slice(0, 4)
          .map(async a => {
            const width = typeof a.width === 'number' ? a.width : undefined;
            const height = typeof a.height === 'number' ? a.height : undefined;
            const aspectRatio =
              width && height && width > 0 && height > 0 ? { width, height } : undefined;
            const safeUploadUri = await ensureCommentUploadImage(a.uri);
            return {
              uri: safeUploadUri,
              alt: '',
              aspectRatio,
            };
          })
      );

      if (next.length) {
        setSelectedImages(next);
        setSelectedGif(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('too large')) {
        Alert.alert(t('common.error'), 'Image is too large to upload. Try a smaller photo.');
      } else {
        Alert.alert(t('common.error'), t('video.failedToAccessGallery'));
      }
    } finally {
      if (shouldRefocusInput) {
        refocusInputAfterAttachment();
      }
    }
  }, [t, refocusInputAfterAttachment]);

  const handleRemoveSelectedImage = useCallback((uri: string) => {
    setSelectedImages(prev => prev.filter(img => img.uri !== uri));
  }, []);

  const handleReplyPress = useCallback(
    (comment: Comment) => {
      const uri = comment?.uri;
      const cid = comment?.cid;
      const authorName = formatHandle(comment?.author?.handle || '') || t('feed.unknownUser');

      if (!uri || !cid) return;

      setReplyContext({ authorName, parentUri: uri, parentCid: cid });
      setTimeout(() => inputRef.current?.focus?.(), 150);
    },
    [t]
  );

  const currentUser = useUserStore(state => state.currentUser);
  const { data: currentUserProfile } = useProfileByDid(currentUser?.did ?? null);
  const queryClient = useQueryClient();

  const likeMutation = useLikeMutation();

  const [headerLikeState, setHeaderLikeState] = useState<HeaderLikeState>({
    isLiked: false,
    likeCount: 0,
    likeUri: undefined,
  });

  // Read like state from feed cache when post URI changes
  useEffect(() => {
    if (!post?.uri) return;
    setHeaderLikeState(readPostFromFeedCache(queryClient, post.uri));
  }, [post?.uri, queryClient]);

  const headerHeartScale = useSharedValue(1);
  const headerHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerHeartScale.value }],
  }));

  useEffect(() => {
    cancelAnimation(headerHeartScale);
    headerHeartScale.value = 1;
  }, [post?.uri]);

  const handleHeaderToggleLike = useCallback(() => {
    if (!post?.uri || !post?.cid || likeMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const {
      isLiked: currentIsLiked,
      likeUri: currentLikeUri,
      likeCount: currentLikeCount,
    } = headerLikeState;
    const newIsLiked = !currentIsLiked;
    const newCount = newIsLiked ? currentLikeCount + 1 : Math.max(0, currentLikeCount - 1);

    if (newIsLiked) {
      headerHeartScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
        headerHeartScale.value = withSpring(1);
      });
    } else {
      headerHeartScale.value = withSpring(1);
    }

    setHeaderLikeState({
      isLiked: newIsLiked,
      likeCount: newCount,
      likeUri: newIsLiked ? 'optimistic' : undefined,
    });

    likeMutation.mutate(
      {
        postUri: post.uri,
        postCid: post.cid,
        isLiked: currentIsLiked,
        likeUri: currentLikeUri,
        likeCount: currentLikeCount,
      },
      {
        onSuccess: resolvedLikeUri => {
          setHeaderLikeState(prev => ({
            ...prev,
            likeUri: newIsLiked ? resolvedLikeUri : undefined,
          }));
        },
        onError: () => {
          setHeaderLikeState({
            isLiked: currentIsLiked,
            likeCount: currentLikeCount,
            likeUri: currentLikeUri,
          });
        },
      }
    );
  }, [likeMutation, post?.uri, post?.cid, headerLikeState]);

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

  const {
    data: commentsPages,
    isLoading: commentsLoading,
    fetchNextPage: fetchNextCommentsPage,
    hasNextPage: hasNextCommentsPage,
    isFetchingNextPage: isFetchingNextCommentsPage,
  } = useInfiniteQuery<{ comments: Comment[]; cursor: string | null }, Error>({
    queryKey: queryKeys.comments.byPost(post?.uri || ''),
    queryFn: async ({ pageParam }) => {
      if (!AtprotoCore.isIncomingApiEnabled()) return { comments: [], cursor: null };
      try {
        const { agent } = await import('../../../services/api/agentBridge').then(m =>
          m.getAtprotoBridge()
        );
        if (!agent) return { comments: [], cursor: null };
        const res = await agent.api.app.bsky.feed.getPostThread({
          uri: post?.uri || '',
          depth: 6,
          parentHeight: 0,
          ...(pageParam ? { cursor: pageParam as string } : {}),
        });
        const extractComments = (thread: unknown): Comment[] => {
          if (!thread || typeof thread !== 'object') return [];
          const t = thread as { replies?: unknown[] };
          if (!Array.isArray(t.replies)) return [];
          return t.replies
            .map((reply: unknown) => {
              if (!reply || typeof reply !== 'object') return null;
              const r = reply as { post?: Comment; replies?: unknown[] };
              if (!r.post) return null;
              return {
                ...r.post,
                replies: r.replies ? extractComments({ replies: r.replies }) : [],
              } as Comment;
            })
            .filter(Boolean) as Comment[];
        };
        return {
          comments: extractComments(res.data.thread),
          cursor: (res.data as { cursor?: string | null }).cursor ?? null,
        };
      } catch {
        return { comments: [], cursor: null };
      }
    },
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post?.uri,
    structuralSharing: false,
  });

  const previousCommentsLengthRef = useRef<number>(0);

  const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);

  const flattenedComments = useMemo(() => {
    const allComments =
      commentsPages?.pages
        .flatMap(page => page.comments)
        .filter((comment: ExtendedPostView) => {
          const commentUri = comment.uri;
          if (commentUri && reportedPostUris.has(commentUri)) {
            return false;
          }
          return true;
        }) ?? [];

    const flat: Comment[] = [];
    const addComments = (commentList: Comment[], parentComment?: Comment) => {
      commentList.forEach((c: Comment) => {
        if (c && typeof c === 'object') {
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

    if (allComments.length > 0) addComments(allComments);
    return flat;
  }, [commentsPages, reportedPostUris]);

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
    queryFn: async ({ pageParam }) => {
      if (!AtprotoCore.isIncomingApiEnabled()) return { likes: [], cursor: null };
      try {
        const { agent } = await import('../../../services/api/agentBridge').then(m =>
          m.getAtprotoBridge()
        );
        if (!agent) return { likes: [], cursor: null };
        const res = await agent.api.app.bsky.feed.getLikes({
          uri: post?.uri || '',
          limit: 25,
          ...(pageParam ? { cursor: pageParam as string } : {}),
        });
        return { likes: res.data.likes || [], cursor: res.data.cursor || null };
      } catch {
        return { likes: [], cursor: null };
      }
    },
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
      requestAnimationFrame(() => {
        commentsListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      });
    }
  }, [scrollToCommentUri, flattenedComments, commentsLoading]);

  const { mutate: postComment, isPending: isPosting } = usePostCommentMutation();

  const handleSendComment = useCallback(() => {
    if (!post?.uri) return;

    const text = newCommentText.trim();
    const hasGif = !!selectedGif?.fullUrl;
    const hasImages = selectedImages.length > 0;
    if (!text && !hasGif && !hasImages) return;
    if (isPosting) return;

    const rootUri = post.uri;
    const rootCid = post.cid || '';

    const externalEmbed = hasGif
      ? {
          uri: selectedGif!.fullUrl,
          title:
            selectedGif!.title ??
            (selectedGif!.kind === 'sticker'
              ? 'Sticker'
              : selectedGif!.kind === 'meme'
                ? 'Meme'
                : selectedGif!.kind === 'emoji'
                  ? 'Emoji'
                  : 'GIF'),
          description:
            selectedGif!.kind === 'sticker'
              ? 'Klipy Sticker'
              : selectedGif!.kind === 'meme'
                ? 'Klipy Meme'
                : selectedGif!.kind === 'emoji'
                  ? 'Klipy Emoji'
                  : 'Klipy GIF',
          thumb: klipyThumbUrlForEmbed(selectedGif!),
        }
      : undefined;

    postComment(
      {
        text,
        rootUri,
        rootCid,
        parentUri: replyContext?.parentUri,
        parentCid: replyContext?.parentCid,
        images: hasImages ? selectedImages : undefined,
        externalEmbed: hasGif ? externalEmbed : undefined,
        author: {
          did: currentUser?.did ?? '',
          handle: currentUser?.handle ?? '',
          displayName: currentUserProfile?.displayName,
          avatar: currentUserProfile?.avatar,
        },
      },
      {
        onSuccess: () => {
          logEvent(getAnalytics(), 'post_comment', {
            post_uri: rootUri,
            has_media: hasImages || hasGif,
          }).catch(() => {});
          setNewCommentText('');
          setSelectedGif(null);
          setSelectedImages([]);
          setReplyContext(null);
        },
        onError: error => {
          const message = error instanceof Error ? error.message.toLowerCase() : '';
          if (message.includes('1,000,000 byte limit') || message.includes('too large')) {
            Alert.alert(t('common.error'), 'Image is too large to upload. Try a smaller photo.');
          } else {
            Alert.alert(t('common.error'), t('comments.failedToPost'));
          }
        },
      }
    );
  }, [
    post,
    newCommentText,
    selectedGif,
    selectedImages,
    replyContext,
    postComment,
    currentUser?.did,
    currentUser?.handle,
    currentUserProfile?.displayName,
    currentUserProfile?.avatar,
    t,
  ]);

  const tabOptions: TabOption[] = useMemo(
    () => [
      {
        id: 'comments',
        label: t('comments.comments'),
      },
      {
        id: 'likes',
        label: t('comments.likes'),
      },
    ],
    [t]
  );

  const handleTabPress = useCallback((tabId: string) => {
    const next = tabId as 'comments' | 'likes';
    setActiveTab(next);
    setIsListScrolled(false);
    if (next === 'likes') setLikesQueryEnabled(true);
  }, []);

  const handleListScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const nextScrolled = event.nativeEvent.contentOffset.y > 2;
      setIsListScrolled(prev => (prev === nextScrolled ? prev : nextScrolled));
    },
    []
  );

  const handleClose = () => {
    setPresentedPostUri(null);
    cancelAnimation(headerHeartScale);
    headerHeartScale.value = 1;
    setNewCommentText('');
    setSelectedGif(null);
    setSelectedImages([]);
    setActiveTab('comments');
    setLikesQueryEnabled(false);
    setIsListScrolled(false);
    setInputSelection({ start: 0, end: 0 });
    setReplyContext(null);
    onDismiss?.();
  };

  useEffect(() => {
    const postUri = post?.uri ?? null;
    if (visible && post && postUri) {
      if (presentedPostUri !== postUri) {
        TrueSheet.present('comment-section').catch(() => {});
      }
    } else if (presentedPostUri !== null) {
      TrueSheet.dismiss('comment-section').catch(() => {});
    }
  }, [visible, post, post?.uri, presentedPostUri]);

  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

  const renderCommentItem = useCallback<ListRenderItem<Comment>>(
    ({ item }) => {
      const level = item.parent ? 1 : 0;
      return (
        <CommentItem
          comment={item}
          onDismiss={onDismiss}
          onCommentDeleted={undefined}
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
        if (item.actor.did) {
          setTimeout(() => {
            goToProfile(item.actor.did);
          }, 100);
        }
      };

      return <CommentLikeItem like={item} onPress={handlePress} />;
    },
    [goToProfile, onDismiss]
  );

  const CommentsEmptyComponent = useMemo(() => {
    return commentsLoading ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.neutral[200]} />
      </View>
    ) : (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText}>{t('comments.startConversation')}</Text>
        </View>
      </View>
    );
  }, [commentsLoading, t]);

  const LikesEmptyComponent = useMemo(() => {
    return likesLoading ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.neutral[200]} />
      </View>
    ) : (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText}>{t('comments.beFirstLike')}</Text>
        </View>
      </View>
    );
  }, [likesLoading, t]);

  const ItemSeparatorComponent = useCallback(() => {
    return <View style={styles.likeDivider} />;
  }, []);

  const onEndReachedComments = useCallback(() => {
    if (hasNextCommentsPage && !isFetchingNextCommentsPage) fetchNextCommentsPage();
  }, [hasNextCommentsPage, isFetchingNextCommentsPage, fetchNextCommentsPage]);

  const onEndReachedLikes = useCallback(() => {
    if (hasNextLikesPage && !isFetchingNextLikesPage) fetchNextLikesPage();
  }, [hasNextLikesPage, isFetchingNextLikesPage, fetchNextLikesPage]);

  const replyingToText = useMemo(() => `${t('comments.replyingTo', { name: '' }).trim()} `, [t]);
  const selectedGifAspectRatio =
    selectedGif?.width && selectedGif?.height && selectedGif.height > 0
      ? selectedGif.width / selectedGif.height
      : null;

  const ComposerFooter = (
    <View style={styles.composerFooter}>
      {replyContext ? (
        <View style={styles.replyBanner}>
          <Text style={styles.replyBannerText} numberOfLines={1} ellipsizeMode="tail">
            {replyingToText}
            <Text style={styles.replyBannerNameText}>{replyContext.authorName}</Text>
          </Text>
          <NativePressable
            onPress={handleCancelReply}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.replyBannerCloseButton}
            accessibilityRole="button"
            accessibilityLabel={t('comments.cancelReply')}
          >
            <Text style={styles.replyBannerCloseText}>{t('common.cancel')}</Text>
          </NativePressable>
        </View>
      ) : null}
      <CommentInputFooter
        value={newCommentText}
        onChangeText={setNewCommentText}
        inputSelection={inputSelection}
        onSelectionChange={e => setInputSelection(e.nativeEvent.selection)}
        placeholder={t('comments.saySomething')}
        onSubmit={handleSendComment}
        onPressGif={openGifPicker}
        onPressPhotos={handlePickImages}
        selectedGifPreviewUri={selectedGif?.previewUrl ?? null}
        selectedGifAspectRatio={selectedGifAspectRatio}
        selectedImages={selectedImages}
        hasAttachment={!!selectedGif || selectedImages.length > 0}
        onClearAttachment={() => {
          setSelectedGif(null);
          setSelectedImages([]);
        }}
        onClearGif={() => setSelectedGif(null)}
        onRemoveImage={handleRemoveSelectedImage}
        isPosting={isPosting}
        maxLength={MAX_COMMENT_LENGTH}
        inputRef={inputRef}
        currentUserAvatar={currentUserProfile?.avatar}
      />
    </View>
  );

  const headerComponent = (
    <View style={[styles.header, isListScrolled && styles.headerScrolled]}>
      <View style={styles.tabContainer}>
        <TabNavigation
          tabs={tabOptions}
          activeTab={activeTab}
          onTabPress={handleTabPress}
          textColor={Colors.neutral[50]}
          backgroundColor="transparent"
          variant="comments"
          style={styles.tabNavigation}
        />
      </View>

      <View style={styles.headerActions}>
        <RelativeDate dateString={postedAt || post?.indexedAt} style={styles.dateText} />

        <NativePressable
          onPress={handleHeaderSharePress}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <NanoIcon name="more-fill" size={20} color={Colors.neutral[400]} />
        </NativePressable>

        <NativePressable
          onPress={handleHeaderToggleLike}
          disabled={likeMutation.isPending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.actionButton}
        >
          <Animated.View style={headerHeartStyle}>
            <NanoIcon
              name="heart-fill"
              size={26}
              color={headerLikeState.isLiked ? Colors.coral[500] : Colors.neutral[500]}
            />
          </Animated.View>
        </NativePressable>
      </View>
    </View>
  );

  return (
    <>
      <AppTrueSheet
        name="comment-section"
        grabber={false}
        detents={scrollToCommentUri ? [1] : [0.5, 1]}
        onDidPresent={() => setPresentedPostUri(post?.uri ?? null)}
        onDidDismiss={handleClose}
        scrollable={true}
        header={headerComponent}
        footer={activeTab === 'comments' ? wrapFooter(ComposerFooter) : undefined}
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
              showsVerticalScrollIndicator={
                flattenedComments.length >= SCROLL_INDICATOR_CONSTANTS.COMMENTS_MIN_ITEMS
              }
              scrollEventThrottle={16}
              onScroll={handleListScroll}
              onEndReached={onEndReachedComments}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
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
              ItemSeparatorComponent={ItemSeparatorComponent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={
                likes.length >= SCROLL_INDICATOR_CONSTANTS.COMMENTS_MIN_ITEMS
              }
              scrollEventThrottle={16}
              onScroll={handleListScroll}
              onEndReached={onEndReachedLikes}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              drawDistance={250}
              ListEmptyComponent={LikesEmptyComponent}
            />
          )}
        </View>
      </AppTrueSheet>

      <KlipyGifPickerSheet
        sheetRef={klipySheetRef}
        onSelect={handleSelectGif}
        onClose={handleGifPickerClosed}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[975],
    minHeight: 0,
    position: 'relative',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: Colors.neutral[975],
  },
  headerScrolled: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[925],
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
    color: Colors.neutral[400],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.medium,
    lineHeight: Typography.lineHeights.body,
  },
  actionButton: {
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },

  listContent: {
    backgroundColor: Colors.neutral[975],
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.neutral[975],
    minHeight: 200,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 220,
    backgroundColor: Colors.neutral[975],
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    textAlign: 'center',
    fontFamily: FontFamily.semibold,
  },

  likeDivider: {
    height: 1,
    backgroundColor: Colors.neutral[800],
    marginLeft: 52,
  },
  composerFooter: {
    backgroundColor: Colors.neutral[975],
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: Colors.neutral[925],
    backgroundColor: Colors.neutral[975],
  },
  replyBannerText: {
    ...TextStyles.chyron,
    color: Colors.neutral[200],
    fontFamily: FontFamily.medium,
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  replyBannerNameText: {
    ...TextStyles.chyronBold,
    color: Colors.neutral[200],
  },
  replyBannerCloseButton: {
    paddingVertical: 2,
  },
  replyBannerCloseText: {
    color: Colors.neutral[300],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
  },
  imageViewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  imageViewerDismiss: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerImage: {
    width: '95%',
    height: '80%',
  },
});

export default CommentSection;
