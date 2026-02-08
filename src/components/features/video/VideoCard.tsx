import React, {
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView as ExpoVideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';

import { AtprotoService } from '../../../services/api/AtprotoService';
import { FeedService } from '../../../services/api/feed/FeedService';
import { View, Text, Dimensions, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  useDerivedValue,
  interpolate,
} from 'react-native-reanimated';
import { BORDER_RADIUS } from '../../../utils/constants';
import { BlurView } from '../../ui/BlurView';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { Colors } from '../../../theme';
import { Loading3FillIcon, HeartFillIcon } from '../../ui/Icon';
import BlurredBackground from '../../ui/BlurredBackground';
import {
  normalizePostView,
  createVideoSource,
  getVideoView,
  DEFAULT_BUFFER_OPTIONS,
  DEFAULT_SEEK_TOLERANCE_SCRUBBER,
} from '../../../utils/video/helpers';
import VideoOverlayUI from './VideoOverlayUI';
import { useFocusEffect } from 'expo-router';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { usePostInteractionStore } from '../../../stores/postInteractionStore';
import { useProfile } from '../../../services/data/ProfileService';
import { getProfileColors } from '../../../utils/formatting/colors';
import { getChannelBySlug } from '../../../utils/channels/orbyt';
import { VideoScrubber } from './VideoScrubber';
import { useOverlayVisibility } from '../../../context/FeedIndicatorContext';
import { useFeedScroll } from '../../../context/FeedScrollContext';
import { seenVideoService } from '../../../services/SeenVideoService';
import { hexToRGBA } from '../../../utils/formatting/colors';
import { useFollowStore } from '../../../stores/followStore';
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

/** Full opacity when percent-visible ≥ this. Larger = bigger "centered" area at 100% opacity. */
const OVERLAY_DEAD_ZONE = 0.9;
/** In the fade zone: (raw/deadZone)^exp. >1 = fade out faster. */
const OVERLAY_FADE_EXPONENT = 2;

/** System moderation labels: do not show in user-facing warning text. */
const WARNING_HIDDEN_LABELS = ['!hide', '!warn', '!no-unauthenticated'];

/** Map label values to user-friendly warning messages */
const LABEL_MESSAGE_MAP: Record<string, string> = {
  // Global labels
  porn: 'explicit sexual content',
  sexual: 'sexually suggestive content',
  nudity: 'nudity',
  'graphic-media': 'graphic or violent content',
  gore: 'graphic or violent content', // deprecated alias
  // Common custom labels from Bluesky moderation service
  'self-harm': 'content about self-harm',
  sensitive: 'sensitive content',
  extremist: 'extremist content',
  intolerance: 'intolerant content',
  threats: 'threatening content',
  rude: 'rude or offensive content',
  illicit: 'illicit content',
  'security-concerns': 'potentially unsafe content',
  'unsafe-link': 'unsafe links',
  impersonation: 'impersonation',
  misinformation: 'misinformation',
  scam: 'scam content',
  'engagement-farming': 'engagement farming content',
  spam: 'spam',
  unconfirmed: 'unconfirmed claims',
  misleading: 'misleading content',
  'inauthentic-account': 'content from an inauthentic account',
  'sexually-suggestive-cartoon': 'sexually suggestive cartoon content',
};

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
  isModal?: boolean;
  /** Item index in the list; used with FeedScrollContext to compute percent visible from scroll+layout. */
  index?: number;
}

