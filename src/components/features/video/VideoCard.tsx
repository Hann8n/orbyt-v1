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
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';

import { BORDER_RADIUS } from '../../../utils/constants';
import { AtprotoService } from '../../../services/api/AtprotoService';
import {
  View,
  Text,
  Dimensions,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { Image } from 'expo-image';
import { Colors } from '../../ui/UI';
import { Loading3FillIcon, HeartFillIcon } from '../../ui/Icon';
import BlurredThumbnailBackground from '../../ui/BlurredThumbnailBackground';
import { extractVideoUrl, extractVideoThumbnail, createVideoSource } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers';
import VideoOverlayUI from './VideoOverlayUI';
import { useFocusEffect } from 'expo-router';
import { useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { usePostInteractionStore } from '../../../stores/postInteractionStore';

// Use any type for post
type Post = any;

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
  moderationDecision?: any;
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
    isPlaying: shouldPlay = false,
    showOverlay = true,
    feedOption,
    sourceFeed,
    isModal = false,

  }, ref) => {
    const { presentCommentSection } = useGlobalCommentSection();
    const { updatePostInteraction, getPostInteraction } = usePostInteractionStore();
    
    // Enhanced video state management with automatic recycling
    const [videoState, setVideoState] = useRecyclingState({
      hasError: false,
      userPaused: false,
      isReady: false,
      isBuffering: false,
    }, [post.uri]); // Auto-resets when post.uri changes

    // Get persisted interaction state from store
    const persistedInteraction = getPostInteraction(post.uri, {
      isLiked: !!post.viewer?.like,
      likeCount: post.likeCount || 0,
      repostCount: post.repostCount || 0,
      isReposted: !!post.viewer?.repost,
      isBookmarked: false, // Bookmarks are now handled in share sheet
      likeUri: post.viewer?.like,
      repostUri: post.viewer?.repost,
    });

    // Overlay state - using recycling state for automatic reset, but initialize from store
    const [overlayState, setOverlayState] = useRecyclingState({
      isLikePending: false,
      isRepostPending: false,
      ...persistedInteraction,
    }, [post.uri]); // Auto-resets when post.uri changes

    // Refs
    const playerRef = useRef<any>(null);
    const videoId = post.uri;
    
    // Animated value for smooth dimming transition
    const dimmingOpacity = useRef(new Animated.Value(isVisible ? 0 : 1)).current;
    const [shouldShowDimming, setShouldShowDimming] = useState(!isVisible);
    
    // Double tap to like state
    const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
    const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartScale = useRef(new Animated.Value(0)).current;
    const heartOpacity = useRef(new Animated.Value(0)).current;
    const [heartPosition, setHeartPosition] = useState({ x: 0, y: 0 });
    const [showHeart, setShowHeart] = useState(false);

    // Get video URL and thumbnail using shared utilities
    const videoUrl = extractVideoUrl(post.embed);
    const posterUrl = extractVideoThumbnail(post.embed);
    
    // Track dimensions
    const { width } = Dimensions.get('window');
    // Use provided height or calculate based on 9:16 aspect ratio if post has aspectRatio
    const postAspectRatio = post.embed?.aspectRatio;
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
    const { isPlaying: playerIsPlaying } = useEvent(player, 'playingChange', { isPlaying: player?.playing ?? false });

    // Simplified content warning state
    const [userChoseToView, setUserChoseToView] = useState(false);
    
    // Get moderation decision and derive all blur states in one place
    const decision = moderationDecision || post?.moderationDecision || post?.post?.moderationDecision;
    const shouldBlur = decision?.blur || false;
    const shouldShowContent = !shouldBlur || userChoseToView;
    const isBlurred = shouldBlur && !shouldShowContent;
    const hasWarning = shouldBlur;
    const reason = decision?.reason;
    
    // Handle user choosing to view content
    const handleViewContent = useCallback(() => {
      setUserChoseToView(true);
    }, []);
    
    // Only reset userChoseToView when post changes - videoState is handled by useRecyclingState
    useEffect(() => {
      setUserChoseToView(false);
      // No need to reset videoState - handled automatically by useRecyclingState
    }, [post?.uri]);

    // Optimized dimming animation - only when visibility actually changes
    useEffect(() => {
      const targetOpacity = isVisible ? 0 : 1;
      
      if (targetOpacity === 0) {
        // Fading out - start animation then remove from render tree
        Animated.timing(dimmingOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          setShouldShowDimming(false);
        });
      } else {
        // Fading in - add to render tree then animate
        setShouldShowDimming(true);
        // Use requestAnimationFrame to ensure DOM update before animation
        requestAnimationFrame(() => {
          Animated.timing(dimmingOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }).start();
        });
      }
    }, [isVisible, dimmingOpacity]);

    // Isolated video playback logic - only depends on this video's state
    const shouldPlayVideo = !shouldDisablePlayback && 
                           !videoState.hasError && 
                           !videoState.userPaused &&
                           !(hasWarning && !shouldShowContent) &&
                           isVisible && // Use visibility instead of external shouldPlay prop
                           !!videoUrl;

    const shouldLoadVideo = !(hasWarning && !shouldShowContent) && !!videoSource;

    // Simplified video playback control functions
    const togglePlayback = useCallback((shouldPlay?: boolean) => {
      // Block interaction when content should remain hidden or playback is disabled
      if ((hasWarning && !shouldShowContent) || shouldDisablePlayback) {
        return;
      }

      setVideoState(prev => {
        // Guard against toggling when an error has occurred
        if (prev.hasError) {
          return prev;
        }

        const nextPaused = shouldPlay !== undefined ? !shouldPlay : !prev.userPaused;
        if (prev.userPaused === nextPaused) {
          return prev;
        }

        return { ...prev, userPaused: nextPaused };
      });
    }, [hasWarning, shouldShowContent, shouldDisablePlayback, setVideoState]);

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
      getPlayState: () => !videoState.userPaused && playerIsPlaying,
      getCurrentTime: () => {
        if (player && player.currentTime) {
          return player.currentTime * 1000; // Convert to ms
        }
        return 0;
      },
    }), [player, playerIsPlaying, videoState.userPaused, togglePlayback, seek]);

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
      if (isNowUnblocked && isVisible && !videoState.hasError) {
        // Clear userPaused to allow video to resume
        // This handles the case where overlay blocked playback and is now removed
        if (videoState.userPaused) {
          setVideoState(prev => ({ ...prev, userPaused: false }));
        }
      }
      
      prevShouldDisablePlaybackRef.current = shouldDisablePlayback;
    }, [shouldDisablePlayback, isVisible, videoState.hasError, videoState.userPaused, setVideoState]);

    // Auto-resume when video becomes visible (e.g., scrolling to next video after returning to feed)
    // This fixes the issue where the next video doesn't autoplay after returning to a feed
    useEffect(() => {
      const wasVisible = prevIsVisibleRef.current;
      const becameVisible = !wasVisible && isVisible;
      
      // When video becomes visible and can play, clear userPaused to allow autoplay
      // This handles the case where userPaused was set due to screen blur
      if (becameVisible && !shouldDisablePlayback && !videoState.hasError && videoState.userPaused) {
        setVideoState(prev => ({ ...prev, userPaused: false }));
      }
      
      prevIsVisibleRef.current = isVisible;
    }, [isVisible, shouldDisablePlayback, videoState.hasError, videoState.userPaused, setVideoState]);

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

    // Handle player status changes via effect
    useEffect(() => {
      if (!player) return;
      
      if (playerStatus === 'readyToPlay') {
        setVideoState(prev => ({
          ...prev,
          isReady: true,
          isBuffering: false,
          hasError: false,
        }));
        onVideoStatus?.(post.uri, 'loaded');
      } else if (playerStatus === 'loading') {
        setVideoState(prev => ({
          ...prev,
          isBuffering: true
        }));
        onVideoStatus?.(post.uri, 'loading');
      } else if (playerStatus === 'error') {
        setVideoState(prev => ({
          ...prev,
          hasError: true,
          isBuffering: false
        }));
        onVideoStatus?.(post.uri, 'error');
      }
    }, [playerStatus, player, post.uri, onVideoStatus]);

    // Control playback based on shouldPlayVideo
    useEffect(() => {
      if (!player) return;
      
      if (shouldPlayVideo && !playerIsPlaying) {
        player.play();
      } else if (!shouldPlayVideo && playerIsPlaying) {
        player.pause();
      }
    }, [shouldPlayVideo, playerIsPlaying, player]);

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
          const likeUri = await AtprotoService.likePost(post.uri, post.cid);
          setOverlayState(prev => ({ ...prev, likeUri }));
          // Persist to store
          updatePostInteraction(post.uri, {
            isLiked: true,
            likeCount: newLikeCount,
            likeUri,
          });
        } else {
          if (!overlayState.likeUri) throw new Error('No like URI found');
          await AtprotoService.deleteLike(overlayState.likeUri);
          setOverlayState(prev => ({ ...prev, likeUri: undefined }));
          // Persist to store
          updatePostInteraction(post.uri, {
            isLiked: false,
            likeCount: newLikeCount,
            likeUri: undefined,
          });
        }
      } catch (error) {
        console.error('Like action failed:', error);
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isLiked: !newIsLiked,
          likeCount: overlayState.likeCount
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isLikePending: false }));
      }
    }, [overlayState.isLikePending, overlayState.isLiked, overlayState.likeCount, overlayState.likeUri, post.uri, post.cid, setOverlayState, updatePostInteraction]);

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
        const likeUri = await AtprotoService.likePost(post.uri, post.cid);
        setOverlayState(prev => ({ ...prev, likeUri }));
        // Persist to store
        updatePostInteraction(post.uri, {
          isLiked: true,
          likeCount: newLikeCount,
          likeUri,
        });
      } catch (error) {
        console.error('Like action failed:', error);
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isLiked: false,
          likeCount: prev.likeCount - 1
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isLikePending: false }));
      }
    }, [overlayState.isLiked, overlayState.isLikePending, overlayState.likeCount, post.uri, post.cid, setOverlayState, updatePostInteraction]);

    // Double tap to like animation
    const animateHeart = useCallback((x: number, y: number) => {
      heartScale.stopAnimation();
      heartOpacity.stopAnimation();
      setHeartPosition({ x, y });
      setShowHeart(true);
      heartScale.setValue(0);
      heartOpacity.setValue(1);
      
      Animated.parallel([
        Animated.sequence([
          Animated.spring(heartScale, {
            toValue: 1.2,
            tension: 100,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.spring(heartScale, {
            toValue: 1,
            tension: 100,
            friction: 7,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(heartOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setShowHeart(false);
      });
    }, [heartScale, heartOpacity]);

    // Enhanced tap handler with double tap detection
    const handleVideoTap = useCallback((event: any) => {
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
        
        // Double tap detected (within 500ms and similar position)
        if (timeDiff < 500 && xDiff < 50 && yDiff < 50) {
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
      }, 400);
    }, [togglePlayback, overlayState.isLiked, overlayState.isLikePending, handleLike, animateHeart]);

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
        totalComments: post.replyCount || 0,
        isLiked: overlayState.isLiked,
        postedAt: post.record?.createdAt || post.indexedAt,
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
          const repostUri = await AtprotoService.repostPost(post.uri, post.cid);
          setOverlayState(prev => ({ ...prev, repostUri }));
          // Persist to store
          updatePostInteraction(post.uri, {
            isReposted: true,
            repostCount: newRepostCount,
            repostUri,
          });
        } else {
          if (!overlayState.repostUri) throw new Error('No repost URI found');
          await AtprotoService.deleteRepost(overlayState.repostUri);
          setOverlayState(prev => ({ ...prev, repostUri: undefined }));
          // Persist to store
          updatePostInteraction(post.uri, {
            isReposted: false,
            repostCount: newRepostCount,
            repostUri: undefined,
          });
        }
      } catch (error) {
        console.error('Repost action failed:', error);
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isReposted: !newIsReposted,
          repostCount: overlayState.repostCount
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isRepostPending: false }));
      }
    }, [overlayState.isRepostPending, overlayState.isReposted, overlayState.repostCount, overlayState.repostUri, post.uri, post.cid, setOverlayState, updatePostInteraction]);

    const navigation = useRouter();
    
    const handleSourcePress = useCallback(() => {
      if (sourceFeed && sourceFeed.startsWith('at://')) {
        // Navigate to channel page
        const encodedUri = encodeURIComponent(sourceFeed);
        navigation.push(`/channel/${encodedUri}`);
      }
    }, [sourceFeed, navigation]);

    // Video Status Reporting - use post URI for simple tracking
    useEffect(() => {
      if (shouldPlayVideo) {
        onVideoStatus?.(post.uri, 'playing');
      } else {
        onVideoStatus?.(post.uri, 'paused');
      }
    }, [shouldPlayVideo, post.uri, onVideoStatus]);

    return (
      <View style={[styles.container, { height: cardHeight }]}>
        {/* Blurred thumbnail background */}
        <BlurredThumbnailBackground thumbnailUrl={posterUrl} />
        {/* Unified Video and Overlay Container */}
        <Pressable 
          onPress={handleVideoTap} 
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={styles.videoContainerPressable}
        >
          <View style={styles.videoContainer}>
            {/* Poster thumbnail - shows until video is ready */}
            {!!posterUrl && !videoState.isReady && (
              <Image
                source={{ uri: posterUrl }}
                contentFit="contain"
                style={styles.poster}
              />
            )}
            
            {/* Video Player - expo-video VideoView */}
            {shouldLoadVideo && player && (
              <VideoView
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

            {/* Optimized dimming overlay - only render when needed */}
            {shouldShowDimming && (
              <Animated.View 
                style={[
                  styles.dimmingOverlay, 
                  { opacity: dimmingOpacity }
                ]} 
              />
            )}

            {/* Double tap heart animation */}
            {showHeart && (
              <Animated.View
                style={[
                  styles.heartAnimationContainer,
                  {
                    left: heartPosition.x - 50,
                    top: heartPosition.y - 50,
                    opacity: heartOpacity,
                    transform: [{ scale: heartScale }],
                  },
                ]}
                pointerEvents="none"
              >
                <HeartFillIcon size={100} color={Colors.INTERACTIVE.HEART.ACTIVE} />
              </Animated.View>
            )}

            {/* Integrated Overlay System using VideoOverlayUI */}
            {showOverlay && isVisible && (
              <VideoOverlayUI
                post={post}
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
              />
            )}
          </View>
        </Pressable>
        
        {/* Content Warning Overlay */}
        {isBlurred && (
          <BlurView 
            intensity={100}
            tint="dark"
            style={styles.contentWarningOverlay}
          >
            <View style={styles.blurMessage}>
              <Text style={styles.blurTitle}>Content Warning</Text>
              <Text style={styles.blurText}>
                {reason || 'This content may not be appropriate for all viewers.'}
              </Text>
              <TouchableOpacity onPress={handleViewContent}>
                <View style={styles.viewButton}>
                  <Text style={styles.viewButtonText}>Show Content</Text>
                </View>
              </TouchableOpacity>
            </View>
          </BlurView>
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
  contentWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  blurMessage: {
    width: '80%',
    padding: 20,
    borderRadius: BORDER_RADIUS.MEDIUM,
    alignItems: 'center',
  },
  blurTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  blurText: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 15,
  },
  viewButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  viewButtonText: {
    color: '#000',
    fontWeight: 'bold',
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