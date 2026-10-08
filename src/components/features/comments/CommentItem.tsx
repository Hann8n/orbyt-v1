import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Linking,
  Share,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { buildFeedModalHref } from '@/utils/navigation/feedModalRoute';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { useQueryClient } from '@tanstack/react-query';
import { AtUri } from '@atproto/api';
import { prefetchProfile } from '../../../services/data/ProfileService';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';

import {
  isCommentLikePending,
  useLikeCommentMutation,
  useDeleteCommentMutation,
  useRepostCommentMutation,
} from '../../../hooks/useCommentMutations';
import { isConfirmedUri } from '../../../utils/query/viewerToggle';
import { ModerationService } from '../../../services/moderation/ModerationService';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { Typography, FontFamily, TextStyles } from '../../../utils/components/typography';
import { hexToRGBA } from '../../../utils/formatting/colors';
import { Colors } from '../../../theme';
import UI from '../../ui/UI';
import { NanoIcon } from '../../ui/NanoIcon';
import { VerificationBadge, BotBadge } from '../badging';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate from '../../ui/RelativeDate';
import { useUserStore } from '../../../stores/userStore';
import type { Comment } from '../../../services/api/types';

interface CommentItemProps {
  comment: Comment;
  onDismiss?: () => void;
  onCommentDeleted?: (wasReply?: boolean) => void;
  onReplyPress?: (comment: Comment) => void;
  rootUri?: string;
  rootCid?: string;
  level?: number;
  onImagePress?: (uri: string) => void;
  highlightUri?: string;
  onLayoutChange?: () => void;
}

function getCommentUri(c: Comment) {
  return c?.uri;
}
function getCommentCid(c: Comment) {
  return c?.cid;
}
function getCommentLikeCount(c: Comment) {
  return c?.likeCount ?? 0;
}
function getCommentText(c: Comment) {
  return c?.record?.text || '';
}
function getCommentFacets(c: Comment) {
  return c?.record?.facets;
}
function getCommentEmbed(c: Comment) {
  return c?.embed ?? c?.record?.embed;
}

const GALLERY_MAX_HEIGHT = 280;
const CAROUSEL_FIXED_HEIGHT = 200;
const GALLERY_ITEM_GAP = 8;
// Must match CommentSection listContent paddingHorizontal — carousel breaks out with negative margin
const LIST_PADDING_H = 20;

/** Repo DID for CDN blob URLs — author.did, or parsed from at:// URI when author is minimal. */
function getCommentRepoDid(comment: Comment): string | undefined {
  const fromAuthor = comment?.author?.did;
  if (fromAuthor) return fromAuthor;
  const uri = comment?.uri;
  if (!uri || typeof uri !== 'string') return undefined;
  try {
    return new AtUri(uri).hostname;
  } catch {
    return undefined;
  }
}

function resolveExternalThumbUrl(
  thumb: string | { ref?: { $link?: string }; cid?: string; $type?: string } | undefined,
  authorDid: string | undefined
): string | undefined {
  if (!thumb) return undefined;
  if (typeof thumb === 'string') {
    const t = thumb.trim();
    if (t.startsWith('https://') || t.startsWith('http://')) return t;
    if (t.startsWith('//')) return `https:${t}`;
    return undefined;
  }
  const ref =
    (typeof thumb.ref === 'object' && thumb.ref && typeof thumb.ref.$link === 'string'
      ? thumb.ref.$link
      : undefined) ?? (typeof thumb.cid === 'string' ? thumb.cid : undefined);
  if (ref && authorDid) {
    return `https://cdn.bsky.app/img/feed_thumbnail/plain/${encodeURIComponent(authorDid)}/${encodeURIComponent(ref)}@jpeg`;
  }
  return undefined;
}

function isInlineImageUrl(url: string): boolean {
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url.split('?')[0])) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('klipy') || host.includes('giphy') || host.includes('tenor');
  } catch {
    return false;
  }
}

