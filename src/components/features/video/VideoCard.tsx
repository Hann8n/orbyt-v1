import React, {
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useRecyclingState } from '@shopify/flash-list';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView as ExpoVideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';

import { AtprotoFeedService } from '../../../services/api/feed/FeedService';
import {
  View,
  Text,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
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
import { HeartFillIcon } from '../../ui/Icon';
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
import { useProfileChannelNavigation } from '../../../hooks/useProfileChannelNavigation';
import {
  mergePostInteractionDelta,
  usePostInteractionStore,
} from '../../../stores/postInteractionStore';
import { useProfile } from '../../../services/data/ProfileService';
import { getProfileColors } from '../../../utils/formatting/colors';
import { getChannelBySlug } from '../../../utils/channels/orbyt';
import { VideoScrubber } from './VideoScrubber';
import { useFeedScroll } from '../../../context/FeedScrollContext';
import { seenVideoService } from '../../../services/SeenVideoService';
import { hexToRGBA } from '../../../utils/formatting/colors';
import { useFollowStore } from '../../../stores/followStore';
import { useUserStore } from '../../../stores/userStore';
import { useShallow } from 'zustand/react/shallow';
import { ErrorHandler } from '../../../utils/errors/errorHandler';
import { useLikeInteraction } from '@/hooks/useLikeInteraction';
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

/** Label keys that have i18n translations (video.contentWarningLabels.*) */
const CONTENT_WARNING_LABEL_KEYS = [
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
  'gore',
  'self-harm',
  'sensitive',
  'extremist',
  'intolerance',
  'threats',
  'rude',
  'illicit',
  'security-concerns',
  'unsafe-link',
  'impersonation',
  'misinformation',
  'scam',
  'engagement-farming',
  'spam',
  'unconfirmed',
  'misleading',
  'inauthentic-account',
  'sexually-suggestive-cartoon',
] as const;

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
        index,
      },
      ref
    ) => {
      const { t } = useTranslation();
      // Access feedContext and reqId from feedItem (native properties from FeedViewPost)
      const feedContext = feedItem?.feedContext;
      const reqId = feedItem?.reqId;
      const { algorithmicFeedProvider } = useUserStore(
        useShallow(state => ({ algorithmicFeedProvider: state.algorithmicFeedProvider }))
      );
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
      const postView: ExtendedPostView = React.useMemo(() => {
        return normalizePostView(post);
      }, [post]);

      // Subscribe only to this post's interaction so other cards don't re-render on like/repost
      const defaultInteraction = React.useMemo(
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
      }, [persistedInteraction, overlayState]);

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

      // Keep a ref in sync with userPaused so useFocusEffect doesn't re-register on every pause toggle.
      const userPausedRef = useRef(videoState.userPaused);
      userPausedRef.current = videoState.userPaused;

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
        const fallback = t('video.contentWarningFallback');
        if (!reason) return fallback;

        // Parse labels from reason (can be comma-separated)
        const labels = reason
          .split(',')
          .map((l: string) => l.trim())
          .filter((l: string) => !WARNING_HIDDEN_LABELS.includes(l));

        if (labels.length === 0) return fallback;

        const getLabelMessage = (label: string): string => {
          const key = `video.contentWarningLabels.${label}`;
          const translated = t(key);
          if (translated !== key) return translated;
          const lowerLabel = label.toLowerCase();
          const matchedKey = CONTENT_WARNING_LABEL_KEYS.find(k => k.toLowerCase() === lowerLabel);
          if (matchedKey) return t(`video.contentWarningLabels.${matchedKey}`);
          return label
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .toLowerCase();
        };

        const messages = labels
          .map((label: string) => getLabelMessage(label))
          .filter((msg: string) => msg.length > 0);

        if (messages.length === 0) return fallback;

        const andConjunction = t('video.contentWarningAnd');

        // Special case: inauthentic account uses different sentence structure
        if (
          labels.some(l => l === 'inauthentic-account' || l.toLowerCase() === 'inauthentic-account')
        ) {
          return t('video.contentWarningInauthentic');
        }

        const formattedMessage =
          messages.length > 1
            ? messages.slice(0, -1).join(', ') + andConjunction + messages[messages.length - 1]
            : messages[0];

        return t('video.contentWarningMayContain', { labels: formattedMessage });
      }, [reason, t]);

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

      // Text-expanded dim state is driven fully by Reanimated shared values to avoid re-rendering
      // VideoCard when the overlay text is expanded/collapsed.
      const textDimActiveSV = useSharedValue(0);
      const textDimOpacitySV = useSharedValue(0);

      useEffect(() => {
        // Reset dim state when post changes (FlashList recycle safety)

        textDimActiveSV.value = 0;

        textDimOpacitySV.value = 0;
      }, [postView.uri, textDimActiveSV, textDimOpacitySV]);

      const handleOverlayCollapsedChange = useCallback(
        (isCollapsed: boolean) => {
          const isExpanded = !isCollapsed;

          textDimActiveSV.value = isExpanded ? 1 : 0;

          textDimOpacitySV.value = withTiming(isExpanded ? 0.65 : 0, { duration: 120 });
        },
        [textDimActiveSV, textDimOpacitySV]
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

      // On foreground: reset error retry gate so a stale-session error can be recovered,
      // and nudge the player if it may have stalled while backgrounded.
      useEffect(() => {
        const sub = AppState.addEventListener('change', nextState => {
          if (nextState === 'active') {
            // Allow retry to fire again after backgrounding
            errorRetriedForUriRef.current = null;
            // Guard: only nudge when this card should actually be playing.
            // isVisible = "viewable row in its feed" — true even for inactive tabs/pager pages.
            // shouldDisablePlayback captures isActiveFeed && canPlay, so we need all three.
            if (isVisible && !videoState.userPaused && !shouldDisablePlayback) {
              if (playerStatus === 'error') {
                // existing retry path handles re-fetch + replaceAsync
                return;
              }
              // Player may be alive but stalled — nudge it
              player.play();
            }
          }
        });
        return () => sub.remove();
      }, [isVisible, videoState.userPaused, shouldDisablePlayback, playerStatus, player]);

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

      const { toggleLike: toggleLikeInteraction, likeOnly: likeOnlyInteraction } =
        useLikeInteraction({
          state: likeStateForHook,
          setState: setOverlayState,
          postUri: postView.uri,
          postCid: postView.cid,
          updatePostInteraction,
          onLikeSuccess: () => queueInteraction(INTERACTIONLIKE_CONST),
        });

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
          totalLikes: displayInteraction.likeCount,
          totalComments: displayInteraction.commentCount,
          isLiked: displayInteraction.isLiked,
          postedAt: (postView.record as { createdAt?: string })?.createdAt || postView.indexedAt,
          onToggleLike: handleLike,
          isLikePending: overlayState.isLikePending,
        });
      }, [
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

      // Video Status Reporting - use post URI for simple tracking
      useEffect(() => {
        if (shouldPlayVideo) {
          onVideoStatus?.(postView.uri, 'playing');
        } else {
          onVideoStatus?.(postView.uri, 'paused');
        }
      }, [shouldPlayVideo, postView.uri, onVideoStatus]);

      const seekingAnimationSV = useSharedValue(0);
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
          // When cardHeight > viewport (e.g. legacy liquid-glass list: getVideoCardHeight uses full
          // window height while FeedScroll viewportHeight excludes top inset + tab bar), overlap/cardHeight
          // never reaches OVERLAY_DEAD_ZONE — scrubber + overlay stay faded. Normalize by the smaller span.
          const visDenom =
            viewportH > 0 && cardHeight > 0 ? Math.min(cardHeight, viewportH) : cardHeight;
          const raw = visDenom > 0 ? Math.min(1, Math.max(0, overlap / visDenom)) : 1;
          if (raw >= OVERLAY_DEAD_ZONE) {
            p = 1;
          } else {
            p = Math.pow(raw / OVERLAY_DEAD_ZONE, OVERLAY_FADE_EXPONENT);
          }
        }
        return p * scrubbing;
      }, [scrollOffsetYSV, headerH, viewportH, itemSp, idx, cardHeight]);

      return (
        <View style={[styles.container, { height: cardHeight }]}>
          <BlurredBackground
            thumbnailUrl={cannotShowMedia ? null : (posterUrl ?? null)}
            onBlurReady={handleBlurReady}
          />
          <NativePressable
            onPress={handleVideoTap}
            onLongPress={handleLongPress}
            delayLongPress={400}
            style={styles.videoContainerPressable}
            activeOpacity={1}
            android_ripple={{ color: hexToRGBA(Colors.black, 0), borderless: true }}
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
                  <ActivityIndicator size="large" color={Colors.neutral[50]} />
                  <Text style={styles.loadingText}>{t('video.noHlsStream')}</Text>
                </View>
              )}

              {/* Text expanded dimming overlay */}
              <Animated.View
                style={[styles.textExpandedDimmingOverlay, textDimAnimatedStyle]}
                pointerEvents="none"
              />

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
                  overlayOpacitySV={uiOverlayOpacitySV}
                  sourceFeed={resolvedFeedUri}
                  onOverlayCollapsedChange={handleOverlayCollapsedChange}
                  onLike={handleLike}
                  onRepost={handleRepost}
                  onShareInteraction={handleShareInteraction}
                  isLiked={displayInteraction.isLiked}
                  isReposted={displayInteraction.isReposted}
                  likeCount={displayInteraction.likeCount}
                  commentCount={displayInteraction.commentCount}
                  repostCount={displayInteraction.repostCount}
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
                  playerStatus={playerStatus}
                  seekingAnimationSV={seekingAnimationSV}
                  overlayOpacitySV={uiOverlayOpacitySV}
                />
              )}
            </View>
          </NativePressable>

          {(cannotShowMedia || isBlurred) && (
            <>
              <BlurView intensity={100} tint="dark" style={styles.contentWarningBlur} />
              <View style={styles.contentWarningOverlay}>
                <View style={styles.blurMessage}>
                  <Text style={styles.blurTitle}>
                    {cannotShowMedia ? t('video.contentBlocked') : t('video.sensitiveContent')}
                  </Text>
                  <Text style={styles.blurText}>
                    {cannotShowMedia ? t('video.contentHiddenBySafety') : warningDescription}
                  </Text>
                </View>
                {isBlurred && (
                  <NativePressable onPress={handleViewContent} style={styles.viewButton}>
                    {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
                      <GlassView
                        style={styles.glassBackground}
                        glassEffectStyle="clear"
                        tintColor={Colors.neutral[50]}
                        isInteractive
                      />
                    ) : null}
                    <View style={styles.buttonContent} pointerEvents="none">
                      <Text style={styles.viewButtonText}>{t('video.seeVideo')}</Text>
                    </View>
                  </NativePressable>
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
  textExpandedDimmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
    zIndex: 5,
    pointerEvents: 'none',
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
