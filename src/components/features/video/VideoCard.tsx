import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
  memo,
} from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView as ExpoVideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';

import { BORDER_RADIUS } from '../../../utils/constants';
import { AtprotoService } from '../../../services/api/AtprotoService';
import {
  View,
  Text,
  Dimensions,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, Easing } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../ui/UI';
import { Loading3FillIcon, HeartFillIcon } from '../../ui/Icon';
import BlurredThumbnailBackground from '../../ui/BlurredThumbnailBackground';
import { extractVideoUrl, extractVideoThumbnail, createVideoSource } from '../../../utils/helpers/video';
import VideoOverlayUI from './VideoOverlayUI';
import { useFocusEffect } from 'expo-router';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { usePostInteractionStore } from '../../../stores/postInteractionStore';
import { useProfile } from '../../../services/cache/ProfileCache';
import { getChannelBySlug } from '../../../utils/orbytChannels';
import { VideoScrubber } from './VideoScrubber';
import { logger } from '../../../utils/logger';
import type { ExtendedPostView, ExtendedFeedViewPost, VideoView } from '../../../services/api/types';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import { isVideoEmbed } from '../../../services/api/types';

// Use proper API types - normalize to always work with ExtendedPostView
type Post = ExtendedPostView | ExtendedFeedViewPost;

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
  isVisible: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  shouldDisablePlayback?: boolean;
  isPlaying?: boolean;
  moderationDecision?: ModerationDecision;
  // Overlay props
  showOverlay?: boolean;
  feedOption?: string;
  sourceFeed?: string;
  isModal?: boolean;

}

