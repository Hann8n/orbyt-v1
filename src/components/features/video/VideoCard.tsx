import {
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useSyncExternalStore,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useFeedScrollLayout, useFeedScrollMotion } from '../../../context/FeedScrollContext';
import {
  FeedListPlaybackContext,
  FEED_LIST_PLAYBACK_OUTSIDE_BITS,
  ROW_BITS_CHROME,
  ROW_BITS_PLAYBACK,
} from '../../../core/visibility';
import { useProfileChannelNavigation } from '../../../hooks/useProfileChannelNavigation';
import { seenVideoService } from '../../../services/SeenVideoService';
import { prefetchProfile, useFollowMutation } from '../../../services/data/ProfileService';
import { useModalStore } from '../../../stores/modalStore';
import { useUserStore } from '../../../stores/userStore';
import { Colors } from '../../../theme';
import { logger } from '../../../utils/logger';
import { getVideoView, normalizePostView } from '../../../utils/video/helpers';
import { INTERACTIONSEEN } from '../../../services/api/types';
import type { ExtendedFeedViewPost, ExtendedPostView } from '../../../services/api/types';
import { useQueryClient } from '@tanstack/react-query';

import VideoCardMediaLayer from './video-card/VideoCardMediaLayer';
import VideoCardOverlayLayers from './video-card/VideoCardOverlayLayers';
import { useVideoCardOverlayOpacity } from './video-card/useVideoCardOverlayOpacity';
import { useFeedInteractionQueue } from './video-card/hooks/useFeedInteractionQueue';
import { useVideoCardModerationState } from './video-card/hooks/useVideoCardModerationState';
import { useVideoCardAuthor } from './video-card/hooks/useVideoCardAuthor';
import { useVideoCardGesture } from './video-card/hooks/useVideoCardGesture';
import { useVideoCardInteraction } from './video-card/hooks/useVideoCardInteraction';
import { useVideoCardPlayer } from './video-card/hooks/useVideoCardPlayer';
import { useRecyclingState } from '@shopify/flash-list';
import type { VideoOverlayUIProps } from './VideoOverlayUI';

type Post = ExtendedPostView | ExtendedFeedViewPost;

const MIN_SCRUBBER_DURATION_SECONDS = 7;
const cardHeightStyleCache = new Map<number, { height: number }>();
const noopSubscribe = () => () => {};

function logVideoCardPlayerError(action: string, err: unknown): void {
  logger.debug(`VideoCard: ${action} threw`, {
    component: 'VideoCard',
    action,
    error: err instanceof Error ? err.message : String(err),
  });
}

const getCardHeightStyle = (cardHeight: number): { height: number } => {
  const normalized = Math.max(0, Math.round(cardHeight));
  const cached = cardHeightStyleCache.get(normalized);
  if (cached) return cached;
  const style = { height: normalized };
  cardHeightStyleCache.set(normalized, style);
  return style;
};

export interface VideoCardRef {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  getDuration: () => number;
  seekTo: (position: number) => void;
  seek: (position: number) => void;
  unload: () => void;
  playPause: (shouldPlay: boolean) => void;
  getPlayState: () => boolean;
  getCurrentTime: () => number;
}

export interface VideoCardProps {
  post: Post;
  feedItem?: ExtendedFeedViewPost;
  isVisible?: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  shouldDisablePlayback?: boolean;
  /** When false, skip scrubber + `VideoOverlayUI` (list rows far from active). */
  renderHeavyChrome?: boolean;
  showOverlay?: boolean;
  feedOption?: string;
  index?: number;
  onUserPausedChange?: (userPaused: boolean) => void;
  onHashtagPress?: (hashtag: string) => void;
  ref?: Ref<VideoCardRef>;
}