const VideoCard = memo(
  forwardRef<VideoCardRef, VideoCardProps>(
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
        isModal = false,
        index,
      },
      ref
    ) => {
      // Access feedContext and reqId from feedItem (native properties from FeedViewPost)
      const feedContext = feedItem?.feedContext;
      const reqId = feedItem?.reqId;
      const { presentCommentSection } = useGlobalCommentSection();
      const { updatePostInteraction, getPostInteraction } = usePostInteractionStore();

      // Normalize post - extract ExtendedPostView from ExtendedFeedViewPost if needed
      const postView: ExtendedPostView = React.useMemo(() => {
        return normalizePostView(post);
      }, [post]);

      // Enhanced video state management with automatic recycling
      // Scope by post URI + feedOption so playback state doesn't leak across different feeds
      // Only track userPaused - derive hasError directly from playerStatus to avoid duplication
      const [videoState, setVideoState] = useRecyclingState(
        {
          userPaused: false,
        },
        [postView.uri, feedOption]
      ); // Auto-resets when post.uri or feed context changes

      // Get persisted interaction state from store
      const persistedInteraction = getPostInteraction(postView.uri, {
        isLiked: !!postView.viewer?.like,
        likeCount: postView.likeCount || 0,
        repostCount: postView.repostCount || 0,
        isReposted: !!postView.viewer?.repost,
        isBookmarked: false, // Bookmarks are now handled in share sheet
        likeUri: postView.viewer?.like,
        repostUri: postView.viewer?.repost,
      });

      // Overlay state - using recycling state for automatic reset, but initialize from store
      const [overlayState, setOverlayState] = useRecyclingState(
        {
          isLikePending: false,
          isRepostPending: false,
          ...persistedInteraction,
        },
        [postView.uri, feedOption]
      ); // Auto-resets when post.uri or feed context changes

      // Lightweight follow state per post, hoisted out of overlay
      // Single useProfile for this card; derive isAuthorBlocked, profileColors, authorDid, authorProfileStatus
      // and pass to VideoOverlayUI to avoid duplicate useProfile there (FlashList deduplication)
      const { data: cachedProfile } = useProfile(postView.author?.handle);
      const authorDid = cachedProfile?.did || postView.author?.did;
      const followStoreState = useFollowStore(state =>
        authorDid ? state.follows.get(authorDid) : undefined
      );
      // Combine both sources: profile cache OR optimistic follow store state
      const isFollowing = !!(cachedProfile?.viewer?.following || followStoreState?.isFollowing);
      const hasProfile = !!cachedProfile;

      // Single object for overlay (avoids 4 separate props and duplicate useProfile in VideoOverlayUI)
      // Use profile.orbytColors (from get-profile) so overlay avatar ring uses correct orbyt colors
      const authorProfileOverlay = React.useMemo(
        () => ({
          isAuthorBlocked: !!(
            cachedProfile?.viewer?.blocking || cachedProfile?.viewer?.blockingByList
          ),
          profileColors: getProfileColors(cachedProfile?.orbytColors ?? cachedProfile),
          authorDid,
          authorProfileStatus: cachedProfile?.status,
        }),
        [cachedProfile, authorDid]
      );

      // Extract channel slug from post tags - simple match, no lookups
      const channelSlug = React.useMemo(() => {
        const record = postView.record as { tags?: string[] };
        const tags = record?.tags || [];
        if (!Array.isArray(tags) || tags.length === 0) {
          return null;
        }
        const channelTag = tags.find(
          (tag: string) => typeof tag === 'string' && tag.startsWith('orbyt-channel-')
        );
        if (!channelTag) {
          return null;
        }
        return channelTag.replace(/^orbyt-channel-/, '') || null;
      }, [postView]);

      // Get channel URI for navigation (only lookup needed for routing)
      const channelUri = React.useMemo(() => {
        if (!channelSlug) return null;
        const channel = getChannelBySlug(channelSlug);
        return channel?.uri || null;
      }, [channelSlug]);

      // Double tap to like state - using Reanimated for UI thread performance
      const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
      const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
              FeedService.sendFeedInteractions(interactionsToSend).catch(() => {});
            }

            sendInteractionsTimeoutRef.current = null;
          }, 1500);
        },
        [postView.uri, feedContext, reqId]
      );

      // Get video URL, thumbnail, and aspect ratio using getVideoView helper + direct property access
      const videoView = getVideoView(postView.embed);
      const videoUrl = videoView?.playlist || null;
      const posterUrl = videoView?.thumbnail || null;

      // Track dimensions. Treat height from parent (ListFeedView/VideoItem) as source of truth so
      // cards match the viewport height; fall back to full screen height if no height is provided.
      const { height: screenHeight } = Dimensions.get('window');
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

      // Moderation: hide = explicit filter/noOverride from batch; warn = blur only with opt-in.
      // Failsafe: if the post has labels but we're missing batch result (e.g. search/spotlight), block to avoid showing un-evaluated labeled content.
      const contentListUI = feedItem?.contentListUI;
      const contentMediaUI = feedItem?.contentMediaUI;
      const hasModerationFromBatch = contentListUI != null || contentMediaUI != null;
      const postHasLabels =
        Array.isArray((postView as { labels?: unknown[] }).labels) &&
        (postView as { labels: unknown[] }).labels.length > 0;
      const shouldBlur = !!(contentListUI?.blur || contentMediaUI?.blur);
      const noOverride = !!(contentListUI?.noOverride || contentMediaUI?.noOverride);
      const isFiltered = !!(contentListUI?.filter || contentMediaUI?.filter);
      const cannotShowMedia =
        noOverride || isFiltered || (!hasModerationFromBatch && postHasLabels);
      const isWarn = shouldBlur && !noOverride && !isFiltered;
      const firstBlur = contentListUI?.blurs?.[0] ?? contentMediaUI?.blurs?.[0];
      const reason =
        firstBlur && typeof firstBlur === 'object' && 'label' in firstBlur
          ? (firstBlur as { label: { val?: string } }).label?.val
          : undefined;
      const isBlurred = isWarn && !userChoseToView;

      const warningDescription = useMemo(() => {
        const fallback = 'This video may not be appropriate for all viewers.';
        if (!reason) return fallback;

        // Parse labels from reason (can be comma-separated)
        const labels = reason
          .split(',')
          .map((l: string) => l.trim())
          .filter((l: string) => !WARNING_HIDDEN_LABELS.includes(l));

        if (labels.length === 0) return fallback;

        // Map labels to user-friendly messages
        const messages = labels
          .map((label: string) => {
            // Check exact match first
            if (LABEL_MESSAGE_MAP[label]) {
              return LABEL_MESSAGE_MAP[label];
            }
            // Check case-insensitive match
            const lowerLabel = label.toLowerCase();
            const matchedKey = Object.keys(LABEL_MESSAGE_MAP).find(
              key => key.toLowerCase() === lowerLabel
            );
            if (matchedKey) {
              return LABEL_MESSAGE_MAP[matchedKey];
            }
            // Fallback: format the label identifier nicely
            return label
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ')
              .toLowerCase();
          })
          .filter((msg: string) => msg.length > 0);

        if (messages.length === 0) return fallback;

        // Format multiple labels
        const formattedMessage =
          messages.length > 1
            ? messages.slice(0, -1).join(', ') + ', and ' + messages[messages.length - 1]
            : messages[0];

        // Special case: inauthentic account uses different sentence structure
        if (
          labels.some(l => l === 'inauthentic-account' || l.toLowerCase() === 'inauthentic-account')
        ) {
          return `This video may be from an inauthentic account.`;
        }

        return `This video may contain ${formattedMessage}.`;
      }, [reason]);

      const handleViewContent = useCallback(() => setUserChoseToView(true), [setUserChoseToView]);

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

      // Isolated video playback logic - only depends on this video's state
      const shouldPlayVideo =
        !cannotShowMedia &&
        !isBlurred &&
        !shouldDisablePlayback &&
        !hasError &&
        !videoState.userPaused &&
        isVisible &&
        !!videoUrl;

      // Simple dim state: dim when video cannot play, clear when it can
      const isDimmed = !shouldPlayVideo;

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
              if (!videoState.userPaused) {
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
        [player, shouldPlayVideo, togglePlayback, seek, setVideoState, videoState.userPaused]
      );

      // Single effect: auto-resume when (a) overlay blocking is removed, or (b) video becomes visible.
      // Replaces separate prevShouldDisablePlaybackRef/prevIsVisibleRef effects.
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

      // Simplified focus effect - pause on blur, resume on focus if needed
      useFocusEffect(
        useCallback(() => {
          // On focus - do nothing, let visibility control playback

          return () => {
            // On blur - always pause to conserve resources
            if (!videoState.userPaused) {
              togglePlayback(false);
            }
          };
        }, [videoState.userPaused, togglePlayback])
      );

      // Handle player status changes for callbacks only
      useEffect(() => {
        if (!player) return;

        if (playerStatus === 'readyToPlay') {
          onVideoStatus?.(postView.uri, 'loaded');
        } else if (playerStatus === 'loading') {
          onVideoStatus?.(postView.uri, 'loading');
        } else if (playerStatus === 'error') {
          onVideoStatus?.(postView.uri, 'error');
        }
      }, [playerStatus, player, postView.uri, onVideoStatus]);

      // Control playback based on shouldPlayVideo
      // Drive play/pause directly from our own visibility logic, per Expo docs:
      // https://docs.expo.dev/versions/latest/sdk/video/#usage
      // Optimized: Direct calls without requestAnimationFrame wrapper (callbacks are already immediate)
      const prevShouldPlayRef = useRef(shouldPlayVideo);
      useEffect(() => {
        if (!player) return;

        // Only update if state actually changed to avoid unnecessary calls
        if (shouldPlayVideo !== prevShouldPlayRef.current) {
          prevShouldPlayRef.current = shouldPlayVideo;

          // Direct play/pause calls - no RAF wrapper needed since visibility callbacks are immediate
          // expo-video's play/pause are synchronous and optimized
          if (shouldPlayVideo) {
            player.play();
          } else {
            player.pause();
          }
        }
      }, [shouldPlayVideo, player]);

      // Simplified overlay interaction handlers
      const handleLike = useCallback(async () => {
        if (overlayState.isLikePending) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const newIsLiked = !overlayState.isLiked;
        const newLikeCount = newIsLiked ? overlayState.likeCount + 1 : overlayState.likeCount - 1;

        // Optimistic update
        setOverlayState(prev => ({
          ...prev,
          isLikePending: true,
          isLiked: newIsLiked,
          likeCount: newLikeCount,
        }));

        try {
          if (!overlayState.isLiked) {
            const likeUri = await AtprotoService.likePost(postView.uri, postView.cid);
            setOverlayState(prev => ({ ...prev, likeUri }));
            // Persist to store
            updatePostInteraction(postView.uri, {
              isLiked: true,
              likeCount: newLikeCount,
              likeUri,
            });
            // Track interaction
            queueInteraction(INTERACTIONLIKE_CONST);
          } else {
            if (!overlayState.likeUri) throw new Error('No like URI found');
            await AtprotoService.deleteLike(overlayState.likeUri);
            setOverlayState(prev => ({ ...prev, likeUri: undefined }));
            // Persist to store
            updatePostInteraction(postView.uri, {
              isLiked: false,
              likeCount: newLikeCount,
              likeUri: undefined,
            });
          }
        } catch (_error) {
          // Revert optimistic update
          setOverlayState(prev => ({
            ...prev,
            isLiked: !newIsLiked,
            likeCount: overlayState.likeCount,
          }));
        } finally {
          setOverlayState(prev => ({ ...prev, isLikePending: false }));
        }
      }, [
        overlayState.isLikePending,
        overlayState.isLiked,
        overlayState.likeCount,
        overlayState.likeUri,
        postView.uri,
        postView.cid,
        setOverlayState,
        updatePostInteraction,
        queueInteraction,
      ]);

      // Like-only handler for double tap (doesn't unlike)
      const handleLikeOnly = useCallback(async () => {
        // Only like if not already liked and not pending
        if (overlayState.isLiked || overlayState.isLikePending) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const newLikeCount = overlayState.likeCount + 1;

        // Optimistic update
        setOverlayState(prev => ({
          ...prev,
          isLikePending: true,
          isLiked: true,
          likeCount: newLikeCount,
        }));

        try {
          const likeUri = await AtprotoService.likePost(postView.uri, postView.cid);
          setOverlayState(prev => ({ ...prev, likeUri }));
          // Persist to store
          updatePostInteraction(postView.uri, {
            isLiked: true,
            likeCount: newLikeCount,
            likeUri,
          });
          // Track interaction
          queueInteraction(INTERACTIONLIKE_CONST);
        } catch (_error) {
          // Revert optimistic update
          setOverlayState(prev => ({
            ...prev,
            isLiked: false,
            likeCount: prev.likeCount - 1,
          }));
        } finally {
          setOverlayState(prev => ({ ...prev, isLikePending: false }));
        }
      }, [
        overlayState.isLiked,
        overlayState.isLikePending,
        overlayState.likeCount,
        postView.uri,
        postView.cid,
        setOverlayState,
        updatePostInteraction,
        queueInteraction,
      ]);

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

      // Enhanced tap handler with double tap detection
      const handleVideoTap = useCallback(
        (
          event: import('react-native').NativeSyntheticEvent<{
            locationX: number;
            locationY: number;
          }>
        ) => {
          const now = Date.now();
          const x = event.nativeEvent?.locationX ?? cardHeight / 2;
          const y = event.nativeEvent?.locationY ?? cardHeight / 2;

          // Clear any pending single tap
          if (singleTapTimeoutRef.current) {
            clearTimeout(singleTapTimeoutRef.current);
            singleTapTimeoutRef.current = null;
          }

          if (lastTapRef.current) {
            const timeDiff = now - lastTapRef.current.time;
            const xDiff = Math.abs(x - lastTapRef.current.x);
            const yDiff = Math.abs(y - lastTapRef.current.y);

            // Double tap detected (within a tight window and similar position)
            // Use a smaller window than the single-tap delay so playback never toggles on a real double tap
            if (timeDiff < 250 && xDiff < 50 && yDiff < 50) {
              // Always show animation for visual feedback
              animateHeart(x, y);
              // Only like (never unlike) on double tap
              handleLikeOnly();
              lastTapRef.current = null;
              return;
            }
          }

          // Store this tap for potential double tap
          lastTapRef.current = { time: now, x, y };

          // Wait a bit to see if there's a second tap
          singleTapTimeoutRef.current = setTimeout(() => {
            // Single tap - toggle playback
            togglePlayback();
            lastTapRef.current = null;
            singleTapTimeoutRef.current = null;
          }, 260);
        },
        [togglePlayback, cardHeight, handleLikeOnly, animateHeart]
      );

      // Handle long press to show comments
      const handleLongPress = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Clear any pending single tap
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current);
          singleTapTimeoutRef.current = null;
        }
        // Clear double tap tracking
        lastTapRef.current = null;

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
          totalLikes: overlayState.likeCount,
          totalComments: postView.replyCount || 0,
          isLiked: overlayState.isLiked,
          postedAt: (postView.record as { createdAt?: string })?.createdAt || postView.indexedAt,
          onToggleLike: handleLike,
          isLikePending: overlayState.isLikePending,
        });
      }, [
        overlayState.likeCount,
        overlayState.isLiked,
        overlayState.isLikePending,
        presentCommentSection,
        handleLike,
        postView.author,
        postView.cid,
        postView.record,
        postView.replyCount,
        postView.uri,
        postView.indexedAt,
        queueInteraction,
      ]);

      // Cleanup timeout on unmount
      useEffect(() => {
        return () => {
          if (singleTapTimeoutRef.current) {
            clearTimeout(singleTapTimeoutRef.current);
          }
        };
      }, []);

      const handleRepost = useCallback(async () => {
        if (overlayState.isRepostPending) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const newIsReposted = !overlayState.isReposted;
        const newRepostCount = newIsReposted
          ? overlayState.repostCount + 1
          : overlayState.repostCount - 1;

        // Optimistic update
        setOverlayState(prev => ({
          ...prev,
          isRepostPending: true,
          isReposted: newIsReposted,
          repostCount: newRepostCount,
        }));

        try {
          if (!overlayState.isReposted) {
            const repostUri = await AtprotoService.repostPost(postView.uri, postView.cid);
            setOverlayState(prev => ({ ...prev, repostUri }));
            // Persist to store
            updatePostInteraction(postView.uri, {
              isReposted: true,
              repostCount: newRepostCount,
              repostUri,
            });
            // Track interaction
            queueInteraction(INTERACTIONREPOST_CONST);
          } else {
            if (!overlayState.repostUri) throw new Error('No repost URI found');
            await AtprotoService.deleteRepost(overlayState.repostUri);
            setOverlayState(prev => ({ ...prev, repostUri: undefined }));
            // Persist to store
            updatePostInteraction(postView.uri, {
              isReposted: false,
              repostCount: newRepostCount,
              repostUri: undefined,
            });
          }
        } catch (_error) {
          // Revert optimistic update
          setOverlayState(prev => ({
            ...prev,
            isReposted: !newIsReposted,
            repostCount: overlayState.repostCount,
          }));
        } finally {
          setOverlayState(prev => ({ ...prev, isRepostPending: false }));
        }
      }, [
        overlayState.isRepostPending,
        overlayState.isReposted,
        overlayState.repostCount,
        overlayState.repostUri,
        postView.uri,
        postView.cid,
        setOverlayState,
        updatePostInteraction,
        queueInteraction,
      ]);

      const navigation = useRouter();

      const handleChannelPress = useCallback(() => {
        if (channelUri) {
          const encodedUri = encodeURIComponent(channelUri);
          navigation.navigate(`/channel/${encodedUri}`);
        }
      }, [channelUri, navigation]);

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
            FeedService.sendFeedInteractions(interactionsToSend).catch(() => {});
          }
        };
      }, []);

      // Reset seen interaction flag when post changes
      useEffect(() => {
        seenInteractionSentRef.current = false;
      }, [postView.uri]);

      // Video Status Reporting - use post URI for simple tracking
      useEffect(() => {
        if (shouldPlayVideo) {
          onVideoStatus?.(postView.uri, 'playing');
        } else {
          onVideoStatus?.(postView.uri, 'paused');
        }
      }, [shouldPlayVideo, postView.uri, onVideoStatus]);

      const seekingAnimationSV = useSharedValue(0);
      const overlayVisibility = useOverlayVisibility();
      const feedScroll = useFeedScroll();
      const scrollOffsetYSV = feedScroll?.scrollOffsetYSV;
      const headerH = feedScroll?.headerHeight ?? 0;
      const viewportH = feedScroll?.viewportHeight ?? 0;
      const itemSp = feedScroll?.itemSpacing ?? 0;
      const idx = index ?? 0;
      const uiOverlayOpacitySV = useDerivedValue(() => {
        'worklet';
        const scrubbing = interpolate(seekingAnimationSV.value, [0, 0.2, 1], [1, 0, 0], 'clamp');
        let p: number;
        if (!scrollOffsetYSV) {
          p = 1;
        } else {
          const scrollY = scrollOffsetYSV.value;
          const itemTop = headerH + idx * itemSp;
          const itemBottom = itemTop + cardHeight;
          const viewportBottom = scrollY + viewportH;
          const overlap = Math.max(
            0,
            Math.min(itemBottom, viewportBottom) - Math.max(itemTop, scrollY)
          );
          const raw = cardHeight > 0 ? Math.min(1, Math.max(0, overlap / cardHeight)) : 1;
          if (raw >= OVERLAY_DEAD_ZONE) {
            p = 1;
          } else {
            p = Math.pow(raw / OVERLAY_DEAD_ZONE, OVERLAY_FADE_EXPONENT);
          }
        }
        return overlayVisibility.value * p * scrubbing;
      }, [scrollOffsetYSV, headerH, viewportH, itemSp, idx, cardHeight]);

      return (
        <View style={[styles.container, { height: cardHeight }]}>
          <BlurredBackground
            thumbnailUrl={cannotShowMedia ? null : (posterUrl ?? null)}
            onBlurReady={handleBlurReady}
          />
          <Pressable
            onPress={handleVideoTap}
            onLongPress={handleLongPress}
            delayLongPress={400}
            style={styles.videoContainerPressable}
          >
            <View style={styles.videoContainer}>
              {!!posterUrl && !cannotShowMedia && (!firstFrameRendered || !blurReady) && (
                <Image
                  source={{ uri: posterUrl }}
                  contentFit="contain"
                  style={styles.poster}
                  recyclingKey={recyclingKey}
                />
              )}

              {!!videoSource && !cannotShowMedia && !isBlurred && player && (
                <ExpoVideoView
                  player={player}
                  style={styles.videoPlayer}
                  contentFit="contain"
                  nativeControls={false}
                  playsInline
                  surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
                  allowsVideoFrameAnalysis={false}
                  onFirstFrameRender={handleFirstFrameRender}
                />
              )}

              {/* Buffering indicator removed per request */}

              {/* Loading indicator only shown when needed */}
              {!shouldLoadVideo && !cannotShowMedia && !isBlurred && (
                <View style={styles.loadingOverlay}>
                  <Loading3FillIcon size={48} color="white" />
                  <Text style={styles.loadingText}>No HLS stream available</Text>
                </View>
              )}

              {/* Simple dimming overlay - only rendered when video cannot play */}
              {isDimmed && <View style={styles.dimmingOverlay} pointerEvents="none" />}

              {/* Double tap heart animation */}
              <Animated.View
                style={[styles.heartAnimationContainer, heartAnimatedStyle]}
                pointerEvents="none"
              >
                <HeartFillIcon size={100} color={Colors.coral[500]} />
              </Animated.View>

              {/* Integrated Overlay System using VideoOverlayUI */}
              {/* Keep overlay mounted to prevent jank when switching videos */}
              {showOverlay && (
                <VideoOverlayUI
                  post={postView}
                  isVisible={isVisible}
                  isModal={isModal}
                  overlayOpacitySV={uiOverlayOpacitySV}
                  feedOption={feedOption as 'following' | 'discover' | undefined}
                  onLike={handleLike}
                  onRepost={handleRepost}
                  onShareInteraction={() => queueInteraction(INTERACTIONSHARE_CONST)}
                  isLiked={overlayState.isLiked}
                  isReposted={overlayState.isReposted}
                  likeCount={overlayState.likeCount}
                  repostCount={overlayState.repostCount}
                  isLikePending={overlayState.isLikePending}
                  isRepostPending={overlayState.isRepostPending}
                  isFollowing={isFollowing}
                  hasProfile={hasProfile}
                  channelSlug={channelSlug}
                  onChannelPress={handleChannelPress}
                  authorProfileOverlay={authorProfileOverlay}
                />
              )}

              {/* Video Scrubber - iOS only, overlays video above bottom bar */}
              {Platform.OS === 'ios' && (
                <VideoScrubber
                  active={isVisible && !hasError}
                  player={player}
                  seekingAnimationSV={seekingAnimationSV}
                  overlayOpacitySV={uiOverlayOpacitySV}
                />
              )}
            </View>
          </Pressable>

          {(cannotShowMedia || isBlurred) && (
            <>
              <BlurView intensity={100} tint="dark" style={styles.contentWarningBlur} />
              <View style={styles.contentWarningOverlay}>
                <View style={styles.blurMessage}>
                  <Text style={styles.blurTitle}>
                    {cannotShowMedia ? 'Content blocked' : 'Sensitive Content'}
                  </Text>
                  <Text style={styles.blurText}>
                    {cannotShowMedia
                      ? 'This content is hidden by your safety settings'
                      : warningDescription}
                  </Text>
                </View>
                {isBlurred && (
                  <Pressable onPress={handleViewContent} style={styles.viewButton}>
                    {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
                      <GlassView
                        style={styles.glassBackground}
                        glassEffectStyle="clear"
                        tintColor="rgba(255, 255, 255, 1)"
                        isInteractive
                      />
                    ) : null}
                    <View style={styles.buttonContent} pointerEvents="none">
                      <Text style={styles.viewButtonText}>See video</Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      );
    }
  )
);

