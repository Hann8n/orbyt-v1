import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
  interpolate,
} from 'react-native-reanimated';

import { useFeedLayout } from '../feed/feedViewShared';
import { useScreenVisible } from '../../../core/visibility/hooks';
import { useProfileChannelNavigation } from '../../../hooks/useProfileChannelNavigation';
import { seenVideoService } from '../../../services/SeenVideoService';
import { prefetchProfile, useFollowMutation } from '../../../services/data/ProfileService';
import { useShallow } from 'zustand/react/shallow';
import { useModalStore } from '../../../stores/modalStore';
import { useUserStore } from '../../../stores/userStore';
import { Colors } from '../../../theme';
import { getVideoView, normalizePostView } from '../../../utils/video/helpers';
import { INTERACTIONSEEN } from '../../../services/api/types';
import type { ExtendedFeedViewPost, ExtendedPostView } from '../../../services/api/types';
import { AppBskyFeedPost } from '@atproto/api';
import { useQueryClient } from '@tanstack/react-query';
import { isValidAtUri } from '../../../utils/atproto/uriValidation';

import VideoCardMediaGestureLayer from './video-card/VideoCardMediaGestureLayer';
import VideoCardOverlayLayers from './video-card/VideoCardOverlayLayers';
import { useFeedInteractionQueue } from './video-card/hooks/useFeedInteractionQueue';
import { useVideoCardModerationState } from './video-card/hooks/useVideoCardModerationState';
import { useVideoCardAuthor } from './video-card/hooks/useVideoCardAuthor';
import { useVideoCardGesture } from './video-card/hooks/useVideoCardGesture';
import { useVideoCardInteraction } from './video-card/hooks/useVideoCardInteraction';
import { useVideoCardPlayer, logVideoCardPlayerError } from './video-card/hooks/useVideoCardPlayer';
import { useRecyclingState } from '@shopify/flash-list';
import type { VideoOverlayUIProps } from './VideoOverlayUI';
import { getAnalytics, logSelectContent } from '@react-native-firebase/analytics';

type Post = ExtendedPostView | ExtendedFeedViewPost;

const MIN_SCRUBBER_DURATION_SECONDS = 7;
const cardHeightStyleCache = new Map<number, { height: number }>();

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
  onVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  canPlay?: boolean;
  showOverlay?: boolean;
  feedOption?: string;
  index?: number;
  onHashtagPress?: (hashtag: string) => void;
  ref?: Ref<VideoCardRef>;
  isActive?: boolean;
}

