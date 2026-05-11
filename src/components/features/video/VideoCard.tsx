import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
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
  ROW_BITS_PRELOAD,
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

import VideoCardMediaGestureLayer from './video-card/VideoCardMediaGestureLayer';
import VideoCardOverlayLayers from './video-card/VideoCardOverlayLayers';
import { useVideoCardOverlayOpacity } from './video-card/useVideoCardOverlayOpacity';
import { useFeedInteractionQueue } from './video-card/hooks/useFeedInteractionQueue';
import { useVideoCardModerationState } from './video-card/hooks/useVideoCardModerationState';
import { useVideoCardAuthor } from './video-card/hooks/useVideoCardAuthor';
import { useVideoCardGesture } from './video-card/hooks/useVideoCardGesture';
import { useVideoCardInteraction } from './video-card/hooks/useVideoCardInteraction';
import { useVideoCardPlayer } from './video-card/hooks/useVideoCardPlayer';
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
  const { height: windowHeight } = useWindowDimensions();
  const cardHeight = height ?? windowHeight;

  const [userChoseToView, setUserChoseToView] = useState(false);
  const { cannotShowMedia, isBlurred, warningDescription, handleViewContent } =
    useVideoCardModerationState(postView, feedItem, userChoseToView, setUserChoseToView);

  const videoView = getVideoView(postView.embed);
  const videoUrl = videoView?.playlist || null;
  const posterUrl = videoView?.thumbnail || null;

  // Use post URI or CID as unique recycling key to prevent image reuse from other videos
  // when no thumbnail has loaded yet (LegendList/expo-image recycling).
  const recyclingKey = postView?.uri || postView?.cid || `item-${idx}`;

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
  } = useVideoCardPlayer({
    videoUrl,
    postUri: postView.uri,
    feedOption,
    isVisible,
    shouldDisablePlayback,
    cannotShowMedia,
    isBlurred,
    onVideoStatus,
  });

  useEffect(() => {
    if (!isVisible || !onUserPausedChange) return;
    onUserPausedChange(userPaused);
  }, [isVisible, userPaused, onUserPausedChange]);

  const {
    display: displayInteraction,
    isLikePending,
    isRepostPending,
    displayRef: displayInteractionRef,
    pendingRef: overlayPendingRef,
    handleLike,
    handleLikeOnly,
    handleRepost,
  } = useVideoCardInteraction({ postView, feedOption });

  const currentUser = useUserStore(state => state.currentUser);
  const author = useVideoCardAuthor({ postView, currentUser });

  const followMutation = useFollowMutation();
  const presentShareSheet = useModalStore(state => state.presentShareSheet);
  const presentCommentSection = useModalStore(state => state.presentCommentSection);
  const queryClient = useQueryClient();

  const followMutationRef = useRef(followMutation);
  const channelUriRef = useRef(author.channelUri);
  const queryClientRef = useRef(queryClient);

  const { navigateToChannel: goToChannel, navigateToProfile } = useProfileChannelNavigation();
  const goToChannelRef = useRef(goToChannel);
  const navigateToProfileRef = useRef(navigateToProfile);

  useLayoutEffect(() => {
    followMutationRef.current = followMutation;
    channelUriRef.current = author.channelUri;
    queryClientRef.current = queryClient;
    goToChannelRef.current = goToChannel;
    navigateToProfileRef.current = navigateToProfile;
  }, [followMutation, author.channelUri, queryClient, goToChannel, navigateToProfile]);

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

  useLayoutEffect(() => {
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
  }, [postView, presentCommentSection, handleLike, displayInteractionRef, overlayPendingRef]);

  const { gesture, heartAnimatedStyle } = useVideoCardGesture({
    postUri: postView.uri,
    cardHeight,
    onSingleTap: togglePlayback,
    onDoubleTap: handleLikeOnly,
    onLongPress: handleOpenComments,
  });

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

  const isInPreloadWindow = (rowBits & ROW_BITS_PRELOAD) !== 0;
  const posterPriority: 'low' | 'normal' | 'high' = isVisible
    ? 'high'
    : isInPreloadWindow
      ? 'normal'
      : 'low';
  const mediaGestureProps = useMemo(
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
      posterPriority,
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
      posterPriority,
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
      <VideoCardMediaGestureLayer {...mediaGestureProps} />

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
    backgroundColor: Colors.neutral[950],
  },
});

export default VideoCard;
