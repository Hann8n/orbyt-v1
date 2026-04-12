import { useRef, forwardRef, useImperativeHandle, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecyclingState } from '@shopify/flash-list';
import { useEvent } from 'expo';
import { useVideoPlayer } from 'expo-video';
import * as Haptics from 'expo-haptics';

import { AtprotoFeedService } from '../../../services/api/feed/FeedService';
import { View, Dimensions, StyleSheet, Platform, AppState } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors } from '../../../theme';
import {
  normalizePostView,
  createVideoSource,
  getVideoView,
  DEFAULT_BUFFER_OPTIONS,
  DEFAULT_SEEK_TOLERANCE_SCRUBBER,
} from '../../../utils/video/helpers';
import { useFocusEffect } from 'expo-router';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useProfileChannelNavigation } from '../../../hooks/useProfileChannelNavigation';
import {
  mergePostInteractionDelta,
  usePostInteractionStore,
} from '../../../stores/postInteractionStore';
import { useFeedScrollLayout, useFeedScrollMotion } from '../../../context/FeedScrollContext';
import { useVideoCardOverlayOpacity } from './video-card/useVideoCardOverlayOpacity';
import { useVideoCardModerationState } from './video-card/hooks/useVideoCardModerationState';
import { useVideoCardAuthorMeta } from './video-card/hooks/useVideoCardAuthorMeta';
import VideoCardMediaLayer from './video-card/VideoCardMediaLayer';
import VideoCardOverlayLayers from './video-card/VideoCardOverlayLayers';
import { seenVideoService } from '../../../services/SeenVideoService';
import { useUserStore } from '../../../stores/userStore';
import { useShallow } from 'zustand/react/shallow';
import { ErrorHandler } from '../../../utils/errors/errorHandler';
import { useLikeInteraction } from '@/hooks/useLikeInteraction';
import type { VideoOverlayUIProps } from './VideoOverlayUI';
import type {
  ExtendedPostView,
  ExtendedFeedViewPost,
  Interaction,
} from '../../../services/api/types';
import {
  INTERACTIONSEEN as INTERACTIONSEEN_CONST,
  INTERACTIONLIKE as INTERACTIONLIKE_CONST,
  INTERACTIONREPOST as INTERACTIONREPOST_CONST,
  INTERACTIONREPLY as INTERACTIONREPLY_CONST,
  INTERACTIONSHARE as INTERACTIONSHARE_CONST,
} from '../../../services/api/types';
// Use proper API types - normalize to always work with ExtendedPostView
type Post = ExtendedPostView | ExtendedFeedViewPost;

/** Max ms between two taps to count as double-tap (like). Single-tap plays/pauses after this window. */
const VIDEO_DOUBLE_TAP_WINDOW_MS = 260;
const MIN_SCRUBBER_DURATION_SECONDS = 7;

// Types
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
  feedItem?: ExtendedFeedViewPost; // Contains feedContext and reqId natively
  isVisible: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  shouldDisablePlayback?: boolean;
  // Overlay props
  showOverlay?: boolean;
  feedOption?: string;
  /** Item index in the list; used with FeedScrollContext to compute percent visible from scroll+layout. */
  index?: number;
  /** Fired when visible and the user toggles pause. */
  onUserPausedChange?: (userPaused: boolean) => void;
}