interface EmbedImage {
  alt: string;
  thumb: string;
  fullsize: string;
  aspectRatio?: { width: number; height: number };
}

interface GalleryImageItemProps {
  img: EmbedImage;
  idx: number;
  maxWidth: number;
  onImagePress?: (uri: string) => void;
  isCarousel?: boolean;
}

const GalleryImageItem: React.FC<GalleryImageItemProps> = ({
  img,
  idx,
  maxWidth,
  onImagePress,
  isCarousel = false,
}) => {
  const imageUri = img.fullsize || img.thumb;

  const dims = React.useMemo(() => {
    const arObj = img.aspectRatio;
    const ar = arObj && arObj.height > 0 ? arObj.width / arObj.height : 4 / 3;

    if (isCarousel) {
      return {
        width: Math.min(Math.round(CAROUSEL_FIXED_HEIGHT * ar), Math.round(maxWidth * 0.75)),
        height: CAROUSEL_FIXED_HEIGHT,
      };
    }

    const h = Math.min(maxWidth / ar, GALLERY_MAX_HEIGHT);
    const finalH = Math.max(h, 80);
    return {
      width: Math.round(Math.min(finalH * ar, maxWidth)),
      height: Math.round(finalH),
    };
  }, [img.aspectRatio, maxWidth, isCarousel]);

  return (
    <NativePressable
      style={[galleryStyles.item, { width: dims.width, height: dims.height }]}
      onPress={() => onImagePress?.(imageUri)}
      accessibilityRole="imagebutton"
      accessibilityLabel={img.alt || undefined}
    >
      <Image
        source={{ uri: img.thumb || img.fullsize }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={idx < 2 ? 'high' : 'normal'}
        recyclingKey={imageUri}
        loading={idx === 0 ? 'eager' : 'lazy'}
        transition={200}
      />
    </NativePressable>
  );
};

const CommentImageGallery: React.FC<{
  images: EmbedImage[];
  onImagePress?: (uri: string) => void;
  availableWidth: number;
}> = ({ images, onImagePress, availableWidth }) => {
  const { width: screenWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = React.useState(availableWidth);

  const handleLayout = React.useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      const w = event.nativeEvent.layout.width;
      if (w > 0) setContainerWidth(w);
    },
    []
  );

  if (images.length === 1) {
    return (
      <View style={galleryStyles.outer} onLayout={handleLayout}>
        <GalleryImageItem
          img={images[0]}
          idx={0}
          maxWidth={containerWidth}
          onImagePress={onImagePress}
          isCarousel={false}
        />
      </View>
    );
  }

  return (
    <View style={[galleryStyles.outer, galleryStyles.carouselOuter]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={false}
        contentContainerStyle={galleryStyles.carouselContent}
        style={galleryStyles.carouselScroll}
      >
        {images.map((img, idx) => (
          <GalleryImageItem
            key={img.thumb || img.fullsize || String(idx)}
            img={img}
            idx={idx}
            maxWidth={screenWidth}
            onImagePress={onImagePress}
            isCarousel={true}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const galleryStyles = StyleSheet.create({
  outer: {
    marginTop: 8,
    marginBottom: 4,
    width: '100%',
  },
  carouselOuter: {
    // Break right edge out of the list's paddingHorizontal so scroll reaches screen edge
    marginRight: -LIST_PADDING_H,
  },
  carouselScroll: {
    maxHeight: CAROUSEL_FIXED_HEIGHT + 8,
  },
  carouselContent: {
    gap: GALLERY_ITEM_GAP,
    alignItems: 'flex-start',
    paddingRight: LIST_PADDING_H,
    paddingVertical: 4,
  },
  item: {
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[900],
  },
});

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  onDismiss,
  onCommentDeleted,
  onReplyPress,
  rootUri: _rootUri,
  rootCid: _rootCid,
  level = 0,
  onImagePress,
  highlightUri,
  onLayoutChange: _onLayoutChange,
}) => {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const uri = getCommentUri(comment);
  const cid = getCommentCid(comment);

  const currentUserDid = useUserStore(state => state.currentUser?.did);

  const { mutate: likeComment, isPending: isLiking } = useLikeCommentMutation();
  const { mutate: deleteComment } = useDeleteCommentMutation();
  const { mutate: repostComment } = useRepostCommentMutation();

  const likeCount = getCommentLikeCount(comment);
  const isLiked = !!comment.viewer?.like;

  const queryClient = useQueryClient();

  // Animation values for heart interaction
  const heartScale = useSharedValue(1);
  const heartOpacity = useSharedValue(1);
  const isAnimating = useRef(false);

  // Highlight animation for target comment
  const shouldHighlight = highlightUri && uri === highlightUri;
  const highlightOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (!shouldHighlight) return undefined;
    let fadeOutTimeout: ReturnType<typeof setTimeout> | null = null;
    const delayTimeout = setTimeout(() => {
      highlightOpacity.value = withTiming(1, {
        duration: 450,
        easing: Easing.out(Easing.cubic),
      });
      fadeOutTimeout = setTimeout(() => {
        highlightOpacity.value = withTiming(0, {
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
        });
      }, 2000);
    }, 500);

    return () => {
      clearTimeout(delayTimeout);
      if (fadeOutTimeout) clearTimeout(fadeOutTimeout);
    };
  }, [shouldHighlight, highlightOpacity]);

  const highlightStyle = useAnimatedStyle(() => {
    const alpha = highlightOpacity.value * 0.12;
    const safeAlpha = alpha < 0.0001 ? 0 : Math.min(1, alpha);
    return {
      backgroundColor: `rgba(136, 145, 171, ${safeAlpha})`,
    };
  });

  const author = comment?.author;
  const authorName = formatHandle(author?.handle || '') || t('feed.unknownUser');
  const authorHandle = formatHandle(author?.handle || '');
  const authorDid = author?.did || null;
  const authorAvatar = author?.avatar ?? undefined;

  // ProfileViewBasic (comment.author) already embeds viewer state from the AppView.
  const isAuthorBlocked = !!(author?.viewer?.blocking || author?.viewer?.blockingByList);

  const commentText = useMemo(() => getCommentText(comment), [comment]);

  const facets = useMemo(() => getCommentFacets(comment), [comment]);

  const parent = comment?.parent;
  const parentAuthorName = useMemo(() => {
    if (!parent) return null;
    return formatHandle(parent?.author?.handle || '') || t('feed.unknownUser');
  }, [parent, t]);

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

  const handleLikeComment = useCallback(() => {
    if (!uri || !cid || isCommentLikePending(queryClient, uri)) return;
    const likeUri = comment.viewer?.like;
    // Still the placeholder of a like that has not been confirmed: nothing to delete yet.
    if (isLiked && !isConfirmedUri(likeUri)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!isLiked) {
      animateHeart();
    }

    likeComment(
      { uri, cid, isLiked, likeUri, likeCount },
      {
        onError: () => {
          Alert.alert(t('common.error'), t('comments.failedToLike'));
        },
      }
    );
  }, [
    queryClient,
    uri,
    cid,
    isLiked,
    likeCount,
    comment.viewer?.like,
    animateHeart,
    likeComment,
    t,
  ]);

  const navigation = useRouter();
  const { navigateToProfile: goToProfile, currentTab: feedModalTab } =
    useProfileChannelNavigation();

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

      goToProfile(cleanDid);
    },
    [goToProfile, onDismiss, queryClient]
  );

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
      navigation.navigate(
        buildFeedModalHref(
          {
            feedOption: `hashtag:${hashtag}`,
            initialPostUri: '',
          },
          feedModalTab
        )
      );
    },
    [navigation, feedModalTab]
  );

  const handleAuthorAvatarPress = () => {
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
  };

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
  const isCurrentUserComment = !!currentUserDid && commentAuthorDid === currentUserDid;

  const isReply = level > 0 || !!comment?.parent;
  const postType = isReply ? 'reply' : 'comment';

  const canCopyOrShareText = !!commentText?.trim();

  const handleCopyText = useCallback(async () => {
    if (!canCopyOrShareText) return;
    try {
      await Clipboard.setStringAsync(commentText.trim());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_error) {
      // ignore
    }
  }, [canCopyOrShareText, commentText]);

  const handleShareText = useCallback(async () => {
    if (!canCopyOrShareText) return;
    try {
      await Share.share({
        message: commentText.trim(),
      });
    } catch (_error) {
      // ignore
    }
  }, [canCopyOrShareText, commentText]);

  const handleRepost = useCallback(() => {
    if (!uri || !cid) return;
    repostComment(
      { uri, cid },
      {
        onSuccess: () =>
          Alert.alert(t('common.success'), t('comments.repostedSuccessfully', { postType })),
        onError: () => Alert.alert(t('common.error'), t('comments.failedToRepost', { postType })),
      }
    );
  }, [uri, cid, t, postType, repostComment]);

  const confirmDelete = useCallback(() => {
    if (!uri) return;
    const deleteTitle = isReply ? t('comments.deleteReply') : t('comments.deleteComment');
    Alert.alert(deleteTitle, t('comments.deleteConfirm', { postType }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('comments.delete'),
        style: 'destructive',
        onPress: () => {
          deleteComment(
            { uri },
            {
              onSuccess: () => onCommentDeleted?.(isReply),
              onError: () =>
                Alert.alert(t('common.error'), t('comments.failedToDelete', { postType })),
            }
          );
        },
      },
    ]);
  }, [uri, isReply, t, postType, onCommentDeleted, deleteComment]);

  const handlePinToProfile = useCallback(() => {
    try {
      Alert.alert(t('common.info'), t('comments.pinNotAvailable'));
    } catch (_error) {
      Alert.alert(t('common.error'), t('comments.failedToPin', { postType }));
    }
  }, [t, postType]);

  const openReportReasonPrompt = useCallback(() => {
    if (!uri) return;
    Alert.alert(t('comments.reportContent'), t('comments.reportReasonPrompt', { postType }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('alerts.spam'),
        onPress: async () => {
          try {
            const success = await ModerationService.reportContent(uri, 'spam');
            if (success) {
              const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
              useReportedPostsStore.getState().reportPost(uri);
              Alert.alert(t('common.thankYou'), t('comments.reportedForReview'));
            } else {
              Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
            }
          } catch (_error) {
            Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
          }
        },
      },
      {
        text: t('alerts.harmfulContent'),
        onPress: async () => {
          try {
            const success = await ModerationService.reportContent(uri, 'violation');
            if (success) {
              const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
              useReportedPostsStore.getState().reportPost(uri);
              Alert.alert(t('common.thankYou'), t('comments.reportedForReview'));
            } else {
              Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
            }
          } catch (_error) {
            Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
          }
        },
      },
      {
        text: t('alerts.misleading'),
        onPress: async () => {
          try {
            const success = await ModerationService.reportContent(uri, 'misleading');
            if (success) {
              const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
              useReportedPostsStore.getState().reportPost(uri);
              Alert.alert(t('common.thankYou'), t('comments.reportedForReview'));
            } else {
              Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
            }
          } catch (_error) {
            Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
          }
        },
      },
      {
        text: t('alerts.sexualContent'),
        onPress: async () => {
          try {
            const success = await ModerationService.reportContent(uri, 'sexual');
            if (success) {
              const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
              useReportedPostsStore.getState().reportPost(uri);
              Alert.alert(t('common.thankYou'), t('comments.reportedForReview'));
            } else {
              Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
            }
          } catch (_error) {
            Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
          }
        },
      },
      {
        text: t('alerts.rudeOffensive'),
        onPress: async () => {
          try {
            const success = await ModerationService.reportContent(uri, 'rude');
            if (success) {
              const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
              useReportedPostsStore.getState().reportPost(uri);
              Alert.alert(t('common.thankYou'), t('comments.reportedForReview'));
            } else {
              Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
            }
          } catch (_error) {
            Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
          }
        },
      },
      {
        text: t('common.other'),
        onPress: async () => {
          try {
            const success = await ModerationService.reportContent(uri, 'other');
            if (success) {
              const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
              useReportedPostsStore.getState().reportPost(uri);
              Alert.alert(t('common.thankYou'), t('comments.reportedForReview'));
            } else {
              Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
            }
          } catch (_error) {
            Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
          }
        },
      },
    ]);
  }, [uri, t, postType]);

  const commentMenuActions = useMemo<MenuAction[]>(() => {
    if (!uri || !cid) return [];
    if (isCurrentUserComment) {
      return [
        {
          id: 'copy_text',
          title: t('common.copy'),
          attributes: { disabled: !canCopyOrShareText },
        },
        {
          id: 'share_text',
          title: t('share.share'),
          attributes: { disabled: !canCopyOrShareText },
        },
        { id: 'pin', title: t('comments.pinToProfile') },
        { id: 'repost', title: t('comments.repost') },
        {
          id: 'delete',
          title: t('comments.delete'),
          attributes: { destructive: true },
        },
      ];
    }
    return [
      {
        id: 'copy_text',
        title: t('common.copy'),
        attributes: { disabled: !canCopyOrShareText },
      },
      {
        id: 'share_text',
        title: t('share.share'),
        attributes: { disabled: !canCopyOrShareText },
      },
      { id: 'repost', title: t('comments.repost') },
      {
        id: 'report',
        title: t('Report'),
        attributes: { destructive: true },
      },
    ];
  }, [uri, cid, isCurrentUserComment, t, canCopyOrShareText]);

  const handleCommentMenuPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event?: string } }) => {
      const id = nativeEvent?.event;
      if (!id) return;
      if (id === 'copy_text') {
        void handleCopyText();
      } else if (id === 'share_text') {
        void handleShareText();
      } else if (id === 'pin') {
        handlePinToProfile();
      } else if (id === 'repost') {
        void handleRepost();
      } else if (id === 'delete') {
        confirmDelete();
      } else if (id === 'report') {
        openReportReasonPrompt();
      }
    },
    [
      handleCopyText,
      handleShareText,
      handlePinToProfile,
      handleRepost,
      confirmDelete,
      openReportReasonPrompt,
    ]
  );

  const avatarAndMargin = level > 0 ? 42 : 52;
  const imgAvailableWidth = Math.max(
    100,
    screenWidth - LIST_PADDING_H * 2 - avatarAndMargin - 36 - level * 14
  );

  const renderImages = () => {
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

    if (isExternalEmbed(embed)) {
      const external = embed.external;
      if (!external.uri || !/^https?:\/\//.test(external.uri)) return null;

      if (isInlineImageUrl(external.uri)) {
        const label = external.description || external.title || t('comments.commentImage');
        return (
          <CommentImageGallery
            images={[{ alt: label, thumb: external.uri, fullsize: external.uri }]}
            onImagePress={uri =>
              onImagePress ? onImagePress(uri) : Linking.openURL(uri).catch(() => {})
            }
            availableWidth={imgAvailableWidth}
          />
        );
      }

      return (
        <CommentExternalLinkThumbnail external={external} repoDid={getCommentRepoDid(comment)} />
      );
    }

    const embedObj = embed as { $type?: string; images?: unknown[] } | undefined;
    const isImagesEmbed =
      embedObj?.$type === 'app.bsky.embed.images' ||
      embedObj?.$type === 'app.bsky.embed.images#view';

    if (!isImagesEmbed || !Array.isArray(embedObj?.images)) return null;

    const embedImages: EmbedImage[] = (embed as unknown as { images: unknown[] }).images
      .filter(
        (img: unknown) =>
          typeof img === 'object' && img !== null && ('thumb' in img || 'fullsize' in img)
      )
      .map((img: unknown) => {
        const imgObj = img as {
          thumb?: string;
          fullsize?: string;
          alt?: string;
          aspectRatio?: { width?: number; height?: number } | unknown;
        };
        let ar: { width: number; height: number } | undefined;
        if (imgObj.aspectRatio && typeof imgObj.aspectRatio === 'object') {
          const arObj = imgObj.aspectRatio as { width?: number; height?: number };
          if (
            typeof arObj.width === 'number' &&
            typeof arObj.height === 'number' &&
            arObj.height > 0
          ) {
            ar = { width: arObj.width, height: arObj.height };
          }
        }
        return {
          thumb: imgObj.thumb || '',
          fullsize: imgObj.fullsize || '',
          alt: imgObj.alt || '',
          aspectRatio: ar,
        };
      })
      .filter(img => img.thumb || img.fullsize);

    if (embedImages.length === 0) return null;

    return (
      <CommentImageGallery
        images={embedImages}
        onImagePress={onImagePress}
        availableWidth={imgAvailableWidth}
      />
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
      <Animated.View style={[styles.commentItemContainer, styles.commentItemContainerInner]}>
        {/* Full-width highlight overlay */}
        {shouldHighlight && (
          <Animated.View style={[styles.highlightOverlay, highlightStyle]} pointerEvents="none" />
        )}
        <View style={styles.commentItemRow}>
          <NativePressable onPress={handleAuthorAvatarPress}>
            <UI.Avatar
              uri={authorAvatar}
              type="profile"
              size={level > 0 ? 30 : 40}
              blurRadius={isAuthorBlocked ? 30 : 0}
              status={author?.status}
              style={[styles.commentAvatar, level > 0 && styles.commentAvatarNested]}
            />
          </NativePressable>
          <View style={styles.commentItemBody}>
            <View style={styles.commentItemContent}>
              <View style={styles.commentItemAuthorRow}>
                <NativePressable
                  onPress={() => {
                    const authorData = comment?.author;
                    if (authorHandle || authorDid) {
                      handleAuthorPress(authorHandle, authorDid, authorData);
                    }
                  }}
                  style={styles.commentAuthorNamePressable}
                >
                  <Text style={styles.commentAuthorName} numberOfLines={1} ellipsizeMode="tail">
                    {authorName}
                  </Text>
                </NativePressable>
                {authorHandle && (
                  <VerificationBadge
                    handle={authorHandle}
                    textSize={16}
                    textColor={Colors.neutral[50]}
                  />
                )}
                {authorHandle && (
                  <BotBadge
                    handle={authorHandle}
                    did={authorDid ?? undefined}
                    labels={author?.labels}
                    textSize={16}
                    textColor={Colors.neutral[50]}
                  />
                )}
              </View>
              {parent && parentAuthorName && level > 0 && parent.parent && (
                <NativePressable
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
                  style={styles.parentChyronPressable}
                >
                  <View style={styles.parentChyronContent}>
                    <NanoIcon name="reply-arrow" size={14} color={Colors.neutral[300]} />
                    <Text style={styles.parentChyronText} numberOfLines={1} ellipsizeMode="tail">
                      {parentAuthorHandle || parentAuthorName}
                    </Text>
                  </View>
                </NativePressable>
              )}

              {commentText ? (
                <TextWithAuthorLinks
                  text={commentText}
                  style={styles.commentText}
                  onAuthorPress={handleAuthorPress}
                  onHashtagPress={handleHashtagPress}
                  facets={facets as import('@atproto/api').AppBskyRichtextFacet.Main[] | undefined}
                />
              ) : null}
              {renderImages()}
              <View style={styles.commentMetaContainer}>
                <RelativeDate dateString={comment?.indexedAt} style={styles.commentTimestamp} />
                <NativePressable onPress={handleReplyPress} style={styles.replyButton}>
                  <Text style={styles.replyButtonText}>{t('comments.reply')}</Text>
                </NativePressable>
                <MenuView
                  actions={commentMenuActions}
                  onPressAction={handleCommentMenuPressAction}
                  shouldOpenOnLongPress={false}
                  themeVariant="dark"
                  isAnchoredToRight={true}
                >
                  <NativePressable
                    style={styles.moreButton}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.more')}
                  >
                    <NanoIcon name="more-fill" size={16} color={Colors.neutral[300]} />
                  </NativePressable>
                </MenuView>
              </View>
            </View>
            <View style={styles.commentActionsColumn}>
              <NativePressable
                onPress={handleLikeComment}
                style={styles.likeButton}
                disabled={isLiking}
              >
                <Animated.View style={heartAnimatedStyle}>
                  <NanoIcon
                    name="comment-heart-fill"
                    size={20}
                    color={isLiked ? Colors.coral[500] : Colors.neutral[500]}
                  />
                </Animated.View>
              </NativePressable>
              {likeCount > 0 && <Text style={styles.likeCount}>{formatNumber(likeCount)}</Text>}
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const MemoizedCommentItem = React.memo(CommentItem);

const styles = StyleSheet.create({
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
    alignItems: 'flex-start',
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
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  commentItemContent: {
    flex: 1,
    minWidth: 0,
  },
  commentItemAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    minWidth: 0,
  },
  commentAuthorNamePressable: {
    flexShrink: 1,
    minWidth: 0,
  },
  commentAuthorName: {
    ...TextStyles.profileHandle,
    color: Colors.neutral[50],
  },
  commentText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.medium,
  },
  highlightOverlay: {
    position: 'absolute',
    top: 0,
    left: -16,
    right: -16,
    bottom: 0,
    zIndex: -1,
  },
  parentChyronPressable: {
    flexShrink: 1,
    minWidth: 0,
    marginTop: 0,
    marginBottom: 0,
    alignSelf: 'flex-start',
  },
  parentChyronContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  parentChyronText: {
    ...TextStyles.profileHandleSmall,
    color: Colors.neutral[200],
    flexShrink: 1,
  },
  commentMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  commentTimestamp: {
    fontSize: Typography.sizes.caption,
    color: Colors.neutral[400],
    fontFamily: FontFamily.medium,
    marginRight: 12,
  },
  replyButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  replyButtonText: {
    fontSize: Typography.sizes.caption,
    color: Colors.neutral[200],
    fontFamily: FontFamily.bold,
  },
  moreButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentActionsColumn: {
    width: 36,
    paddingLeft: 8,
    alignItems: 'center',
  },
  likeButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeCount: {
    ...TextStyles.captionSmall,
    color: Colors.neutral[200],
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
    backgroundColor: hexToRGBA(Colors.neutral[925], 0.6),
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
    backgroundColor: Colors.neutral[925],
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

type CommentExternalLinkEmbed = {
  uri: string;
  thumb?: string | { ref: { $link: string } };
  title?: string;
  description?: string;
};

const CommentExternalLinkThumbnail = React.memo(function CommentExternalLinkThumbnail({
  external,
  repoDid,
}: {
  external: CommentExternalLinkEmbed;
  repoDid: string | undefined;
}) {
  if (!external.uri || !/^https?:\/\//.test(external.uri)) return null;

  const thumbUrl = resolveExternalThumbUrl(external.thumb, repoDid);

  const handlePress = () => {
    Linking.openURL(external.uri).catch(() => {});
  };

  const hasThumb = !!thumbUrl;

  return (
    <SquircleNativePressable
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
              contentFit="contain"
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
    </SquircleNativePressable>
  );
});

export default MemoizedCommentItem;
