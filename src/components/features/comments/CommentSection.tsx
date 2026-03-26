import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  LayoutAnimation,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { FlashList, ListRenderItem, FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import { AppTrueSheet, useMeasuredFooterHeight } from '../../../utils/components/truesheet';

import AtprotoService from '../../../services/api/AtprotoService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useProfile } from '../../../services/data/ProfileService';
import { useUserStore } from '../../../stores/userStore';
import { usePostInteractionStore } from '../../../stores/postInteractionStore';
import { useCommentStore } from '../../../stores/commentStore';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';
import { useModalStore } from '../../../stores/modalStore';
import { useGlobalShareSheet } from '../../../hooks/useGlobalModals';

import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { Colors } from '../../../theme';
import { HeartFillIcon, MoreFillIcon, CloseFillIcon } from '../../ui/Icon';
import RelativeDate from '../../ui/RelativeDate';
import { useUserSearchTrigger } from '../../ui/usersearch';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { FontFamily } from '../../../utils/components/typography';
import CommentInputFooter from './CommentInputFooter';
import CommentItem from './CommentItem';
import { CommentLikeItem } from './CommentLikeItem';
import KlipyGifPickerSheet from './KlipyGifPickerSheet';
import type { Comment, Like } from '../../../services/api/types';
import type { KlipyItem } from '../../../services/klipy/KlipyService';

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
const MAX_COMMENT_LENGTH = 300;

const commentKeyExtractor = (item: Comment, index: number): string =>
  item?.uri || item?.cid || `comment-${index}`;

const likeKeyExtractor = (item: Like): string => `${item.actor.did}-${item.createdAt}`;

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
  const { t } = useTranslation();
  const globalData = useModalStore(state => state.commentSectionData);
  const dismissCommentSection = useModalStore(state => state.dismissCommentSection);

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
  const [listBottomPadding, wrapFooter] = useMeasuredFooterHeight(96);
  const listContentStyle = [
    styles.listContent,
    {
      paddingBottom: listBottomPadding + (typeof insets?.bottom === 'number' ? insets.bottom : 0),
    },
  ];

  const sheetRef = useRef<TrueSheet>(null);
  const klipySheetRef = useRef<TrueSheet>(null);
  const lastPresentedPostUriRef = useRef<string | null>(null);
  const commentsListRef = useRef<FlashListRef<Comment> | null>(null);
  const likesListRef = useRef<FlashListRef<Like> | null>(null);

  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');
  const [likesQueryEnabled, setLikesQueryEnabled] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

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
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => inputRef.current?.focus?.(), 150);
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
    },
    [closeGifPicker]
  );

  const handlePickImages = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(t('video.permissionRequired'), t('video.mediaLibraryPermissionRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 0.9,
        allowsEditing: false,
      });

      if (result.canceled) return;
      const assets = result.assets ?? [];
      if (!assets.length) return;

      const next = assets
        .filter(a => a?.uri)
        .slice(0, 4)
        .map(a => {
          const width = typeof a.width === 'number' ? a.width : undefined;
          const height = typeof a.height === 'number' ? a.height : undefined;
          const aspectRatio =
            width && height && width > 0 && height > 0 ? { width, height } : undefined;
          return {
            uri: a.uri,
            alt: '',
            aspectRatio,
          };
        });

      if (next.length) {
        setSelectedImages(next);
        setSelectedGif(null);
        refocusInputAfterAttachment();
      }
    } catch {
      Alert.alert(t('common.error'), t('video.failedToAccessGallery'));
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

  const { currentUser } = useUserStore();
  const currentUserHandle = currentUser?.handle || null;
  const { data: currentUserProfile } = useProfile(currentUserHandle);

  const { inputProps: mentionInputProps, userSearchModalProps } = useUserSearchTrigger({
    value: newCommentText,
    selection: inputSelection,
    onChangeText: setNewCommentText,
    onSelectionChange: e => setInputSelection(e.nativeEvent.selection),
  });

  const defaultHeaderInteraction = {
    isLiked: !!isLiked,
    likeCount: totalLikes,
    likeUri: undefined as string | undefined,
    isReposted: false,
    isBookmarked: false,
    repostCount: 0,
  };
  const persistedHeaderInteraction = usePostInteractionStore(state =>
    post?.uri ? state.getPostInteraction(post.uri, defaultHeaderInteraction) : null
  );
  const updatePostInteraction = usePostInteractionStore(state => state.updatePostInteraction);
  const deletedComments = useCommentStore(state => state.deletedComments);

  const [headerIsLiked, setHeaderIsLiked] = useState<boolean>(() => {
    if (!post?.uri || onToggleLike) return !!isLiked;
    return persistedHeaderInteraction?.isLiked ?? !!isLiked;
  });
  const [headerLikeUri, setHeaderLikeUri] = useState<string | undefined>(() => {
    if (!post?.uri || onToggleLike) return undefined;
    return persistedHeaderInteraction?.likeUri;
  });
  const [headerIsPending, setHeaderIsPending] = useState<boolean>(false);
  const [headerVisualLiked, setHeaderVisualLiked] = useState<boolean>(() => {
    if (!post?.uri || onToggleLike) return !!isLiked;
    return persistedHeaderInteraction?.isLiked ?? !!isLiked;
  });

  const hasToggleLike = Boolean(onToggleLike);

  useEffect(() => {
    if (hasToggleLike) {
      // Modal `commentSectionData.isLiked` is a snapshot from `presentCommentSection` and does not
      // update when the user likes from this sheet. The post interaction store does (see VideoCard
      // `updatePostInteraction`). Since `persistedHeaderInteraction` is in deps, we must sync from the
      // store when available or we reset the header heart to the stale snapshot after each like.
      const synced = post?.uri != null ? !!persistedHeaderInteraction?.isLiked : !!isLiked;
      setHeaderIsLiked(synced);
      setHeaderVisualLiked(synced);
      return;
    }

    if (post?.uri && isLiked !== undefined && persistedHeaderInteraction) {
      const storeState = persistedHeaderInteraction;

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
  }, [
    hasToggleLike,
    isLiked,
    totalLikes,
    post?.uri,
    persistedHeaderInteraction,
    updatePostInteraction,
  ]);

  const headerHeartScale = useSharedValue(1);
  const headerHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerHeartScale.value }],
  }));

  const handleHeaderToggleLikeInternal = useCallback(async () => {
    if (!post?.uri || headerIsPending) return;

    const storeState = persistedHeaderInteraction ?? defaultHeaderInteraction;
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
    persistedHeaderInteraction,
    defaultHeaderInteraction,
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

  const comments = commentsPages?.pages.flatMap(p => p.comments) ?? [];

  // Track reported comments for animated removal
  const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);
  const previousCommentsLengthRef = useRef<number>(0);

  const flattenedComments = (() => {
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
  })();

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

  const likes = likesPages?.pages.flatMap(p => p.likes) ?? [];

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
  const [postedCommentUri, setPostedCommentUri] = useState<string | null>(null);

  const handleSendComment = useCallback(async () => {
    if (!post?.uri) return;

    const text = newCommentText.trim();
    const hasGif = !!selectedGif?.fullUrl;
    const hasImages = selectedImages.length > 0;
    if ((!text && !hasGif && !hasImages) || isPosting) return;

    setIsPosting(true);

    try {
      const rootUri = post.uri;
      const rootCid = post.cid || '';

      const parentUri = replyContext?.parentUri ?? rootUri;
      const parentCid = replyContext?.parentCid ?? rootCid;

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
            thumb:
              selectedGif!.previewUrl && /^https?:\/\//.test(selectedGif.previewUrl)
                ? selectedGif.previewUrl
                : undefined,
          }
        : undefined;

      const result = await AtprotoService.postComment(
        text,
        rootUri,
        rootCid,
        parentUri,
        parentCid,
        hasImages ? selectedImages : undefined,
        hasGif ? externalEmbed : undefined
      );

      // Store the URI of the newly posted comment to scroll to it after refetch
      setPostedCommentUri(result.uri);

      setNewCommentText('');
      setSelectedGif(null);
      setSelectedImages([]);
      setReplyContext(null);

      // Invalidate and force refetch to ensure new comment appears immediately
      // Use a small delay to account for API propagation
      setTimeout(async () => {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.comments.byPost(post.uri),
          refetchType: 'all', // Refetch all matching queries, not just active ones
        });
        // Force refetch to ensure immediate update
        await queryClient.refetchQueries({
          queryKey: queryKeys.comments.byPost(post.uri),
        });
      }, 300);

      setTimeout(() => inputRef.current?.focus?.(), 100);
    } catch {
      Alert.alert(t('common.error'), t('comments.failedToPost'));
    } finally {
      setIsPosting(false);
    }
  }, [post, newCommentText, selectedGif, selectedImages, replyContext, isPosting, queryClient, t]);

  // Scroll to newly posted comment after it appears in the list
  useEffect(() => {
    if (
      !postedCommentUri ||
      !flattenedComments.length ||
      commentsLoading ||
      !commentsListRef.current
    ) {
      return;
    }

    const idx = flattenedComments.findIndex(c => {
      const uri = c?.uri;
      return uri === postedCommentUri;
    });

    if (idx >= 0 && idx < flattenedComments.length) {
      // Comment found, scroll to it
      setTimeout(() => {
        try {
          commentsListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
          setPostedCommentUri(null); // Clear after scrolling
        } catch {
          // If scrollToIndex fails, try scrolling to end as fallback
          try {
            commentsListRef.current?.scrollToOffset({ offset: 0, animated: true });
          } catch {
            // ignore
          }
          setPostedCommentUri(null);
        }
      }, 500);
    } else if (!commentsLoading) {
      // Comment not found yet but loading is done - might need more time or scroll to bottom
      setTimeout(() => {
        try {
          // Scroll to end as fallback
          const itemCount = flattenedComments.length;
          if (itemCount > 0) {
            commentsListRef.current?.scrollToIndex({ index: itemCount - 1, animated: true });
          }
        } catch {
          // ignore
        }
        // Clear after a delay even if not found
        setTimeout(() => setPostedCommentUri(null), 1000);
      }, 500);
    }
  }, [postedCommentUri, flattenedComments, commentsLoading]);

  const tabOptions: TabOption[] = [
    {
      id: 'comments',
      label:
        totalComments > 0
          ? t('comments.commentsCount', { formattedCount: formatNumber(totalComments) })
          : t('comments.comments'),
    },
    {
      id: 'likes',
      label:
        totalLikes > 0
          ? t('comments.likesCount', { formattedCount: formatNumber(totalLikes) })
          : t('comments.likes'),
    },
  ];

  const handleTabPress = (tabId: string) => {
    const next = tabId as 'comments' | 'likes';
    setActiveTab(next);
    if (next === 'likes') setLikesQueryEnabled(true);
  };

  const handleClose = () => {
    setNewCommentText('');
    setSelectedGif(null);
    setSelectedImages([]);
    setActiveTab('comments');
    setLikesQueryEnabled(false);
    setFullscreenImageUri(null);
    setInputSelection({ start: 0, end: 0 });
    setReplyContext(null);
    setIsPosting(false);
    onDismiss?.();
  };

  // Control TrueSheet visibility via instance ref (TrueSheet v3+)
  // Guard: only call present() once per open (avoids double-open when effect runs twice or two instances existed)
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const postUri = post?.uri ?? null;
    if (visible && post && postUri) {
      if (lastPresentedPostUriRef.current !== postUri) {
        lastPresentedPostUriRef.current = postUri;
        sheet.present().catch(() => {});
      }
    } else {
      if (lastPresentedPostUriRef.current !== null) {
        lastPresentedPostUriRef.current = null;
      }
      sheet.dismiss().catch(() => {});
    }
  }, [visible, post, post?.uri]);

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
        if (item.actor.did) {
          setTimeout(() => {
            router.navigate({
              pathname: '/profile/[did]',
              params: { did: item.actor.did },
            });
          }, 100);
        }
      };

      return <CommentLikeItem like={item} onPress={handlePress} />;
    },
    [onDismiss, router]
  );

  const CommentsEmptyComponent = commentsLoading ? (
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

  const LikesEmptyComponent = likesLoading ? (
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

  const onEndReachedComments = useCallback(() => {
    if (hasNextCommentsPage && !isFetchingNextCommentsPage) fetchNextCommentsPage();
  }, [hasNextCommentsPage, isFetchingNextCommentsPage, fetchNextCommentsPage]);

  const onEndReachedLikes = useCallback(() => {
    if (hasNextLikesPage && !isFetchingNextLikesPage) fetchNextLikesPage();
  }, [hasNextLikesPage, isFetchingNextLikesPage, fetchNextLikesPage]);

  const placeholder = replyContext
    ? t('comments.replyingTo', { name: replyContext.authorName })
    : t('comments.saySomething');

  const ComposerFooter = (
    <CommentInputFooter
      value={newCommentText}
      onChangeText={setNewCommentText}
      inputSelection={inputSelection}
      onSelectionChange={e => setInputSelection(e.nativeEvent.selection)}
      placeholder={placeholder}
      onSubmit={handleSendComment}
      onPressGif={openGifPicker}
      onPressPhotos={handlePickImages}
      selectedGifPreviewUri={selectedGif?.previewUrl ?? null}
      selectedGifAspectRatio={
        selectedGif?.width && selectedGif?.height && selectedGif.height > 0
          ? selectedGif.width / selectedGif.height
          : null
      }
      selectedImages={selectedImages}
      hasAttachment={!!selectedGif || selectedImages.length > 0}
      onClearAttachment={() => {
        setSelectedGif(null);
        setSelectedImages([]);
      }}
      onClearGif={() => setSelectedGif(null)}
      onRemoveImage={handleRemoveSelectedImage}
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
    />
  );

  const headerComponent = (
    <View style={styles.header}>
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

        <Pressable
          onPress={handleHeaderSharePress}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreFillIcon size={20} color={Colors.neutral[400]} />
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
                  ? Colors.coral[500]
                  : Colors.neutral[400]
              }
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );

  return (
    <>
      <AppTrueSheet
        ref={sheetRef}
        name="comment-section"
        detents={scrollToCommentUri ? [1] : [0.5, 1]}
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
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onEndReached={onEndReachedComments}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
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
              ItemSeparatorComponent={() => <View style={styles.likeDivider} />}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onEndReached={onEndReachedLikes}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              overrideItemLayout={layout => {
                layout.span = LIKE_ITEM_ESTIMATE;
              }}
              removeClippedSubviews={true}
              drawDistance={250}
              ListEmptyComponent={LikesEmptyComponent}
            />
          )}
        </View>
      </AppTrueSheet>

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
            <CloseFillIcon size={28} color={Colors.neutral[50]} />
          </Pressable>
        </Pressable>
      </Modal>

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
    fontSize: 15,
    fontFamily: FontFamily.medium,
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
    color: Colors.neutral[50],
    fontSize: 17,
    textAlign: 'center',
    fontFamily: 'Figtree-SemiBold',
  },

  likeDivider: {
    height: 1,
    backgroundColor: Colors.neutral[900],
    marginLeft: 52,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay.black95,
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
    backgroundColor: Colors.overlay.black70,
    borderRadius: BORDER_RADIUS.LARGE,
    padding: 12,
  },
});

export default CommentSection;