const VideoCard = memo(forwardRef<VideoCardRef, VideoCardProps>(
  ({ 
    post, 
    isVisible, 
    onVideoStatus, 
    height, 
    moderationDecision, 
    shouldDisablePlayback = false, 
    showOverlay = true,
    feedOption,
    sourceFeed,
    isModal = false,

  }, ref) => {
    const { presentCommentSection } = useGlobalCommentSection();
    const { updatePostInteraction, getPostInteraction } = usePostInteractionStore();
    
    // Normalize post - extract ExtendedPostView from ExtendedFeedViewPost if needed
    const postView: ExtendedPostView = React.useMemo(() => {
      return 'post' in post ? post.post : post;
    }, [post]);
    
    // Enhanced video state management with automatic recycling
    // Scope by post URI + feedOption so playback state doesn't leak across different feeds
    // Only track userPaused - derive hasError directly from playerStatus to avoid duplication
    const [videoState, setVideoState] = useRecyclingState({
      userPaused: false,
    }, [postView.uri, feedOption]); // Auto-resets when post.uri or feed context changes

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
    const [overlayState, setOverlayState] = useRecyclingState({
      isLikePending: false,
      isRepostPending: false,
      ...persistedInteraction,
    }, [postView.uri, feedOption]); // Auto-resets when post.uri or feed context changes

    // Lightweight follow state per post, hoisted out of overlay
    const { data: cachedProfile } = useProfile(postView.author?.handle);
    const isFollowing = cachedProfile?.isFollowing ?? false;
    const hasProfile = !!cachedProfile;

    // Extract channel slug from post tags - simple match, no lookups
    const channelSlug = React.useMemo(() => {
      const record = postView.record as { tags?: string[] };
      const tags = record?.tags || [];
      if (!Array.isArray(tags) || tags.length === 0) {
        return null;
      }
      const channelTag = tags.find((tag: string) => 
        typeof tag === 'string' && tag.startsWith('orbyt-channel-')
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

    // Get video URL and thumbnail using shared utilities
    const videoUrl = extractVideoUrl(postView.embed);
    const posterUrl = extractVideoThumbnail(postView.embed);
    
    // Track dimensions
    const { width, height: screenHeight } = Dimensions.get('window');
    // Use provided height or calculate based on 9:16 aspect ratio if post has aspectRatio
    const embed = postView.embed;
    const videoEmbed = embed && isVideoEmbed(embed) ? embed as VideoView : null;
    const postAspectRatio = videoEmbed?.aspectRatio;
    const defaultAspectRatio = postAspectRatio ? postAspectRatio.width / postAspectRatio.height : 16/9;
    const cardHeight = height || width * defaultAspectRatio;

    // HLS-only source creation
    const videoSource = createVideoSource(videoUrl);
    
    // Create expo-video player with setup callback
    const player = useVideoPlayer(videoSource, (player) => {
      player.loop = true;
      player.muted = false;
      player.timeUpdateEventInterval = 0; // Explicit: no progress updates (overlay has no progress bar)
    });
    
    // Listen to player status changes using expo's useEvent hook
    const { status: playerStatus } = useEvent(player, 'statusChange', { status: player?.status ?? 'idle' });
    
    // Derive error state directly from playerStatus (no need to duplicate in state)
    const hasError = playerStatus === 'error';

    // Simplified content warning state
    const [userChoseToView, setUserChoseToView] = useState(false);
    
    // Get moderation decision and derive all blur states in one place
    // Support both ExtendedPostView and ExtendedFeedViewPost  
    const decision: ModerationDecision | undefined = moderationDecision || 
      ('moderationDecision' in post && post.moderationDecision && typeof post.moderationDecision === 'object' && 'blur' in post.moderationDecision 
        ? post.moderationDecision as ModerationDecision 
        : undefined);
    const shouldBlur = decision?.blur || false;
    const shouldShowContent = !shouldBlur || userChoseToView;
    const isBlurred = shouldBlur && !shouldShowContent;
    const hasWarning = shouldBlur;
    const reason = decision?.reason;
    
    // Format warning labels for display
    const getWarningDescription = useCallback(() => {
      if (!reason) {
        return 'This video may contain sensitive content';
      }
      // Split comma-separated labels, remove "content" from each label, and join with "&"
      const labels = reason.split(',').map((l: string) => {
        // Remove "content" or "Content" from the end of each label
        return l.trim().replace(/\s+[Cc]ontent\s*$/, '').trim();
      });
      const formattedLabels = labels.length > 1 
        ? labels.slice(0, -1).join(', ') + ' & ' + labels[labels.length - 1]
        : labels[0];
      // Convert to lowercase but preserve NSFW in uppercase
      const labelLower = formattedLabels.toLowerCase().replace(/nsfw/g, 'NSFW');
      return `This video may contain ${labelLower} content`;
    }, [reason]);
    
    // Handle user choosing to view content
    const handleViewContent = useCallback(() => {
      setUserChoseToView(true);
    }, []);
    
    // Only reset userChoseToView when post changes - videoState is handled by useRecyclingState
    useEffect(() => {
      setUserChoseToView(false);
      // No need to reset videoState - handled automatically by useRecyclingState
    }, [postView.uri]);

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
    const shouldPlayVideo = !shouldDisablePlayback && 
                           !hasError && 
                           !videoState.userPaused &&
                           !(hasWarning && !shouldShowContent) &&
                           isVisible && // Use visibility instead of external shouldPlay prop
                           !!videoUrl;

    // Simple dim state: dim when video cannot play, clear when it can
    const isDimmed = !shouldPlayVideo;

    const shouldLoadVideo = !(hasWarning && !shouldShowContent) && !!videoSource;

    // Simplified video playback control functions
    const togglePlayback = useCallback((shouldPlay?: boolean) => {
      // Block interaction when content should remain hidden or playback is disabled
      if ((hasWarning && !shouldShowContent) || shouldDisablePlayback) {
        return;
      }

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
    }, [hasWarning, shouldShowContent, shouldDisablePlayback, hasError, setVideoState]);

    // togglePlayback handles all play/pause logic directly

    const seek = useCallback((position: number) => {
      if (player) {
        // expo-video uses seconds, convert from ms if needed
        const positionInSeconds = position > 1000 ? position / 1000 : position;
        player.currentTime = positionInSeconds;
      }
    }, [player]);

    // Expose functions via ref
    useImperativeHandle(ref, () => ({
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
    }), [player, shouldPlayVideo, togglePlayback, seek]);

    // Track previous shouldDisablePlayback to detect when overlay blocking is removed
    const prevShouldDisablePlaybackRef = useRef(shouldDisablePlayback);
    // Track previous visibility to detect when video becomes visible
    const prevIsVisibleRef = useRef(isVisible);
    
    // Auto-resume when playback is re-enabled (e.g., overlay is removed)
    // This ensures videos resume automatically when overlay blocking is removed
    useEffect(() => {
      const wasBlocked = prevShouldDisablePlaybackRef.current;
      const isNowUnblocked = !shouldDisablePlayback && wasBlocked;
      
      // When overlay blocking is removed and video should be visible, ensure it can resume
      if (isNowUnblocked && isVisible && !hasError) {
        // Clear userPaused to allow video to resume
        // This handles the case where overlay blocked playback and is now removed
        if (videoState.userPaused) {
          setVideoState(prev => ({ ...prev, userPaused: false }));
        }
      }
      
      prevShouldDisablePlaybackRef.current = shouldDisablePlayback;
    }, [shouldDisablePlayback, isVisible, hasError, videoState.userPaused, setVideoState]);

    // Auto-resume when video becomes visible (e.g., scrolling to next video after returning to a feed)
    // This fixes the issue where the next video doesn't autoplay after returning to a feed,
    // while still allowing manual pause to work correctly.
    useEffect(() => {
      const wasVisible = prevIsVisibleRef.current;
      const becameVisible = !wasVisible && isVisible;

      // When video becomes visible and can play, clear userPaused to allow autoplay
      // This handles the case where userPaused was set due to screen blur or backgrounding.
      if (becameVisible && !shouldDisablePlayback && !hasError && videoState.userPaused) {
        setVideoState(prev => ({ ...prev, userPaused: false }));
      }
      
      prevIsVisibleRef.current = isVisible;
    }, [isVisible, shouldDisablePlayback, hasError, videoState.userPaused, setVideoState]);

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
    useEffect(() => {
      if (!player) return;

      if (shouldPlayVideo) {
        player.play();
      } else {
        player.pause();
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
        likeCount: newLikeCount
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
      } catch (error) {
        logger.error('Like action failed', error, { component: 'VideoCard', action: 'handleLike' });
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isLiked: !newIsLiked,
          likeCount: overlayState.likeCount
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isLikePending: false }));
      }
    }, [overlayState.isLikePending, overlayState.isLiked, overlayState.likeCount, overlayState.likeUri, postView.uri, postView.cid, setOverlayState, updatePostInteraction]);

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
        likeCount: newLikeCount
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
      } catch (error) {
        logger.error('Like action failed', error, { component: 'VideoCard', action: 'handleLike' });
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isLiked: false,
          likeCount: prev.likeCount - 1
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isLikePending: false }));
      }
    }, [overlayState.isLiked, overlayState.isLikePending, overlayState.likeCount, postView.uri, postView.cid, setOverlayState, updatePostInteraction]);

    // Double tap to like animation - runs on UI thread with Reanimated
    // Heartbeat pattern: quick beat, slight dip, second beat, then fade out
    const animateHeart = useCallback((x: number, y: number) => {
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
        withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        }, () => {
          // Reset values after animation completes
          heartScale.value = 0;
        })
      );
    }, [heartScale, heartOpacity, heartPositionX, heartPositionY]);

    // Enhanced tap handler with double tap detection
    const handleVideoTap = useCallback((event: import('react-native').NativeSyntheticEvent<{ locationX: number; locationY: number }>) => {
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
    }, [togglePlayback, cardHeight, handleLikeOnly, animateHeart]);

    // Handle long press to show comments
    const handleLongPress = useCallback(() => {
      // Clear any pending single tap
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      // Clear double tap tracking
      lastTapRef.current = null;
      
      // Show comment section
      presentCommentSection({
        post,
        totalLikes: overlayState.likeCount,
        totalComments: postView.replyCount || 0,
        isLiked: overlayState.isLiked,
        postedAt: (postView.record as { createdAt?: string })?.createdAt || postView.indexedAt,
        onToggleLike: handleLike,
        isLikePending: overlayState.isLikePending,
      });
    }, [post, overlayState.likeCount, overlayState.isLiked, overlayState.isLikePending, presentCommentSection, handleLike]);

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
      const newRepostCount = newIsReposted ? overlayState.repostCount + 1 : overlayState.repostCount - 1;
      
      // Optimistic update
      setOverlayState(prev => ({
        ...prev,
        isRepostPending: true,
        isReposted: newIsReposted,
        repostCount: newRepostCount
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
      } catch (error) {
        logger.error('Repost action failed', error, { component: 'VideoCard', action: 'handleRepost' });
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isReposted: !newIsReposted,
          repostCount: overlayState.repostCount
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isRepostPending: false }));
      }
    }, [overlayState.isRepostPending, overlayState.isReposted, overlayState.repostCount, overlayState.repostUri, postView.uri, postView.cid, setOverlayState, updatePostInteraction]);

    const navigation = useRouter();
    
    const handleSourcePress = useCallback(() => {
      if (sourceFeed && sourceFeed.startsWith('at://')) {
        // Navigate to channel page
        const encodedUri = encodeURIComponent(sourceFeed);
        navigation.push(`/channel/${encodedUri}`);
      }
    }, [sourceFeed, navigation]);

    const handleChannelPress = useCallback(() => {
      if (channelUri) {
        const encodedUri = encodeURIComponent(channelUri);
        navigation.push(`/channel/${encodedUri}`);
      }
    }, [channelUri, navigation]);

    // Video Status Reporting - use post URI for simple tracking
    useEffect(() => {
      if (shouldPlayVideo) {
        onVideoStatus?.(postView.uri, 'playing');
      } else {
        onVideoStatus?.(postView.uri, 'paused');
      }
    }, [shouldPlayVideo, postView.uri, onVideoStatus]);

    // Scrubber for iOS only - overlays the video
    const seekingAnimationSV = useSharedValue(0);

    return (
      <View style={[styles.container, { height: cardHeight }]}>
        {/* Blurred thumbnail background - iOS only (expensive on Android) */}
        {Platform.OS === 'ios' && <BlurredThumbnailBackground thumbnailUrl={posterUrl} />}
        {/* Unified Video and Overlay Container */}
        <Pressable 
          onPress={handleVideoTap} 
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={styles.videoContainerPressable}
        >
          <View style={styles.videoContainer}>
            {/* Sharp poster layer - always present so there's no flashing; video renders over it */}
            {!!posterUrl && (
              <Image
                source={{ uri: posterUrl }}
                contentFit="contain"
                style={styles.poster}
              />
            )}

            {/* Video Player - expo-video VideoView */}
            {/* Always render VideoView when source is available (no content warning) to start loading earlier for faster playback */}
            {!!videoSource && !(hasWarning && !shouldShowContent) && player && (
              <ExpoVideoView
                player={player}
                style={styles.videoPlayer}
                contentFit="contain"
                nativeControls={false}
                playsInline
                surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
              />
            )}
            
            {/* Buffering indicator removed per request */}
            
            {/* Loading indicator only shown when needed */}
            {!shouldLoadVideo && !isBlurred && (
              <View style={styles.loadingOverlay}>
                <Loading3FillIcon size={48} color="white" />
                <Text style={styles.loadingText}>No HLS stream available</Text>
              </View>
            )}

            {/* Static shadow gradient - always rendered to prevent flashing */}
            <View style={[styles.shadowGradient, { height: screenHeight * 0.8 }]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0.2)', 'rgba(0, 0, 0, 0.05)', 'transparent']}
                locations={[0, 0.4, 0.6, 1]}
                style={{ flex: 1 }}
                pointerEvents="none"
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
              />
            </View>

            {/* Simple dimming overlay - only rendered when video cannot play */}
            {isDimmed && (
              <View
                style={styles.dimmingOverlay}
                pointerEvents="none"
              />
            )}

            {/* Double tap heart animation - using Reanimated for UI thread */}
            <Animated.View
              style={[
                styles.heartAnimationContainer,
                heartAnimatedStyle,
              ]}
              pointerEvents="none"
            >
              <HeartFillIcon size={100} color={Colors.INTERACTIVE.HEART.ACTIVE} />
            </Animated.View>

            {/* Integrated Overlay System using VideoOverlayUI */}
            {/* Keep overlay mounted to prevent jank when switching videos */}
            {showOverlay && (
              <VideoOverlayUI
                post={postView}
                isVisible={isVisible}
                isModal={isModal}
                feedOption={feedOption}
                sourceFeed={sourceFeed}
                onLike={handleLike}
                onRepost={handleRepost}
                onSourcePress={handleSourcePress}
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
                seekingAnimationSV={seekingAnimationSV}
              />
            )}

            {/* Video Scrubber - iOS only, overlays video above bottom bar */}
            {Platform.OS === 'ios' && (
              <VideoScrubber
                active={isVisible && !hasError}
                player={player}
                seekingAnimationSV={seekingAnimationSV}
                isVisible={isVisible}
              />
            )}
          </View>
        </Pressable>
        
        {/* Content Warning Overlay - blur with message */}
        {isBlurred && (
          <>
            <BlurView intensity={100} tint="dark" style={styles.contentWarningBlur} experimentalBlurMethod="dimezisBlurView" />
            <View style={styles.contentWarningOverlay}>
              <View style={styles.blurMessage}>
                <Text style={styles.blurTitle}>Sensitive Content</Text>
                <Text style={styles.blurText}>
                  {getWarningDescription()}
                </Text>
              </View>
              <Pressable 
                onPress={handleViewContent}
                style={styles.viewButton}
              >
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
            </View>
          </>
        )}
        

      </View>
    );
  }
));

// Styles
const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000000', // Fallback background color
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
    color: 'white',
    marginTop: 10,
    fontSize: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    fontFamily: 'Firma-Bold',
    color: Colors.white,
    marginBottom: 12,
    textAlign: 'center',
  },
  blurText: {
    fontSize: 15,
    fontFamily: 'Firma-Regular',
    color: Colors.lightGray,
    textAlign: 'center',
    lineHeight: 22,
  },
  viewButton: {
    position: 'absolute',
    bottom: 80,
    backgroundColor: Colors.white,
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
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
  },
  shadowGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
  },
  dimmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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