import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { compressImage } from 'expo-image-and-video-compressor';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { FlashList, ListRenderItem, FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { navigateToProfileImageViewer } from '@/utils/navigation/profileImageViewer';

import { TrueSheet } from '@lodev09/react-native-true-sheet';
import type { TrueSheet as TrueSheetHandle } from '@lodev09/react-native-true-sheet';
import { AppTrueSheet, useMeasuredFooterHeight } from '../../../utils/components/truesheet';

import { AtprotoFeedService } from '../../../services/api/feed/FeedService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useProfileByDid } from '../../../services/data/ProfileService';
import { useUserStore } from '../../../stores/userStore';
import {
  mergePostInteractionDelta,
  usePostInteractionStore,
} from '../../../stores/postInteractionStore';
import { useCommentStore } from '../../../stores/commentStore';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';
import { useModalStore } from '../../../stores/modalStore';
import { useGlobalShareSheet } from '../../../hooks/useGlobalModals';
import { useLikeInteraction } from '@/hooks/useLikeInteraction';

import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { Colors } from '../../../theme';
import { NanoIcon } from '../../ui/NanoIcon';
import RelativeDate from '../../ui/RelativeDate';
import { useUserSearchTrigger } from '../../ui/usersearch';
import {
  APP_CONSTANTS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { FontFamily, Typography, fontSizeFor } from '../../../utils/components/typography';
import CommentInputFooter from './CommentInputFooter';
import CommentItem from './CommentItem';
import { CommentLikeItem } from './CommentLikeItem';
import KlipyGifPickerSheet from './KlipyGifPickerSheet';
import type { Comment, Like } from '../../../services/api/types';
import type { KlipyItem } from '../../../services/klipy/KlipyService';
import { BSKY_LEXICON_EMBED_IMAGE_BLOB_MAX_BYTES } from '../../../utils/atproto/blueskyLexiconMediaLimits';

function normalizeKlipyAssetUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const t = url.trim();
  if (!t) return undefined;
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

function isLikelyRasterImageUrl(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return /\.(gif|webp|png|jpe?g)$/i.test(clean);
}

async function ensureCommentUploadImage(uri: string): Promise<string> {
  /** app.bsky.embed.images — validated against AT Protocol lexicon, not a client guess */
  const maxBytes = BSKY_LEXICON_EMBED_IMAGE_BLOB_MAX_BYTES;
  const targetMaxBytes = Math.floor(maxBytes * 0.95);

  const readSize = async (targetUri: string): Promise<number> => {
    const response = await fetch(targetUri);
    if (!response.ok) throw new Error(`Failed to read image (${response.status})`);
    const blob = await response.blob();
    return blob.size;
  };

  let candidateUri = uri;
  let size = await readSize(candidateUri);
  if (size <= maxBytes) return candidateUri;

  const qualitySteps = [0.8, 0.65, 0.5, 0.4];
  for (const quality of qualitySteps) {
    candidateUri = await compressImage(candidateUri, {
      output: 'jpg',
      quality,
      maxWidth: 1600,
      maxHeight: 1600,
    });
    size = await readSize(candidateUri);
    if (size <= targetMaxBytes) return candidateUri;
  }

  throw new Error('Selected image is too large to upload');
}

/** Prefer static preview for Bluesky thumb upload; allow protocol-relative URLs and image fullUrl fallback. */
function klipyThumbUrlForEmbed(item: KlipyItem): string | undefined {
  const preview = normalizeKlipyAssetUrl(item.previewUrl);
  const full = normalizeKlipyAssetUrl(item.fullUrl);
  if (preview && /^https?:\/\//.test(preview)) return preview;
  if (full && /^https?:\/\//.test(full) && isLikelyRasterImageUrl(full)) return full;
  return undefined;
}

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

const MAX_COMMENT_LENGTH = 300;
const OPTIMISTIC_COMMENT_PREFIX = 'optimistic-comment:';

const commentKeyExtractor = (item: Comment, index: number): string =>
  item?.uri || item?.cid || `comment-${index}`;

const likeKeyExtractor = (item: Like): string => `${item.actor.did}-${item.createdAt}`;

type CommentsPage = { comments: Comment[]; cursor: string | null };

function insertReplyInTree(
  comments: Comment[],
  parentUri: string,
  reply: Comment
): { next: Comment[]; inserted: boolean } {
  let inserted = false;

  const next = comments.map(comment => {
    if (inserted) return comment;

    if (comment.uri === parentUri) {
      inserted = true;
      return {
        ...comment,
        replies: [reply, ...(comment.replies ?? [])],
      };
    }

    if (comment.replies?.length) {
      const child = insertReplyInTree(comment.replies, parentUri, reply);
      if (child.inserted) {
        inserted = true;
        return {
          ...comment,
          replies: child.next,
        };
      }
    }

    return comment;
  });

  return { next, inserted };
}

type FeedLikeItem = { post?: { uri?: string; replyCount?: number } };

function bumpReplyCountInFeedItems(
  items: FeedLikeItem[] | undefined,
  targetPostUri: string,
  delta: number
): FeedLikeItem[] | undefined {
  if (!Array.isArray(items)) return items;

  let changed = false;
  const nextItems = items.map(item => {
    if (!item?.post?.uri || item.post.uri !== targetPostUri) return item;
    changed = true;
    return {
      ...item,
      post: {
        ...item.post,
        replyCount: Math.max(0, (item.post.replyCount ?? 0) + delta),
      },
    };
  });

  return changed ? nextItems : items;
}

function bumpReplyCountInFeedCacheData(
  oldData: unknown,
  targetPostUri: string,
  delta: number
): unknown {
  if (!oldData || typeof oldData !== 'object') return oldData;

  const data = oldData as {
    feed?: FeedLikeItem[];
    pages?: Array<{ feed?: FeedLikeItem[] }>;
  };

  if (Array.isArray(data.pages)) {
    let changed = false;
    const nextPages = data.pages.map(page => {
      const nextFeed = bumpReplyCountInFeedItems(page.feed, targetPostUri, delta);
      if (nextFeed !== page.feed) {
        changed = true;
        return { ...page, feed: nextFeed };
      }
      return page;
    });
    return changed ? { ...data, pages: nextPages } : oldData;
  }

  if (Array.isArray(data.feed)) {
    const nextFeed = bumpReplyCountInFeedItems(data.feed, targetPostUri, delta);
    return nextFeed !== data.feed ? { ...data, feed: nextFeed } : oldData;
  }

  return oldData;
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
  const scrollToCommentUri = globalData?.scrollToCommentUri;
  const [displayedTotalComments, setDisplayedTotalComments] = useState(totalComments);

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
      // Retry once because native pickers/sheets can briefly steal focus during close animation.
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

  const { currentUser } = useUserStore();
  const { data: currentUserProfile } = useProfileByDid(currentUser?.did ?? null);

  const { inputProps: mentionInputProps, userSearchModalProps } = useUserSearchTrigger({
    value: newCommentText,
    selection: inputSelection,
    onChangeText: setNewCommentText,
    onSelectionChange: e => setInputSelection(e.nativeEvent.selection),
  });

  const defaultHeaderInteraction = useMemo(
    () => ({
      isLiked: !!isLiked,
      likeCount: totalLikes,
      commentCount: totalComments,
      likeUri: undefined as string | undefined,
      isReposted: false,
      isBookmarked: false,
      repostCount: 0,
    }),
    [isLiked, totalLikes, totalComments]
  );
  const headerInteractionDelta = usePostInteractionStore(state =>
    post?.uri ? state.interactions.get(post.uri) : undefined
  );
  const persistedHeaderInteraction = useMemo(
    () =>
      post?.uri
        ? mergePostInteractionDelta(defaultHeaderInteraction, headerInteractionDelta)
        : null,
    [post?.uri, defaultHeaderInteraction, headerInteractionDelta]
  );
  const updatePostInteraction = usePostInteractionStore(state => state.updatePostInteraction);
  const deletedComments = useCommentStore(state => state.deletedComments);

  useEffect(() => {
    const nextCount = post?.uri
      ? (persistedHeaderInteraction?.commentCount ?? totalComments)
      : totalComments;
    setDisplayedTotalComments(nextCount);
  }, [post?.uri, totalComments, persistedHeaderInteraction?.commentCount]);

  const [headerLikeState, setHeaderLikeState] = useState<{
    isLiked: boolean;
    likeCount: number;
    likeUri?: string | undefined;
    isLikePending: boolean;
  }>(() => ({
    isLiked: post?.uri ? (persistedHeaderInteraction?.isLiked ?? !!isLiked) : !!isLiked,
    likeCount: post?.uri ? (persistedHeaderInteraction?.likeCount ?? totalLikes) : totalLikes,
    likeUri: post?.uri ? persistedHeaderInteraction?.likeUri : undefined,
    isLikePending: false,
  }));
  const [headerVisualLiked, setHeaderVisualLiked] = useState<boolean>(() => {
    if (!post?.uri) return !!isLiked;
    return persistedHeaderInteraction?.isLiked ?? !!isLiked;
  });
  const resolvedTotalLikes = post?.uri ? headerLikeState.likeCount : totalLikes;

  useEffect(() => {
    if (!post?.uri) {
      const fallbackLiked = !!isLiked;
      setHeaderLikeState(prev => ({
        ...prev,
        isLiked: fallbackLiked,
        likeCount: totalLikes,
        likeUri: undefined,
        isLikePending: false,
      }));
      setHeaderVisualLiked(prev => (prev === fallbackLiked ? prev : fallbackLiked));
      return;
    }

    if (persistedHeaderInteraction) {
      const storeState = persistedHeaderInteraction;
      setHeaderLikeState(prev => ({
        ...prev,
        isLiked: storeState.isLiked,
        likeCount: storeState.likeCount,
        likeUri: storeState.likeUri,
      }));
      setDisplayedTotalComments(storeState.commentCount);
      setHeaderVisualLiked(prev => (prev === storeState.isLiked ? prev : storeState.isLiked));
      return;
    }

    const fallbackLiked = !!isLiked;
    setHeaderLikeState(prev => ({
      ...prev,
      isLiked: fallbackLiked,
      likeCount: totalLikes,
      likeUri: undefined,
    }));
    setDisplayedTotalComments(totalComments);
    setHeaderVisualLiked(prev => (prev === fallbackLiked ? prev : fallbackLiked));
    updatePostInteraction(post.uri, {
      isLiked: fallbackLiked,
      likeCount: totalLikes,
      commentCount: totalComments,
    });
  }, [
    isLiked,
    totalLikes,
    totalComments,
    post?.uri,
    persistedHeaderInteraction,
    updatePostInteraction,
  ]);

  const headerHeartScale = useSharedValue(1);
  const headerHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerHeartScale.value }],
  }));

  // When switching posts (or dismissing/re-opening the sheet), ensure any in-flight
  // heart animation doesn't "complete" on the next video.
  useEffect(() => {
    cancelAnimation(headerHeartScale);
    headerHeartScale.value = 1;
    setHeaderLikeState(prev => ({ ...prev, isLikePending: false }));
  }, [post?.uri, headerHeartScale]);

  const { toggleLike: handleHeaderToggleLikeInternal } = useLikeInteraction({
    state: headerLikeState,
    setState: setHeaderLikeState,
    postUri: post?.uri,
    postCid: post?.cid,
    updatePostInteraction,
  });

  const handleHeaderToggleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextLiked = !headerLikeState.isLiked;
    setHeaderVisualLiked(nextLiked);
    if (nextLiked) {
      headerHeartScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
        headerHeartScale.value = withSpring(1);
      });
    } else {
      headerHeartScale.value = withSpring(1);
    }
    handleHeaderToggleLikeInternal();
  }, [handleHeaderToggleLikeInternal, headerHeartScale, headerLikeState.isLiked]);

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
      AtprotoFeedService.getComments(post?.uri || '', pageParam as string | null),
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post?.uri,
    structuralSharing: false, // Disable structural sharing to avoid circular reference issues with nested comment structures
  });

  // Track reported comments for animated removal
  const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);
  const previousCommentsLengthRef = useRef<number>(0);

  // Important: keep `flattenedComments` referentially stable.
  // FlashList can end up in a render/layout update loop if `data` changes identity every render.
  const flattenedComments = useMemo(() => {
    const comments = commentsPages?.pages.flatMap(p => p.comments) ?? [];

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

    if (comments.length > 0) addComments(comments);
    return flat;
  }, [commentsPages, deletedComments, reportedPostUris]);

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
      AtprotoFeedService.getLikes(post?.uri || '', pageParam as string | null),
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
  const [postedCommentUri, setPostedCommentUri] = useState<string | null>(null);

  const handleSendComment = useCallback(async () => {
    if (!post?.uri) return;

    const text = newCommentText.trim();
    const hasGif = !!selectedGif?.fullUrl;
    const hasImages = selectedImages.length > 0;
    if ((!text && !hasGif && !hasImages) || isPosting) return;

    setIsPosting(true);

    const rootUri = post.uri;
    const rootCid = post.cid || '';

    const parentUri = replyContext?.parentUri ?? rootUri;
    const parentCid = replyContext?.parentCid ?? rootCid;
    const isReply = parentUri !== rootUri;
    const queryKey = queryKeys.comments.byPost(post.uri);
    const tempId = `${OPTIMISTIC_COMMENT_PREFIX}${Date.now()}`;
    const now = new Date().toISOString();

    const optimisticComment: Comment = {
      uri: tempId,
      cid: tempId,
      author: {
        did: currentUser?.did ?? '',
        handle: currentUser?.handle ?? '',
        displayName: currentUserProfile?.displayName,
        avatar: currentUserProfile?.avatar,
      } as Comment['author'],
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: now,
      } as Comment['record'],
      indexedAt: now,
      likeCount: 0,
      replyCount: 0,
      replies: [],
    };

    const previousCommentsData = queryClient.getQueryData<InfiniteData<CommentsPage>>(queryKey);

    if (!isReply) {
      setDisplayedTotalComments(prev => {
        const next = prev + 1;
        updatePostInteraction(rootUri, { commentCount: next });
        return next;
      });
      queryClient.setQueriesData({ queryKey: queryKeys.feed.all }, old =>
        bumpReplyCountInFeedCacheData(old, rootUri, 1)
      );
    }

    queryClient.setQueryData<InfiniteData<CommentsPage>>(queryKey, old => {
      if (!old?.pages?.length) {
        return {
          pages: [{ comments: [optimisticComment], cursor: null }],
          pageParams: [null],
        };
      }

      if (isReply) {
        const [firstPage, ...restPages] = old.pages;
        const inserted = insertReplyInTree(firstPage.comments, parentUri, optimisticComment);
        if (!inserted.inserted) {
          // Parent may not be in the currently loaded tree yet. Fallback to temporary root insert.
          return {
            ...old,
            pages: [
              { ...firstPage, comments: [optimisticComment, ...firstPage.comments] },
              ...restPages,
            ],
          };
        }
        return {
          ...old,
          pages: [{ ...firstPage, comments: inserted.next }, ...restPages],
        };
      }

      const [firstPage, ...restPages] = old.pages;
      return {
        ...old,
        pages: [
          { ...firstPage, comments: [optimisticComment, ...firstPage.comments] },
          ...restPages,
        ],
      };
    });

    setPostedCommentUri(tempId);

    try {
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

      const result = await AtprotoFeedService.postComment(
        text,
        rootUri,
        rootCid,
        parentUri,
        parentCid,
        hasImages ? selectedImages : undefined,
        hasGif ? externalEmbed : undefined
      );

      queryClient.setQueryData<InfiniteData<CommentsPage>>(queryKey, old => {
        if (!old) return old;
        const replaceOptimistic = (comments: Comment[]): Comment[] =>
          comments.map(comment => {
            const updatedReplies = comment.replies?.length
              ? replaceOptimistic(comment.replies)
              : comment.replies;
            if (comment.uri === tempId) {
              return {
                ...comment,
                uri: result.uri,
                cid: result.cid,
                replies: updatedReplies,
              };
            }
            if (updatedReplies !== comment.replies) {
              return { ...comment, replies: updatedReplies };
            }
            return comment;
          });

        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            comments: replaceOptimistic(page.comments),
          })),
        };
      });

      setPostedCommentUri(result.uri);

      setNewCommentText('');
      setSelectedGif(null);
      setSelectedImages([]);
      setReplyContext(null);

      // Revalidate in background to sync authoritative ordering/counts from API.
      void queryClient.invalidateQueries({
        queryKey,
      });

      setTimeout(() => inputRef.current?.focus?.(), 100);
    } catch (error) {
      if (!isReply) {
        setDisplayedTotalComments(prev => {
          const next = Math.max(0, prev - 1);
          updatePostInteraction(rootUri, { commentCount: next });
          return next;
        });
        queryClient.setQueriesData({ queryKey: queryKeys.feed.all }, old =>
          bumpReplyCountInFeedCacheData(old, rootUri, -1)
        );
      }
      if (previousCommentsData) {
        queryClient.setQueryData(queryKey, previousCommentsData);
      } else {
        queryClient.removeQueries({ queryKey });
      }
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('1,000,000 byte limit') || message.includes('too large')) {
        Alert.alert(t('common.error'), 'Image is too large to upload. Try a smaller photo.');
      } else {
        Alert.alert(t('common.error'), t('comments.failedToPost'));
      }
    } finally {
      setIsPosting(false);
    }
  }, [
    post,
    newCommentText,
    selectedGif,
    selectedImages,
    replyContext,
    isPosting,
    queryClient,
    updatePostInteraction,
    t,
    currentUser?.did,
    currentUser?.handle,
    currentUserProfile?.avatar,
    currentUserProfile?.displayName,
  ]);

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

  const tabOptions: TabOption[] = useMemo(
    () => [
      {
        id: 'comments',
        label:
          displayedTotalComments > 0
            ? t('comments.commentsCount', { formattedCount: formatNumber(displayedTotalComments) })
            : t('comments.comments'),
      },
      {
        id: 'likes',
        label:
          resolvedTotalLikes > 0
            ? t('comments.likesCount', { formattedCount: formatNumber(resolvedTotalLikes) })
            : t('comments.likes'),
      },
    ],
    [t, displayedTotalComments, resolvedTotalLikes]
  );

  const handleCommentDeleted = useCallback(
    (wasReply?: boolean) => {
      if (wasReply) return;
      setDisplayedTotalComments(prev => {
        const next = Math.max(0, prev - 1);
        if (post?.uri) {
          updatePostInteraction(post.uri, { commentCount: next });
        }
        return next;
      });
      if (!post?.uri) return;
      queryClient.setQueriesData({ queryKey: queryKeys.feed.all }, old =>
        bumpReplyCountInFeedCacheData(old, post.uri, -1)
      );
    },
    [post, queryClient, updatePostInteraction]
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
    setHeaderLikeState(prev => ({ ...prev, isLikePending: false }));
    setNewCommentText('');
    setSelectedGif(null);
    setSelectedImages([]);
    setActiveTab('comments');
    setLikesQueryEnabled(false);
    setIsListScrolled(false);
    setInputSelection({ start: 0, end: 0 });
    setReplyContext(null);
    setIsPosting(false);
    onDismiss?.();
  };

  // Control TrueSheet visibility via native global methods + lifecycle state
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
    ({ item, index }) => {
      const level = item.parent ? 1 : 0;
      const commentKey = item?.uri || item?.cid || `comment-${index}`;
      return (
        <CommentItem
          key={commentKey}
          comment={item}
          onDismiss={onDismiss}
          onCommentDeleted={handleCommentDeleted}
          onImagePress={navigateToProfileImageViewer}
          onReplyPress={handleReplyPress}
          highlightUri={scrollToCommentUri}
          level={level}
        />
      );
    },
    [scrollToCommentUri, onDismiss, handleCommentDeleted, handleReplyPress]
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

  const ComposerFooter = (
    <View style={styles.composerFooter}>
      {replyContext ? (
        <View style={styles.replyBanner}>
          <Text style={styles.replyBannerText} numberOfLines={1} ellipsizeMode="tail">
            {`${t('comments.replyingTo', { name: '' }).trim()} `}
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
        isPosting={isPosting}
        maxLength={MAX_COMMENT_LENGTH}
        inputRef={inputRef}
        currentUserAvatar={currentUserProfile?.avatar}
        userSearchModalProps={userSearchModalProps}
        mentionInputProps={mentionInputProps}
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
          disabled={headerLikeState.isLikePending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.actionButton}
        >
          <Animated.View style={headerHeartStyle}>
            <NanoIcon
              name="heart-fill"
              size={26}
              color={headerVisualLiked ? Colors.coral[500] : Colors.neutral[500]}
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
              nestedScrollEnabled
              scrollEventThrottle={16}
              onScroll={handleListScroll}
              onEndReached={onEndReachedComments}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
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
              ItemSeparatorComponent={ItemSeparatorComponent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={
                likes.length >= SCROLL_INDICATOR_CONSTANTS.COMMENTS_MIN_ITEMS
              }
              nestedScrollEnabled
              scrollEventThrottle={16}
              onScroll={handleListScroll}
              onEndReached={onEndReachedLikes}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              removeClippedSubviews={true}
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
    paddingTop: 12,
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
  },
  actionButton: {
    padding: 0,
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
    color: Colors.neutral[200],
    fontSize: fontSizeFor(13),
    fontFamily: FontFamily.medium,
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  replyBannerNameText: {
    color: Colors.neutral[200],
    fontSize: fontSizeFor(13),
    fontFamily: FontFamily.bold,
  },
  replyBannerCloseButton: {
    paddingVertical: 2,
  },
  replyBannerCloseText: {
    color: Colors.neutral[300],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
  },
});

export default CommentSection;
