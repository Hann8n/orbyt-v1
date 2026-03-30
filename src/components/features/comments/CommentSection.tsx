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
import { Image as ImageCompressor } from 'react-native-compressor';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { FlashList, ListRenderItem, FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { navigateToProfileImageViewer } from '@/utils/navigation/profileImageViewer';

import { TrueSheet } from '@lodev09/react-native-true-sheet';
import type { TrueSheet as TrueSheetHandle } from '@lodev09/react-native-true-sheet';
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
import { HeartFillIcon, MoreFillIcon } from '../../ui/Icon';
import RelativeDate from '../../ui/RelativeDate';
import { useUserSearchTrigger } from '../../ui/usersearch';
import { APP_CONSTANTS, QUERY_CONSTANTS } from '../../../utils/constants';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { FontFamily } from '../../../utils/components/typography';
import CommentInputFooter from './CommentInputFooter';
import CommentItem from './CommentItem';
import { CommentLikeItem } from './CommentLikeItem';
import KlipyGifPickerSheet from './KlipyGifPickerSheet';
import type { Comment, Like } from '../../../services/api/types';
import type { KlipyItem } from '../../../services/klipy/KlipyService';

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
  const MAX_UPLOAD_BYTES = 1_000_000;
  const TARGET_MAX_BYTES = 950_000;

  const readSize = async (targetUri: string): Promise<number> => {
    const response = await fetch(targetUri);
    if (!response.ok) throw new Error(`Failed to read image (${response.status})`);
    const blob = await response.blob();
    return blob.size;
  };

  let candidateUri = uri;
  let size = await readSize(candidateUri);
  if (size <= MAX_UPLOAD_BYTES) return candidateUri;

  const qualitySteps = [0.8, 0.65, 0.5, 0.4];
  for (const quality of qualitySteps) {
    candidateUri = await ImageCompressor.compress(candidateUri, {
      compressionMethod: 'manual',
      output: 'jpg',
      quality,
      maxWidth: 1600,
      maxHeight: 1600,
    });
    size = await readSize(candidateUri);
    if (size <= TARGET_MAX_BYTES) return candidateUri;
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
  const listContentStyle = useMemo(
    () => [
      styles.listContent,
      {
        paddingBottom: listBottomPadding + (typeof insets?.bottom === 'number' ? insets.bottom : 0),
      },
    ],
    [listBottomPadding, insets?.bottom]
  );

  const klipySheetRef = useRef<TrueSheetHandle>(null);
  const [presentedPostUri, setPresentedPostUri] = useState<string | null>(null);
  const commentsListRef = useRef<FlashListRef<Comment> | null>(null);
  const likesListRef = useRef<FlashListRef<Like> | null>(null);

  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');
  const [likesQueryEnabled, setLikesQueryEnabled] = useState(false);

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
  const currentUserHandle = currentUser?.handle || null;
  const { data: currentUserProfile } = useProfile(currentUserHandle);

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
      likeUri: undefined as string | undefined,
      isReposted: false,
      isBookmarked: false,
      repostCount: 0,
    }),
    [isLiked, totalLikes]
  );
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
      // Prevent render loops: this effect can re-run whenever `persistedHeaderInteraction` identity changes.
      // We only update state if the boolean actually differs.
      setHeaderIsLiked(prev => (prev === synced ? prev : synced));
      setHeaderVisualLiked(prev => (prev === synced ? prev : synced));
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

  // When switching posts (or dismissing/re-opening the sheet), ensure any in-flight
  // heart animation doesn't "complete" on the next video.
  useEffect(() => {
    cancelAnimation(headerHeartScale);
    headerHeartScale.value = 1;
    setHeaderIsPending(false);
    setHeaderLikeUri(undefined);
  }, [post?.uri, headerHeartScale]);

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
            thumb: klipyThumbUrlForEmbed(selectedGif!),
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
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('1,000,000 byte limit') || message.includes('too large')) {
        Alert.alert(t('common.error'), 'Image is too large to upload. Try a smaller photo.');
      } else {
        Alert.alert(t('common.error'), t('comments.failedToPost'));
      }
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
    setPresentedPostUri(null);
    cancelAnimation(headerHeartScale);
    headerHeartScale.value = 1;
    setHeaderIsPending(false);
    setHeaderLikeUri(undefined);
    setNewCommentText('');
    setSelectedGif(null);
    setSelectedImages([]);
    setActiveTab('comments');
    setLikesQueryEnabled(false);
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
    ({ item }) => {
      const level = item.parent ? 1 : 0;
      return (
        <CommentItem
          comment={item}
          onDismiss={onDismiss}
          onImagePress={navigateToProfileImageViewer}
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

  const overrideCommentsItemLayout = useCallback((layout: { span?: number }) => {
    layout.span = COMMENT_ITEM_ESTIMATE;
  }, []);

  const overrideLikesItemLayout = useCallback((layout: { span?: number }) => {
    layout.span = LIKE_ITEM_ESTIMATE;
  }, []);

  const ItemSeparatorComponent = useCallback(() => {
    return <View style={styles.likeDivider} />;
  }, []);

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

        <NativePressable
          onPress={handleHeaderSharePress}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreFillIcon size={20} color={Colors.neutral[400]} />
        </NativePressable>

        <NativePressable
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
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onEndReached={onEndReachedComments}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              overrideItemLayout={overrideCommentsItemLayout}
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
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onEndReached={onEndReachedLikes}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              overrideItemLayout={overrideLikesItemLayout}
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
});

export default CommentSection;