function VideoCard({
  post,
  feedItem,
  isVisible: isVisibleFromProps = true,
  onVideoStatus,
  height,
  shouldDisablePlayback: shouldDisablePlaybackFromProps = false,
  renderHeavyChrome: renderHeavyChromeFromProps = true,
  showOverlay = true,
  feedOption,
  index,
  onUserPausedChange,
  onHashtagPress,
  ref,
}: VideoCardProps) {
  const { t } = useTranslation();
  const idx = index ?? 0;

  const feedContext = feedItem?.feedContext;
  const reqId = feedItem?.reqId;
  const algorithmicFeedProvider = useUserStore(state => state.algorithmicFeedProvider);
  const resolvedFeedUri = useMemo(() => {
    if (feedOption?.startsWith('at://')) return feedOption;
    if (algorithmicFeedProvider?.startsWith('at://')) return algorithmicFeedProvider;
    return undefined;
  }, [feedOption, algorithmicFeedProvider]);

  const postView: ExtendedPostView = useMemo(() => normalizePostView(post), [post]);

  // ── Visibility: read playback bits from the list-level store (single source of truth). ───
  const listPlayback = useContext(FeedListPlaybackContext);
  const listPlaybackAttached = Boolean(listPlayback && typeof index === 'number');
  const rowBits = useSyncExternalStore(
    listPlayback?.subscribe ?? noopSubscribe,
    listPlaybackAttached
      ? () => listPlayback!.getRowBits(idx)
      : () => FEED_LIST_PLAYBACK_OUTSIDE_BITS,
    () => FEED_LIST_PLAYBACK_OUTSIDE_BITS
  );
  const isVisible = listPlaybackAttached ? (rowBits & ROW_BITS_PLAYBACK) !== 0 : isVisibleFromProps;
  const shouldDisablePlayback = listPlaybackAttached ? false : shouldDisablePlaybackFromProps;
  const renderHeavyChrome = listPlaybackAttached
    ? (rowBits & ROW_BITS_CHROME) !== 0
    : renderHeavyChromeFromProps;

  // ── Layout. ────────────────────────────────────────────────────────────────────────────
  const { height: windowHeight } = useWindowDimensions();
  const cardHeight = height ?? windowHeight;

  // ── Moderation. ────────────────────────────────────────────────────────────────────────
  const [userChoseToView, setUserChoseToView] = useRecyclingState(false, [postView.uri]);
  const { cannotShowMedia, isBlurred, warningDescription, handleViewContent } =
    useVideoCardModerationState(postView, feedItem, userChoseToView, setUserChoseToView);

  // ── Media URLs. ────────────────────────────────────────────────────────────────────────
  const videoView = getVideoView(postView.embed);
  const videoUrl = videoView?.playlist || null;
  const posterUrl = videoView?.thumbnail || null;

  // Use post URI or CID as unique recycling key to prevent image reuse from other videos
  // when no thumbnail has loaded yet (FlashList/expo-image recycling).
  const recyclingKey = postView?.uri || postView?.cid || `item-${idx}`;

  // ── Player. ────────────────────────────────────────────────────────────────────────────
  const playerCtx = useVideoCardPlayer({
    videoUrl,
    postUri: postView.uri,
    feedOption,
    isVisible,
    renderHeavyChrome,
    shouldDisablePlayback,
    cannotShowMedia,
    isBlurred,
    onVideoStatus,
  });
  const {
    videoSource,
    player,
    hasError,
    shouldPlayVideo,
    shouldLoadVideo,
    userPaused,
    togglePlayback,
    seek,
    firstFrameRendered,
    handleFirstFrameRender,
    userPausedRef,
    setUserPaused,
  } = playerCtx;

  useEffect(() => {
    if (!isVisible || !onUserPausedChange) return;
    onUserPausedChange(userPaused);
  }, [isVisible, userPaused, onUserPausedChange]);

  // ── Interaction (likes, reposts, comment count). ───────────────────────────────────────
  const {
    display: displayInteraction,
    isLikePending,
    isRepostPending,
    displayRef: displayInteractionRef,
    handleLike,
    handleLikeOnly,
    handleRepost,
  } = useVideoCardInteraction({ postView, feedOption });

  // ── Author / profile / follow. ─────────────────────────────────────────────────────────
  const currentUser = useUserStore(state => state.currentUser);
  const author = useVideoCardAuthor({ postView, currentUser });

  // ── Misc handlers (kept here as the integration layer between the four hooks). ─────────
  const followMutation = useFollowMutation();
  const presentShareSheet = useModalStore(state => state.presentShareSheet);
  const presentCommentSection = useModalStore(state => state.presentCommentSection);
  const queryClient = useQueryClient();

  const followMutationRef = useRef(followMutation);
  const channelUriRef = useRef(author.channelUri);
  const queryClientRef = useRef(queryClient);
  const overlayPendingRef = useRef({ isLikePending, isRepostPending });

  const { navigateToChannel: goToChannel, navigateToProfile } = useProfileChannelNavigation();
  const goToChannelRef = useRef(goToChannel);
  const navigateToProfileRef = useRef(navigateToProfile);

  useEffect(() => {
    followMutationRef.current = followMutation;
    channelUriRef.current = author.channelUri;
    queryClientRef.current = queryClient;
    overlayPendingRef.current.isLikePending = isLikePending;
    overlayPendingRef.current.isRepostPending = isRepostPending;
    goToChannelRef.current = goToChannel;
    navigateToProfileRef.current = navigateToProfile;
  });

  const handleChannelPress = useCallback(() => {
    const currentChannelUri = channelUriRef.current;
    if (!currentChannelUri) return;
    goToChannelRef.current(encodeURIComponent(currentChannelUri));
  }, []);

  const handleAuthorPress = useCallback(
    (
      rawDid?: string | null,
      authorData?: { did?: string; handle?: string; displayName?: string; avatar?: string }
    ) => {
      const cleanDid = (rawDid || authorData?.did || '').trim();
      if (!cleanDid) return;
      prefetchProfile(
        queryClientRef.current,
        cleanDid,
        authorData
          ? {
              did: cleanDid,
              handle: authorData.handle,
              displayName: authorData.displayName,
              avatar: authorData.avatar,
            }
          : undefined
      );
      navigateToProfileRef.current(cleanDid);
    },
    []
  );

  const repostedByRef = useRef(postView.repostedBy);
  useEffect(() => {
    repostedByRef.current = postView.repostedBy;
  }, [postView.repostedBy]);
  const handleRepostAuthorPress = useCallback(() => {
    const repostedBy = repostedByRef.current;
    const identifier = repostedBy?.handle;
    if (!identifier) return;
    handleAuthorPress(identifier, repostedBy);
  }, [handleAuthorPress]);

  const handleSharePress = useCallback(() => {
    presentShareSheet({
      postUri: postView.uri,
      postCid: postView.cid,
      authorDid: postView.author?.did || '',
      authorName: postView.author?.displayName,
      authorHandle: postView.author?.handle,
      sourceFeed: resolvedFeedUri,
    });
  }, [postView, resolvedFeedUri, presentShareSheet]);

  const handleFollowPress = useCallback(() => {
    const author = postView.author;
    if (!author?.handle) return;
    followMutationRef.current.mutate(
      { did: author.did, handle: author.handle, isFollowing: true },
      {}
    );
  }, [postView.author]);

  const handleOpenComments = useCallback(() => {
    const commentPost = {
      uri: postView.uri,
      cid: postView.cid,
      indexedAt: postView.indexedAt,
      author: postView.author
        ? {
            did: postView.author.did,
            handle: postView.author.handle,
            displayName: postView.author.displayName,
          }
        : undefined,
    };
    presentCommentSection({
      post: commentPost,
      totalLikes: displayInteractionRef.current.likeCount,
      totalComments: displayInteractionRef.current.commentCount,
      isLiked: displayInteractionRef.current.isLiked,
      postedAt: (postView.record as { createdAt?: string })?.createdAt || postView.indexedAt,
      onToggleLike: handleLike,
      isLikePending: overlayPendingRef.current.isLikePending,
    });
  }, [postView, presentCommentSection, handleLike, displayInteractionRef]);

  // ── Gestures (tap / double-tap / long-press) — shared values stay inside the hook. ─────
  const { gesture, heartAnimatedStyle } = useVideoCardGesture({
    postUri: postView.uri,
    cardHeight,
    onSingleTap: togglePlayback,
    onDoubleTap: handleLikeOnly,
    onLongPress: handleOpenComments,
  });

  // ── Imperative handle (exposed for non-feed consumers; unused by VideoItem). ───────────
  useImperativeHandle(
    ref,
    () => ({
      play: () => togglePlayback(true),
      pause: () => togglePlayback(false),
      togglePlay: () => togglePlayback(),
      getDuration: () => {
        if (!player) return 0;
        try {
          const seconds = player.duration;
          if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
            return seconds * 1000;
          }
        } catch (err) {
          logVideoCardPlayerError('getDuration', err);
        }
        return 0;
      },
      seekTo: seek,
      seek,
      unload: () => {
        if (!player) return;
        try {
          player.pause();
          player.currentTime = 0;
        } catch (err) {
          logVideoCardPlayerError('unload', err);
        } finally {
          if (!userPausedRef.current) setUserPaused(true);
        }
      },
      playPause: (shouldPlay: boolean) => togglePlayback(shouldPlay),
      // Report intended play state based on our own logic, not the underlying player flag.
      getPlayState: () => shouldPlayVideo,
      getCurrentTime: () => {
        if (!player) return 0;
        try {
          const seconds = player.currentTime;
          if (typeof seconds === 'number' && Number.isFinite(seconds)) {
            return seconds * 1000;
          }
        } catch (err) {
          logVideoCardPlayerError('getCurrentTime', err);
        }
        return 0;
      },
    }),
    [player, shouldPlayVideo, togglePlayback, seek, setUserPaused, userPausedRef]
  );

  // ── Feed interaction queue (mark seen, debounced flush). ───────────────────────────────
  const { queueSeenInteractionOnce } = useFeedInteractionQueue({
    postUri: postView.uri,
    feedContext,
    reqId,
    resolvedFeedUri,
  });

  useEffect(() => {
    if (isVisible) {
      queueSeenInteractionOnce(INTERACTIONSEEN);
      seenVideoService.markAsSeen(postView.uri);
    }
  }, [isVisible, queueSeenInteractionOnce, postView.uri]);

  // ── Caption-expand dim. Driven on the UI thread to avoid card re-renders. ──────────────
  const textDimOpacitySV = useSharedValue(0);
  useEffect(() => {
    textDimOpacitySV.value = 0;
  }, [postView.uri, textDimOpacitySV]);
  const textDimAnimatedStyle = useAnimatedStyle(() => ({ opacity: textDimOpacitySV.value }));
  const handleOverlayCollapsedChange = useCallback(
    (isCollapsed: boolean) => {
      if (!isVisible) return;
      const isExpanded = !isCollapsed;
      textDimOpacitySV.value = withTiming(isExpanded ? 0.65 : 0, { duration: 120 });
    },
    [textDimOpacitySV, isVisible]
  );

  // ── Scrubber + overlay opacity (composed shared values). ───────────────────────────────
  const seekingAnimationSV = useSharedValue(0);
  const feedScrollMotion = useFeedScrollMotion();
  const feedScrollLayout = useFeedScrollLayout();
  const scrollOffsetYSV = feedScrollMotion?.scrollOffsetYSV;
  const overlayScrollOffsetYSV = renderHeavyChrome ? scrollOffsetYSV : undefined;
  const uiOverlayOpacitySV = useVideoCardOverlayOpacity({
    seekingAnimationSV,
    scrollOffsetYSV: overlayScrollOffsetYSV,
    headerH: feedScrollLayout?.headerHeight ?? 0,
    viewportH: feedScrollLayout?.viewportHeight ?? cardHeight,
    itemSp: feedScrollLayout?.itemSpacing ?? cardHeight,
    idx,
    cardHeight,
  });

  const shouldHideScrubberForShortVideo = !!(
    player?.duration &&
    player.duration > 0 &&
    player.duration < MIN_SCRUBBER_DURATION_SECONDS
  );

  // ── Prop bags for the layered children. ────────────────────────────────────────────────
  const gestureVideoStackProps = useMemo(
    () => ({
      videoGesture: gesture,
      posterUrl,
      cannotShowMedia,
      firstFrameRendered,
      recyclingKey,
      videoSource,
      isBlurred,
      player,
      shouldLoadVideo,
      loadingLabel: t('video.noHlsStream'),
      onFirstFrameRender: handleFirstFrameRender,
      surfaceType: Platform.OS === 'android' ? ('textureView' as const) : undefined,
      textDimAnimatedStyle,
      heartAnimatedStyle,
    }),
    [
      gesture,
      posterUrl,
      cannotShowMedia,
      firstFrameRendered,
      recyclingKey,
      videoSource,
      isBlurred,
      player,
      shouldLoadVideo,
      t,
      handleFirstFrameRender,
      textDimAnimatedStyle,
      heartAnimatedStyle,
    ]
  );

  const overlayProps = useMemo<VideoOverlayUIProps>(
    () => ({
      post: postView,
      overlayOpacitySV: uiOverlayOpacitySV,
      sourceFeed: resolvedFeedUri,
      onOverlayCollapsedChange: handleOverlayCollapsedChange,
      onLike: handleLike,
      onRepost: handleRepost,
      isLiked: displayInteraction.isLiked,
      isReposted: displayInteraction.isReposted,
      likeCount: displayInteraction.likeCount,
      commentCount: displayInteraction.commentCount,
      repostCount: displayInteraction.repostCount,
      isLikePending,
      isRepostPending,
      isFollowing: author.isFollowing,
      hasProfile: author.hasProfile,
      channelSlug: author.channelSlug,
      onChannelPress: handleChannelPress,
      authorProfileOverlay: author.authorProfileOverlay,
      onAuthorPress: handleAuthorPress,
      onRepostAuthorPress: handleRepostAuthorPress,
      onOpenComments: handleOpenComments,
      onSharePress: handleSharePress,
      onFollowPress: handleFollowPress,
      onHashtagPress,
      isCurrentUserProfile: author.isCurrentUserProfile,
    }),
    [
      postView,
      uiOverlayOpacitySV,
      resolvedFeedUri,
      handleOverlayCollapsedChange,
      handleLike,
      handleRepost,
      displayInteraction.isLiked,
      displayInteraction.isReposted,
      displayInteraction.likeCount,
      displayInteraction.commentCount,
      displayInteraction.repostCount,
      isLikePending,
      isRepostPending,
      author.isFollowing,
      author.hasProfile,
      author.channelSlug,
      author.authorProfileOverlay,
      author.isCurrentUserProfile,
      handleChannelPress,
      handleAuthorPress,
      handleRepostAuthorPress,
      handleOpenComments,
      handleSharePress,
      handleFollowPress,
      onHashtagPress,
    ]
  );

  return (
    <View style={StyleSheet.compose(styles.container, getCardHeightStyle(cardHeight))}>
      <VideoCardMediaLayer gestureStack={gestureVideoStackProps} />

      <VideoCardOverlayLayers
        renderHeavyChrome={renderHeavyChrome}
        shouldRenderScrubber={!shouldHideScrubberForShortVideo}
        scrubberActive={isVisible && !hasError}
        isActive={isVisible}
        player={player}
        seekingAnimationSV={seekingAnimationSV}
        overlayOpacitySV={uiOverlayOpacitySV}
        showOverlay={showOverlay}
        overlayProps={overlayProps}
        showContentWarning={cannotShowMedia || isBlurred}
        cannotShowMedia={cannotShowMedia}
        isBlurred={isBlurred}
        warningDescription={warningDescription}
        onViewContent={handleViewContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.neutral[925],
  },
});

export default VideoCard;