function VideoCard({
  post,
  feedItem,
  onVideoStatus,
  height,
  canPlay = true,
  showOverlay = true,
  feedOption,
  index,
  isActive = true,
  onHashtagPress,
  ref,
}: VideoCardProps) {
  const feedContext = feedItem?.feedContext;
  const reqId = feedItem?.reqId;
  const { algorithmicFeedProvider, currentUser } = useUserStore(
    useShallow(state => ({
      algorithmicFeedProvider: state.algorithmicFeedProvider,
      currentUser: state.currentUser,
    }))
  );
  const resolvedFeedUri = useMemo(() => {
    if (feedOption && isValidAtUri(feedOption)) return feedOption;
    if (algorithmicFeedProvider && isValidAtUri(algorithmicFeedProvider))
      return algorithmicFeedProvider;
    return undefined;
  }, [feedOption, algorithmicFeedProvider]);

  const postView: ExtendedPostView = useMemo(() => normalizePostView(post), [post]);
  const idx = index ?? 0;

  const feedLayout = useFeedLayout();
  const cardHeight = height ?? feedLayout.viewportHeight;
  const topInset = feedLayout.topInset;
  const bottomInset = feedLayout.bottomInset;

  const [userChoseToView, setUserChoseToView] = useRecyclingState(false, [postView.uri]);
  const { cannotShowMedia, isBlurred, warningDescription, handleViewContent } =
    useVideoCardModerationState(postView, feedItem, userChoseToView, setUserChoseToView);

  const videoView = getVideoView(postView.embed);
  const videoUrl = videoView?.playlist || null;
  const posterUrl = videoView?.thumbnail || null;
  const recyclingKey = postView?.uri || postView?.cid || `item-${idx}`;

  // Off-screen pager pages (e.g. your-mix while on following) must not buffer — gate by page visibility.
  const surfaceVisible = useScreenVisible();

  const {
    videoSource,
    player,
    hasError,
    shouldPlayVideo,
    shouldLoadVideo,
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
    isActiveCard: isActive,
    holdSource: surfaceVisible,
    canPlay,
    cannotShowMedia,
    isBlurred,
    onVideoStatus,
  });

  const {
    display: displayInteraction,
    isLikePending,
    isRepostPending,
    handleLike,
    handleLikeOnly,
    handleRepost,
  } = useVideoCardInteraction({ postView, feedOption });

  const author = useVideoCardAuthor({ postView, currentUser });

  const followMutation = useFollowMutation();
  const { presentShareSheet, presentCommentSection } = useModalStore(
    useShallow(state => ({
      presentShareSheet: state.presentShareSheet,
      presentCommentSection: state.presentCommentSection,
    }))
  );
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
    const target = postView.author;
    if (!target?.handle) return;
    followMutationRef.current.mutate(
      { did: target.did, handle: target.handle, isFollowing: true },
      {}
    );
  }, [postView.author]);

  const handleOpenComments = useCallback(() => {
    presentCommentSection({
      post: {
        uri: postView.uri,
        cid: postView.cid,
        indexedAt: postView.indexedAt,
        author: postView.author,
      },
      postedAt: (postView.record as AppBskyFeedPost.Record)?.createdAt || postView.indexedAt,
    });
  }, [postView, presentCommentSection]);

  const { gesture, heartAnimatedStyle } = useVideoCardGesture({
    postUri: postView.uri,
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
    if (isActive) {
      queueSeenInteractionOnce(INTERACTIONSEEN);
      seenVideoService.markAsSeen(postView.uri);
      logSelectContent(getAnalytics(), { content_type: 'video', item_id: postView.uri }).catch(
        () => {}
      );
    }
  }, [isActive, queueSeenInteractionOnce, postView.uri]);

  const textDimOpacitySV = useSharedValue(0);
  const textDimOpacityRef = useRef(textDimOpacitySV);
  useEffect(() => {
    textDimOpacityRef.current.value = 0;
  }, [postView.uri]);
  const textDimAnimatedStyle = useAnimatedStyle(() => ({ opacity: textDimOpacitySV.value }));

  const isActiveRef = useRef(isActive);
  useLayoutEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const handleOverlayCollapsedChange = useCallback((isCollapsed: boolean) => {
    if (!isActiveRef.current) return;
    textDimOpacityRef.current.value = withTiming(isCollapsed ? 0 : 0.65, { duration: 120 });
  }, []);

  const seekingAnimationSV = useSharedValue(0);
  const overlayOpacitySV = useDerivedValue(() =>
    interpolate(seekingAnimationSV.value, [0, 0.2, 1], [1, 0, 0], 'clamp')
  );

  const playerDuration = player?.duration;
  const shouldHideScrubberForShortVideo = !!(
    playerDuration &&
    playerDuration > 0 &&
    playerDuration < MIN_SCRUBBER_DURATION_SECONDS
  );

  const posterPriority: 'low' | 'normal' | 'high' = isActive ? 'high' : 'normal';

  const overlayProps = useMemo<VideoOverlayUIProps>(
    () => ({
      post: postView,
      overlayOpacitySV,
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
      overlayOpacitySV,
      resolvedFeedUri,
      handleOverlayCollapsedChange,
      handleLike,
      handleRepost,
      displayInteraction,
      isLikePending,
      isRepostPending,
      author,
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
      <View style={getCardHeightStyle(topInset)} pointerEvents="none" />
      <View style={styles.videoBox} pointerEvents="box-none">
        <VideoCardMediaGestureLayer
          videoGesture={gesture}
          posterUrl={posterUrl}
          cannotShowMedia={cannotShowMedia}
          firstFrameRendered={firstFrameRendered}
          recyclingKey={recyclingKey}
          videoSource={videoSource}
          isBlurred={isBlurred}
          player={player}
          shouldLoadVideo={shouldLoadVideo}
          onFirstFrameRender={handleFirstFrameRender}
          surfaceType={Platform.OS === 'android' ? ('textureView' as const) : undefined}
          textDimAnimatedStyle={textDimAnimatedStyle}
          heartAnimatedStyle={heartAnimatedStyle}
          posterPriority={posterPriority}
        />
        <VideoCardOverlayLayers
          shouldRenderScrubber={!shouldHideScrubberForShortVideo}
          scrubberActive={isActive && !hasError}
          isActive={isActive}
          player={player}
          seekingAnimationSV={seekingAnimationSV}
          overlayOpacitySV={overlayOpacitySV}
          showOverlay={showOverlay}
          overlayProps={overlayProps}
          showContentWarning={cannotShowMedia || isBlurred}
          cannotShowMedia={cannotShowMedia}
          isBlurred={isBlurred}
          warningDescription={warningDescription}
          onViewContent={handleViewContent}
        />
      </View>
      <View style={getCardHeightStyle(bottomInset)} pointerEvents="none" />
    </View>
  );
}

export default VideoCard;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.black,
    flexDirection: 'column',
  },
  videoBox: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
});