// Styles
const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.black, // Fallback background color
  },
  videoContainerPressable: {
    width: '100%',
    height: '100%',
    position: 'relative',
    zIndex: 1,
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  poster: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },

  loadingText: {
    color: Colors.neutral[50],
    marginTop: 10,
    fontSize: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: hexToRGBA(Colors.black, 0.7),
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  contentWarningBlur: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
  },
  contentWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    paddingBottom: 60,
  },
  blurMessage: {
    width: '90%',
    maxWidth: 400,
    padding: 24,
    alignItems: 'center',
  },
  blurTitle: {
    fontSize: 20,
    fontFamily: 'Figtree-Bold',
    color: Colors.neutral[50],
    marginBottom: 12,
    textAlign: 'center',
  },
  blurText: {
    fontSize: 15,
    fontFamily: 'Figtree-Regular',
    color: Colors.neutral[200],
    textAlign: 'center',
    lineHeight: 22,
  },
  viewButton: {
    position: 'absolute',
    bottom: 80,
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.FULL,
    overflow: 'hidden',
    minWidth: 120,
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  buttonContent: {
    position: 'relative',
    zIndex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontFamily: 'Figtree-SemiBold',
    fontWeight: '600',
  },
  dimmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: hexToRGBA(Colors.black, 0.4),
    zIndex: 5,
    pointerEvents: 'none', // Allow touch events to pass through when not dimmed
  },
  heartAnimationContainer: {
    position: 'absolute',
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
});

export default VideoCard;