const VideoCard = forwardRef<VideoCardRef, VideoCardProps>(
  (
    {
      post,
      feedItem,
      isVisible,
      onVideoStatus,
      height,
      shouldDisablePlayback = false,
      showOverlay = true,
      feedOption,
      index,
      onUserPausedChange,
    },
    ref
  ) => {
    const { t } = useTranslation();
    // Access feedContext and reqId from feedItem (native properties from FeedViewPost)
    const feedContext = feedItem?.feedContext;
    const reqId = feedItem?.reqId;
    const algorithmicFeedProvider = useUserStore(state => state.algorithmicFeedProvider);
    const feedUri = useMemo(
      () => (feedOption && feedOption.startsWith('at://') ? feedOption : undefined),
      [feedOption]
    );
    const fallbackFeedUri = useMemo(
      () =>
        algorithmicFeedProvider && algorithmicFeedProvider.startsWith('at://')
          ? algorithmicFeedProvider
          : undefined,
      [algorithmicFeedProvider]
    );
    const resolvedFeedUri = feedUri ?? fallbackFeedUri;
    const { presentCommentSection } = useGlobalCommentSection();

    // Normalize post - extract ExtendedPostView from ExtendedFeedViewPost if needed
    const postView: ExtendedPostView = useMemo(() => normalizePostView(post), [post]);

    // Subscribe only to this post's interaction so other cards don't re-render on like/repost
    const defaultInteraction = useMemo(
      () => ({
        isLiked: !!postView.viewer?.like,
        likeCount: postView.likeCount || 0,
        commentCount: postView.replyCount || 0,
        repostCount: postView.repostCount || 0,
        isReposted: !!postView.viewer?.repost,
        isBookmarked: false,
        likeUri: postView.viewer?.like,
        repostUri: postView.viewer?.repost,
      }),
      [
        postView.viewer?.like,
        postView.likeCount,
        postView.replyCount,
        postView.repostCount,
        postView.viewer?.repost,
      ]
    );
    const { postInteractionDelta, updatePostInteraction } = usePostInteractionStore(
      useShallow(state => ({
        postInteractionDelta: state.interactions.get(postView.uri),
        updatePostInteraction: state.updatePostInteraction,
      }))
    );
    const persistedInteraction = useMemo(
      () => mergePostInteractionDelta(defaultInteraction, postInteractionDelta),
      [defaultInteraction, postInteractionDelta]
    );

    // Enhanced video state management with automatic recycling
    // Scope by post URI + feedOption so playback state doesn't leak across different feeds
    // Only track userPaused - derive hasError directly from playerStatus to avoid duplication
    const [videoState, setVideoState] = useRecyclingState(
      {
        userPaused: false,
      },
      [postView.uri, feedOption]
    ); // Auto-resets when post.uri or feed context changes

    // Overlay state - using recycling state for automatic reset, but initialize from store
    const [overlayState, setOverlayState] = useRecyclingState(
      {
        isLikePending: false,
        isRepostPending: false,
        ...persistedInteraction,
      },
      [postView.uri, feedOption]
    ); // Auto-resets when post.uri or feed context changes

    // Merge persisted counts with any in-flight optimistic updates from overlayState.
    // Depend on specific fields — not the full overlayState object — so an unrelated
    // setOverlayState (e.g. isRepostPending: false) doesn't invalidate this memo.
    const displayInteraction = useMemo(() => {
      let d = persistedInteraction;
      if (overlayState.isLikePending) {
        d = {
          ...d,
          isLiked: overlayState.isLiked,
          likeCount: overlayState.likeCount,
          likeUri: overlayState.likeUri,
        };
      }
      if (overlayState.isRepostPending) {
        d = {
          ...d,
          isReposted: overlayState.isReposted,
          repostCount: overlayState.repostCount,
          repostUri: overlayState.repostUri,
        };
      }
      return d;
    }, [
      persistedInteraction,
      overlayState.isLikePending,
      overlayState.isLiked,
      overlayState.likeCount,
      overlayState.likeUri,
      overlayState.isRepostPending,
      overlayState.isReposted,
      overlayState.repostCount,
      overlayState.repostUri,
    ]);

    const likeStateForHook = useMemo(
      () => ({
        isLiked: displayInteraction.isLiked,
        likeCount: displayInteraction.likeCount,
        likeUri: displayInteraction.likeUri,
        isLikePending: overlayState.isLikePending,
        isReposted: displayInteraction.isReposted,
        isBookmarked: displayInteraction.isBookmarked,
        commentCount: displayInteraction.commentCount,
        repostCount: displayInteraction.repostCount,
        isRepostPending: overlayState.isRepostPending,
      }),
      [displayInteraction, overlayState.isLikePending, overlayState.isRepostPending]
    );

    const { isFollowing, hasProfile, authorProfileOverlay, channelSlug, channelUri } =
      useVideoCardAuthorMeta(postView);

    // Keep a ref in sync with userPaused so useFocusEffect doesn't re-register on every pause toggle.
    const userPausedRef = useRef(videoState.userPaused);
    userPausedRef.current = videoState.userPaused;

    useEffect(() => {
      if (!isVisible || !onUserPausedChange) return;
      onUserPausedChange(videoState.userPaused);
    }, [isVisible, videoState.userPaused, onUserPausedChange]);

    // Tap demux: single timer shared between single/double-tap detection (bridge target for runOnJS)
    const videoTapSingleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearVideoTapSingleTimer = useCallback(() => {
      if (videoTapSingleTimerRef.current) {
        clearTimeout(videoTapSingleTimerRef.current);
        videoTapSingleTimerRef.current = null;
      }
    }, []);

    const heartScale = useSharedValue(0);
    const heartOpacity = useSharedValue(0);
    const heartPositionX = useSharedValue(0);
    const heartPositionY = useSharedValue(0);

    // Interaction tracking - queue interactions and send in batches
    const interactionQueueRef = useRef<Interaction[]>([]);
    const sendInteractionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seenInteractionSentRef = useRef<boolean>(false);

    // Queue an interaction for batching
    const queueInteraction = useCallback(
      (event: NonNullable<Interaction['event']>) => {
        const interaction: Interaction = {
          $type: 'app.bsky.feed.defs#interaction',
          item: postView.uri,
          event: event,
        };

        // Use feedContext from feedItem if provided (native property from FeedViewPost)
        if (feedContext) {
          interaction.feedContext = feedContext;
        }
        if (reqId) {
          interaction.reqId = reqId;
        }

        interactionQueueRef.current.push(interaction);

        // Clear existing timeout
        if (sendInteractionsTimeoutRef.current) {
          clearTimeout(sendInteractionsTimeoutRef.current);
        }

        // Send batched interactions after 1.5 seconds of inactivity
        sendInteractionsTimeoutRef.current = setTimeout(() => {
          const interactionsToSend = [...interactionQueueRef.current];
          interactionQueueRef.current = [];

          if (interactionsToSend.length > 0) {
            AtprotoFeedService.sendFeedInteractions(interactionsToSend, resolvedFeedUri).catch(
              error => {
                ErrorHandler.handleError(error, 'VideoCard: sendFeedInteractions (debounced)');
              }
            );
          }

          sendInteractionsTimeoutRef.current = null;
        }, 1500);
      },
      [postView.uri, feedContext, reqId, resolvedFeedUri]
    );

    const videoView = getVideoView(postView.embed);
    const videoUrl = videoView?.playlist || null;
    const posterUrl = videoView?.thumbnail || null;

    // Track dimensions. Treat height from parent (ListFeedView/VideoItem) as source of truth so
    // cards match the viewport height; fall back to full screen height if no height is provided.
    const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
    const cardHeight = height ?? screenHeight;

    // HLS-only source creation
    const videoSource = createVideoSource(videoUrl);

    // Create expo-video player with setup callback
    // expo-video's useVideoPlayer automatically handles player lifecycle and cleanup
    // It reuses players efficiently when components are recycled by FlashList
    const player = useVideoPlayer(videoSource, player => {
      player.loop = true;
      player.muted = false;
      player.timeUpdateEventInterval = 0; // Explicit: no progress updates (overlay has no progress bar)
      player.bufferOptions = DEFAULT_BUFFER_OPTIONS;
      player.seekTolerance = DEFAULT_SEEK_TOLERANCE_SCRUBBER;
    });

    // Listen to player status changes using expo's useEvent hook
    const { status: playerStatus } = useEvent(player, 'statusChange', {
      status: player?.status ?? 'idle',
    });

    // Derive error state directly from playerStatus (no need to duplicate in state)
    const hasError = playerStatus === 'error';

    // Simplified content warning state (warn: opt-in to view; hide: no opt-in).
    // useRecyclingState resets when post changes, so no extra useEffect needed.
    const [userChoseToView, setUserChoseToView] = useRecyclingState(false, [postView.uri]);

    // Track first frame render and blur ready so we hide the poster only when both are done
    // (avoids showing a blank area where the Skia blur hasn't loaded yet)
    const [firstFrameRendered, setFirstFrameRendered] = useRecyclingState(false, [
      postView.uri,
      feedOption,
    ]);
    const [blurReady, setBlurReady] = useRecyclingState(false, [postView.uri, feedOption]);

    const handleFirstFrameRender = useCallback(() => {
      setFirstFrameRendered(true);
    }, [setFirstFrameRendered]);

    const handleBlurReady = useCallback(() => {
      setBlurReady(true);
    }, [setBlurReady]);

    const { cannotShowMedia, isBlurred, warningDescription, handleViewContent } =
      useVideoCardModerationState(postView, feedItem, userChoseToView, setUserChoseToView);

    // Animated style for heart animation - runs on UI thread
    const heartAnimatedStyle = useAnimatedStyle(() => {
      'worklet';
      return {
        left: heartPositionX.value - 50,
        top: heartPositionY.value - 50,
        opacity: heartOpacity.value,
        transform: [{ scale: heartScale.value }],
      };
    });

    useEffect(() => {
      // FlashList recycle: cancel in-flight heart animation so SVs don't leak to the next post (Reanimated + FlashList guide)
      cancelAnimation(heartScale);
      cancelAnimation(heartOpacity);
      cancelAnimation(heartPositionX);
      cancelAnimation(heartPositionY);
      heartScale.value = 0;
      heartOpacity.value = 0;
      heartPositionX.value = 0;
      heartPositionY.value = 0;
    }, [postView.uri, heartScale, heartOpacity, heartPositionX, heartPositionY]);

    // Isolated video playback logic - only depends on this video's state
    const shouldPlayVideo =
      !cannotShowMedia &&
      !isBlurred &&
      !shouldDisablePlayback &&
      !hasError &&
      !videoState.userPaused &&
      isVisible &&
      !!videoUrl;

    // Hide scrubber for very short clips — no value in showing it
    const shouldHideScrubberForShortVideo = !!(
      player?.duration &&
      player.duration > 0 &&
      player.duration < MIN_SCRUBBER_DURATION_SECONDS
    );

    // Text-expanded dim state is driven fully by Reanimated shared values to avoid re-rendering
    // VideoCard when the overlay text is expanded/collapsed.
    const textDimOpacitySV = useSharedValue(0);

    useEffect(() => {
      // Reset dim state when post changes (FlashList recycle safety)
      textDimOpacitySV.value = 0;
    }, [postView.uri, textDimOpacitySV]);

    const handleOverlayCollapsedChange = useCallback(
      (isCollapsed: boolean) => {
        const isExpanded = !isCollapsed;
        textDimOpacitySV.value = withTiming(isExpanded ? 0.65 : 0, { duration: 120 });
      },
      [textDimOpacitySV]
    );

    const textDimAnimatedStyle = useAnimatedStyle(() => {
      'worklet';
      return { opacity: textDimOpacitySV.value };
    }, [textDimOpacitySV]);

    const shouldLoadVideo = !cannotShowMedia && !isBlurred && !!videoSource;

    // Use post URI or CID as unique recycling key to prevent image reuse from other videos
    // when no thumbnail has loaded yet (FlashList/expo-image recycling). Same fix as GridFeedView.
    const recyclingKey = postView?.uri || postView?.cid || `item-${index ?? 0}`;

    // Simplified video playback control functions
    const togglePlayback = useCallback(
      (shouldPlay?: boolean) => {
        if (cannotShowMedia || isBlurred || shouldDisablePlayback) return;

        // Guard against toggling when an error has occurred
        if (hasError) {
          return;
        }

        setVideoState(prev => {
          const nextPaused = shouldPlay !== undefined ? !shouldPlay : !prev.userPaused;
          if (prev.userPaused === nextPaused) {
            return prev;
          }

          return { ...prev, userPaused: nextPaused };
        });
      },
      [cannotShowMedia, isBlurred, shouldDisablePlayback, hasError, setVideoState]
    );

    // togglePlayback handles all play/pause logic directly

    const seek = useCallback(
      (position: number) => {
        if (player) {
          // expo-video uses seconds, convert from ms if needed
          const positionInSeconds = position > 1000 ? position / 1000 : position;
          player.currentTime = positionInSeconds;
        }
      },
      [player]
    );

    // Expose functions via ref
    useImperativeHandle(
      ref,
      () => ({
        play: () => togglePlayback(true),
        pause: () => togglePlayback(false),
        togglePlay: () => togglePlayback(),
        getDuration: () => {
          if (player && player.duration) {
            return player.duration * 1000; // Convert to ms
          }
          return 0;
        },
        seekTo: seek,
        seek,
        unload: () => {
          if (player) {
            player.pause();
            player.currentTime = 0;
            // Use ref so this dep doesn't force handle recreation on every pause toggle
            if (!userPausedRef.current) {
              setVideoState(prev => ({ ...prev, userPaused: true }));
            }
          }
        },
        playPause: (shouldPlay: boolean) => togglePlayback(shouldPlay),
        // Report intended play state based on our own logic, not the underlying player flag
        getPlayState: () => shouldPlayVideo,
        getCurrentTime: () => {
          if (player && player.currentTime) {
            return player.currentTime * 1000; // Convert to ms
          }
          return 0;
        },
      }),
      [player, shouldPlayVideo, togglePlayback, seek, setVideoState]
    );

    // Auto-resume when (a) overlay blocking is removed, or (b) video becomes visible.
    const prevShouldDisablePlaybackRef = useRef(shouldDisablePlayback);
    const prevIsVisibleRef = useRef(isVisible);
    useEffect(() => {
      const wasBlocked = prevShouldDisablePlaybackRef.current;
      const wasVisible = prevIsVisibleRef.current;
      const isNowUnblocked = !shouldDisablePlayback && wasBlocked;
      const becameVisible = !wasVisible && isVisible;

      if (videoState.userPaused && !hasError) {
        if (isNowUnblocked && isVisible) {
          setVideoState(prev => ({ ...prev, userPaused: false }));
        } else if (becameVisible && !shouldDisablePlayback) {
          setVideoState(prev => ({ ...prev, userPaused: false }));
        }
      }

      prevShouldDisablePlaybackRef.current = shouldDisablePlayback;
      prevIsVisibleRef.current = isVisible;
    }, [shouldDisablePlayback, isVisible, hasError, videoState.userPaused, setVideoState]);

    // Simplified focus effect - pause on blur, resume on focus if needed.
    // userPausedRef avoids re-registering the effect on every pause/unpause toggle.
    useFocusEffect(
      useCallback(() => {
        // On focus - do nothing, let visibility control playback

        return () => {
          // On blur - always pause to conserve resources
          if (!userPausedRef.current) {
            togglePlayback(false);
          }
        };
      }, [togglePlayback])
    );

    // On error: retry once with a fresh HLS URL (re-fetch post then replace source)
    const errorRetriedForUriRef = useRef<string | null>(null);

    // Handle player status changes for callbacks only
    useEffect(() => {
      if (!player) return;

      if (playerStatus === 'readyToPlay') {
        onVideoStatus?.(postView.uri, 'loaded');
      } else if (playerStatus === 'loading') {
        onVideoStatus?.(postView.uri, 'loading');
      } else if (playerStatus === 'error') {
        if (errorRetriedForUriRef.current !== postView.uri) {
          errorRetriedForUriRef.current = postView.uri;
          ErrorHandler.safeAsync(async () => {
            const post = await AtprotoFeedService.getPost(postView.uri);
            const vv = post ? getVideoView(post.embed) : null;
            const newSource = createVideoSource(vv?.playlist ?? null);
            if (!newSource) {
              errorRetriedForUriRef.current = null; // allow retry if getPost returns no source
              return;
            }
            await player.replaceAsync(newSource);
          }, 'VideoCard: retry replaceAsync after error');
        }
        onVideoStatus?.(postView.uri, 'error');
      }
    }, [playerStatus, player, postView.uri, onVideoStatus]);

    // On foreground: reset error retry gate and nudge stalled player.
    // Volatile values are read via ref so the subscription only re-registers when the
    // player instance itself changes — not on every visibility/status change (N cards × M events).
    const appStateVolatileRef = useRef({
      isVisible,
      userPaused: videoState.userPaused,
      shouldDisablePlayback,
      playerStatus,
    });
    appStateVolatileRef.current = {
      isVisible,
      userPaused: videoState.userPaused,
      shouldDisablePlayback,
      playerStatus,
    };
    useEffect(() => {
      if (!player) return;
      const sub = AppState.addEventListener('change', nextState => {
        if (nextState !== 'active') return;
        errorRetriedForUriRef.current = null;
        const {
          isVisible: iv,
          userPaused,
          shouldDisablePlayback: sdp,
          playerStatus: ps,
        } = appStateVolatileRef.current;
        if (iv && !userPaused && !sdp && ps !== 'error') {
          player.play();
        }
      });
      return () => sub.remove();
    }, [player]);

    // Drive play/pause from shouldPlayVideo — the single source of truth for whether
    // this card should be playing (visibility + user intent + content checks).
    // https://docs.expo.dev/versions/latest/sdk/video/#usage
    useEffect(() => {
      if (!player) return;
      if (shouldPlayVideo) {
        player.play();
      } else {
        player.pause();
      }
    }, [shouldPlayVideo, player]);

    const { toggleLike: toggleLikeInteraction, likeOnly: likeOnlyInteraction } = useLikeInteraction(
      {
        state: likeStateForHook,
        setState: setOverlayState,
        postUri: postView.uri,
        postCid: postView.cid,
        updatePostInteraction,
        onLikeSuccess: () => queueInteraction(INTERACTIONLIKE_CONST),
      }
    );

    // Simplified overlay interaction handlers
    const handleLike = useCallback(async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await toggleLikeInteraction();
    }, [toggleLikeInteraction]);

    // Like-only handler for double tap (doesn't unlike)
    const handleLikeOnly = useCallback(async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await likeOnlyInteraction();
    }, [likeOnlyInteraction]);

    // Double tap to like animation - runs on UI thread with Reanimated
    // Heartbeat pattern: quick beat, slight dip, second beat, then fade out
    const animateHeart = useCallback(
      (x: number, y: number) => {
        // Cancel any ongoing animations
        heartScale.value = 0;
        heartOpacity.value = 0;

        // Set position
        heartPositionX.value = x;
        heartPositionY.value = y;

        // Start animation sequence - heartbeat pattern
        heartOpacity.value = 1;
        heartScale.value = withSequence(
          // First heartbeat beat - quick and strong
          withTiming(1.3, {
            duration: 100,
            easing: Easing.out(Easing.ease),
          }),
          // Quick dip below 1 for heartbeat feel
          withTiming(0.95, {
            duration: 80,
            easing: Easing.in(Easing.ease),
          }),
          // Second heartbeat beat - slightly smaller
          withTiming(1.15, {
            duration: 100,
            easing: Easing.out(Easing.ease),
          }),
          // Return to normal size
          withTiming(1, {
            duration: 120,
            easing: Easing.inOut(Easing.ease),
          })
        );

        // Fade out after the heartbeat sequence completes
        heartOpacity.value = withDelay(
          400, // Wait for heartbeat to complete (~400ms total)
          withTiming(
            0,
            {
              duration: 300,
              easing: Easing.out(Easing.ease),
            },
            () => {
              // Reset values after animation completes
              heartScale.value = 0;
            }
          )
        );
      },
      [heartScale, heartOpacity, heartPositionX, heartPositionY]
    );

    // Tap demux (runOnJS bridge target): second tap within window = double-tap like.
    // Gesture recognition runs on the UI thread via RNGH; JS only wakes on confirmed events.
    const handleSingleTap = useCallback(
      (x: number, y: number) => {
        if (videoTapSingleTimerRef.current != null) {
          // Second tap within window — double-tap like
          clearVideoTapSingleTimer();
          animateHeart(x, y);
          void handleLikeOnly();
          return;
        }
        videoTapSingleTimerRef.current = setTimeout(() => {
          videoTapSingleTimerRef.current = null;
          togglePlayback();
        }, VIDEO_DOUBLE_TAP_WINDOW_MS);
      },
      [clearVideoTapSingleTimer, animateHeart, handleLikeOnly, togglePlayback]
    );

    // Handle long press to show comments
    const handleLongPress = useCallback(() => {
      clearVideoTapSingleTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Track interaction
      queueInteraction(INTERACTIONREPLY_CONST);

      // Show comment section
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
        totalLikes: displayInteraction.likeCount,
        totalComments: displayInteraction.commentCount,
        isLiked: displayInteraction.isLiked,
        postedAt: (postView.record as { createdAt?: string })?.createdAt || postView.indexedAt,
        onToggleLike: handleLike,
        isLikePending: overlayState.isLikePending,
      });
    }, [
      clearVideoTapSingleTimer,
      displayInteraction.likeCount,
      displayInteraction.commentCount,
      displayInteraction.isLiked,
      overlayState.isLikePending,
      presentCommentSection,
      handleLike,
      postView.author,
      postView.cid,
      postView.record,
      postView.uri,
      postView.indexedAt,
      queueInteraction,
    ]);

    // RNGH gesture: race long-press vs tap. Recognition runs on the UI thread;
    // runOnJS bridges to JS only when a gesture is confirmed (no overhead during idle scroll).
    const videoGesture = useMemo(() => {
      const singleTap = Gesture.Tap()
        .maxDuration(250)
        .numberOfTaps(1)
        .onEnd((event, success) => {
          'worklet';
          if (!success) return;
          const x = event.x ?? screenWidth / 2;
          const y = event.y ?? cardHeight / 2;
          runOnJS(handleSingleTap)(x, y);
        });

      const longPress = Gesture.LongPress()
        .minDuration(400)
        .onEnd((_event, success) => {
          'worklet';
          if (!success) return;
          runOnJS(handleLongPress)();
        });

      return Gesture.Race(longPress, singleTap);
    }, [handleSingleTap, handleLongPress, screenWidth, cardHeight]);

    // Cleanup demux timer on unmount and post change
    useEffect(() => {
      return () => clearVideoTapSingleTimer();
    }, [clearVideoTapSingleTimer]);
    useEffect(() => {
      clearVideoTapSingleTimer();
    }, [postView.uri, clearVideoTapSingleTimer]);

    const handleRepost = useCallback(async () => {
      if (overlayState.isRepostPending) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const wasReposted = displayInteraction.isReposted;
      const newIsReposted = !wasReposted;
      const newRepostCount = newIsReposted
        ? displayInteraction.repostCount + 1
        : Math.max(0, displayInteraction.repostCount - 1);

      setOverlayState(prev => ({
        ...prev,
        isRepostPending: true,
        isReposted: newIsReposted,
        repostCount: newRepostCount,
      }));

      try {
        if (!wasReposted) {
          const repostUri = await AtprotoFeedService.repostPost(postView.uri, postView.cid);
          setOverlayState(prev => ({ ...prev, repostUri }));
          updatePostInteraction(postView.uri, {
            isReposted: true,
            repostCount: newRepostCount,
            repostUri,
          });
          queueInteraction(INTERACTIONREPOST_CONST);
        } else {
          if (!displayInteraction.repostUri) throw new Error('No repost URI found');
          await AtprotoFeedService.deleteRepost(displayInteraction.repostUri);
          setOverlayState(prev => ({ ...prev, repostUri: undefined }));
          updatePostInteraction(postView.uri, {
            isReposted: false,
            repostCount: newRepostCount,
            repostUri: undefined,
          });
        }
      } catch (_error) {
        setOverlayState(prev => ({
          ...prev,
          isReposted: wasReposted,
          repostCount: displayInteraction.repostCount,
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isRepostPending: false }));
      }
    }, [
      overlayState.isRepostPending,
      displayInteraction.isReposted,
      displayInteraction.repostCount,
      displayInteraction.repostUri,
      postView.uri,
      postView.cid,
      setOverlayState,
      updatePostInteraction,
      queueInteraction,
    ]);

    const { navigateToChannel: goToChannel } = useProfileChannelNavigation();

    const handleChannelPress = useCallback(() => {
      if (channelUri) {
        goToChannel(encodeURIComponent(channelUri));
      }
    }, [channelUri, goToChannel]);

    const handleShareInteraction = useCallback(() => {
      queueInteraction(INTERACTIONSHARE_CONST);
    }, [queueInteraction]);

    // Track interactionSeen and markAsSeen when video becomes visible
    useEffect(() => {
      if (isVisible) {
        if (!seenInteractionSentRef.current) {
          seenInteractionSentRef.current = true;
          queueInteraction(INTERACTIONSEEN_CONST);
        }
        seenVideoService.markAsSeen(postView.uri);
      }
    }, [isVisible, queueInteraction, postView.uri]);

    // Send remaining interactions on unmount
    useEffect(() => {
      return () => {
        if (sendInteractionsTimeoutRef.current) {
          clearTimeout(sendInteractionsTimeoutRef.current);
          sendInteractionsTimeoutRef.current = null;
        }

        // Send any remaining queued interactions
        if (interactionQueueRef.current.length > 0) {
          const interactionsToSend = [...interactionQueueRef.current];
          interactionQueueRef.current = [];
          AtprotoFeedService.sendFeedInteractions(interactionsToSend, resolvedFeedUri).catch(
            error => {
              ErrorHandler.handleError(error, 'VideoCard: sendFeedInteractions (unmount flush)');
            }
          );
        }
      };
    }, [resolvedFeedUri]);

    // Reset seen interaction flag when post changes
    useEffect(() => {
      seenInteractionSentRef.current = false;
    }, [postView.uri]);

    const seekingAnimationSV = useSharedValue(0);
    const feedScrollMotion = useFeedScrollMotion();
    const feedScrollLayout = useFeedScrollLayout();
    const scrollOffsetYSV = feedScrollMotion?.scrollOffsetYSV;
    const headerH = feedScrollLayout?.headerHeight ?? 0;
    const viewportH = feedScrollLayout?.viewportHeight ?? 0;
    const itemSp = feedScrollLayout?.itemSpacing ?? 0;
    const idx = index ?? 0;
    const uiOverlayOpacitySV = useVideoCardOverlayOpacity({
      seekingAnimationSV,
      scrollOffsetYSV,
      headerH,
      viewportH,
      itemSp,
      idx,
      cardHeight,
    });

    const gestureVideoStackProps = useMemo(
      () => ({
        videoGesture,
        posterUrl,
        cannotShowMedia,
        firstFrameRendered,
        blurReady,
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
        videoGesture,
        posterUrl,
        cannotShowMedia,
        firstFrameRendered,
        blurReady,
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
        isVisible,
        overlayOpacitySV: uiOverlayOpacitySV,
        sourceFeed: resolvedFeedUri,
        onOverlayCollapsedChange: handleOverlayCollapsedChange,
        onLike: handleLike,
        onRepost: handleRepost,
        onShareInteraction: handleShareInteraction,
        isLiked: displayInteraction.isLiked,
        isReposted: displayInteraction.isReposted,
        likeCount: displayInteraction.likeCount,
        commentCount: displayInteraction.commentCount,
        repostCount: displayInteraction.repostCount,
        isLikePending: overlayState.isLikePending,
        isRepostPending: overlayState.isRepostPending,
        isFollowing,
        hasProfile,
        channelSlug,
        onChannelPress: handleChannelPress,
        authorProfileOverlay,
      }),
      [
        postView,
        isVisible,
        uiOverlayOpacitySV,
        resolvedFeedUri,
        handleOverlayCollapsedChange,
        handleLike,
        handleRepost,
        handleShareInteraction,
        displayInteraction.isLiked,
        displayInteraction.isReposted,
        displayInteraction.likeCount,
        displayInteraction.commentCount,
        displayInteraction.repostCount,
        overlayState.isLikePending,
        overlayState.isRepostPending,
        isFollowing,
        hasProfile,
        channelSlug,
        handleChannelPress,
        authorProfileOverlay,
      ]
    );

    return (
      <View style={[styles.container, { height: cardHeight }]}>
        <VideoCardMediaLayer
          thumbnailUrlForBlur={cannotShowMedia ? null : (posterUrl ?? null)}
          onBlurReady={handleBlurReady}
          gestureStack={gestureVideoStackProps}
        />

        <VideoCardOverlayLayers
          shouldRenderScrubber={!shouldHideScrubberForShortVideo}
          scrubberActive={isVisible && !hasError}
          player={player}
          playerStatus={playerStatus}
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
);

// Styles
const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.black, // Fallback background color
  },
});

VideoCard.displayName = 'VideoCard';

export default VideoCard;
