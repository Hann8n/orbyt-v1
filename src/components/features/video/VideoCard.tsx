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

import { BORDER_RADIUS } from '../../../utils/constants';
import { AtprotoService } from '../../../services/api/AtprotoService';
import {
  View,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { Image } from 'react-native';
import Video from 'react-native-video';
import { Colors } from '../../ui/UI';
import { Loading3FillIcon } from '../../ui/Icon';
import { extractVideoUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers';
import VideoOverlayUI from './VideoOverlayUI';
import { useThumbnailColor } from '../../../hooks/useThumbnailColor';
import { useFocusEffect } from 'expo-router';

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
  shouldCache?: boolean;
  // Overlay props
  showOverlay?: boolean;
  feedOption?: string;
  sourceFeed?: string;
  isModal?: boolean;

}

// Helper for video assets extraction - simplified
const getVideoAssets = (post: Post) => {
  const videoEmbed = post.embed;
  const videoUrl = videoEmbed?.playlist || 
                  post.embed?.external?.uri || 
                  post.embed?.record?.uri || 
                  post.embed?.url ||
                  post.videoUrl ||
                  '';
  const thumbnailUrl = videoEmbed?.thumbnail || '';
  
  return { videoEmbed, videoUrl, thumbnailUrl };
};

const VideoCard = memo(forwardRef<VideoCardRef, VideoCardProps>(
  ({ 
    post, 
    isVisible, 
    onVideoStatus, 
    height, 
    moderationDecision, 
    shouldDisablePlayback = false, 
    isPlaying: shouldPlay = false,
    shouldCache = true,
    showOverlay = true,
    feedOption,
    sourceFeed,
    isModal = false,

  }, ref) => {
    
    // Enhanced video state management with automatic recycling
    const [videoState, setVideoState] = useRecyclingState({
      hasError: false,
      userPaused: false,
      isReady: false,
      isBuffering: false,
      duration: 0,
      currentPosition: 0,
    }, [post.uri]); // Auto-resets when post.uri changes

    // Overlay state - using recycling state for automatic reset
    const [overlayState, setOverlayState] = useRecyclingState({
      isLikePending: false,
      isRepostPending: false,
      isLiked: !!post.viewer?.like,
      likeCount: post.likeCount || 0,
      repostCount: post.repostCount || 0,
      isReposted: !!post.viewer?.repost,
      likeUri: post.viewer?.like, // Track like URI for proper unlike functionality
      repostUri: post.viewer?.repost, // Track repost URI for proper unrepost functionality
    }, [post.uri]); // Auto-resets when post.uri changes

    // Refs
    const playerRef = useRef<any>(null);
    const videoId = post.uri;
    
    // Animated value for smooth dimming transition
    const dimmingOpacity = useRef(new Animated.Value(isVisible ? 0 : 1)).current;
    const [shouldShowDimming, setShouldShowDimming] = useState(!isVisible);

    // Get video assets - simplified
    const { thumbnailUrl: posterUrl, videoEmbed, videoUrl } = getVideoAssets(post);
    
    // Extract thumbnail color for background
    const { backgroundColor: thumbnailBackgroundColor } = useThumbnailColor(posterUrl);
    
    // Track dimensions
    const { width } = Dimensions.get('window');
    // Use provided height or calculate based on 9:16 aspect ratio if post has aspectRatio
    const postAspectRatio = post.embed?.aspectRatio;
    const defaultAspectRatio = postAspectRatio ? postAspectRatio.width / postAspectRatio.height : 16/9;
    const cardHeight = height || width * defaultAspectRatio;

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

    const shouldLoadVideo = !(hasWarning && !shouldShowContent) && !!videoUrl && videoUrl.trim() !== '';

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

    // Simplified play/pause functions that use the main toggle function
    const play = useCallback(() => togglePlayback(true), [togglePlayback]);
    const pause = useCallback(() => togglePlayback(false), [togglePlayback]);
    const togglePlay = useCallback(() => togglePlayback(), [togglePlayback]);
    
    // Tap handler uses the same toggle function
    const handleVideoTap = useCallback(() => togglePlayback(), [togglePlayback]);

    const seekTo = useCallback((position: number) => {
      if (playerRef.current) {
        playerRef.current.seek(position);
        setVideoState(prev => ({ ...prev, currentPosition: position }));
      }
    }, []);

    const seek = useCallback((position: number) => {
      seekTo(position);
    }, [seekTo]);

    // Enhanced unload function that properly cleans up resources
    const unload = useCallback(() => {
      if (playerRef.current) {
        // First pause the video
        if (!videoState.userPaused) {
          setVideoState(prev => ({ ...prev, userPaused: true }));
        }
        // Then reset position
        playerRef.current.seek(0);
        setVideoState(prev => ({ ...prev, currentPosition: 0 }));
      }
    }, [videoState.userPaused]);

    // Use our main togglePlayback function
    const playPause = useCallback((shouldPlay: boolean) => togglePlayback(shouldPlay), [togglePlayback]);

    const getPlayState = useCallback(() => {
      // Return false if content is blurred and user hasn't chosen to view
      if (hasWarning && !shouldShowContent) return false;
      return shouldPlayVideo;
    }, [shouldPlayVideo, hasWarning, shouldShowContent]);

    const getCurrentTime = useCallback(() => {
      return videoState.currentPosition;
    }, [videoState.currentPosition]);

    const getDuration = useCallback(() => {
      return videoState.duration;
    }, [videoState.duration]);

    // Expose functions via ref
    useImperativeHandle(ref, () => ({
      play,
      pause,
      togglePlay,
      seekTo,
      seek,
      unload,
      playPause,
      getPlayState,
      getCurrentTime,
      getDuration
    }));

    // Track previous shouldDisablePlayback to detect when overlay blocking is removed
    const prevShouldDisablePlaybackRef = useRef(shouldDisablePlayback);
    
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

    // Video event handlers - use post URI for simple tracking
    const handleLoad = useCallback((data: { duration?: number }) => {
      if (!data || !data.duration) return;
      const duration = data.duration * 1000;
      setVideoState(prev => ({
        ...prev,
        isReady: true,
        isBuffering: false,
        hasError: false,
        duration
      }));
      onVideoStatus?.(post.uri, 'loaded');
    }, [post.uri, onVideoStatus]);



    // Simplified handleEnd that uses seekTo
    const handleEnd = useCallback(() => {
      seekTo(0); // This already updates state and seeks the player
    }, [seekTo]);

    const handleError = useCallback((error: Error | unknown) => {
      setVideoState(prev => ({
        ...prev,
        hasError: true,
        isBuffering: false
      }));
      onVideoStatus?.(post.uri, 'error');
    }, [post.uri, onVideoStatus]);

    const handleReadyForDisplay = useCallback(() => {
      setVideoState(prev => ({
        ...prev,
        isBuffering: false
      }));
      onVideoStatus?.(post.uri, 'ready');
    }, [post.uri, onVideoStatus]);

    const handleBuffering = useCallback(({ isBuffering }: { isBuffering: boolean }) => {
      setVideoState(prev => ({
        ...prev,
        isBuffering
      }));
    }, []);

    // Simplified overlay interaction handlers
    const handleLike = useCallback(async () => {
      if (overlayState.isLikePending) return;
      
      // Optimistic update
      setOverlayState(prev => ({
        ...prev,
        isLikePending: true,
        isLiked: !prev.isLiked,
        likeCount: prev.isLiked ? prev.likeCount - 1 : prev.likeCount + 1
      }));
      
      try {
        if (!overlayState.isLiked) {
          const likeUri = await AtprotoService.likePost(post.uri, post.cid);
          setOverlayState(prev => ({ ...prev, likeUri }));
        } else {
          if (!overlayState.likeUri) throw new Error('No like URI found');
          await AtprotoService.deleteLike(overlayState.likeUri);
          setOverlayState(prev => ({ ...prev, likeUri: undefined }));
        }
      } catch (error) {
error('Like action failed:', error);
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isLiked: !prev.isLiked,
          likeCount: prev.isLiked ? prev.likeCount + 1 : prev.likeCount - 1
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isLikePending: false }));
      }
    }, [overlayState.isLikePending, overlayState.isLiked, overlayState.likeCount, overlayState.likeUri, post.uri, post.cid]);

    const handleRepost = useCallback(async () => {
      if (overlayState.isRepostPending) return;
      
      // Optimistic update
      setOverlayState(prev => ({
        ...prev,
        isRepostPending: true,
        isReposted: !prev.isReposted,
        repostCount: prev.isReposted ? prev.repostCount - 1 : prev.repostCount + 1
      }));
      
      try {
        if (!overlayState.isReposted) {
          const repostUri = await AtprotoService.repostPost(post.uri, post.cid);
          setOverlayState(prev => ({ ...prev, repostUri }));
        } else {
          if (!overlayState.repostUri) throw new Error('No repost URI found');
          await AtprotoService.deleteRepost(overlayState.repostUri);
          setOverlayState(prev => ({ ...prev, repostUri: undefined }));
        }
      } catch (error) {
error('Repost action failed:', error);
        // Revert optimistic update
        setOverlayState(prev => ({
          ...prev,
          isReposted: !prev.isReposted,
          repostCount: prev.isReposted ? prev.repostCount + 1 : prev.repostCount - 1
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isRepostPending: false }));
      }
    }, [overlayState.isRepostPending, overlayState.isReposted, overlayState.repostCount, overlayState.repostUri, post.uri, post.cid]);

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

    if (!shouldCache) return null;

    return (
      <View style={[styles.container, { height: cardHeight, backgroundColor: thumbnailBackgroundColor }]}>
        {/* Unified Video and Overlay Container */}
        <TouchableWithoutFeedback onPress={handleVideoTap}>
          <View style={[styles.videoContainer, { backgroundColor: thumbnailBackgroundColor }]}>
            {/* Thumbnail removed - using background color instead */}
            
            {/* Video Player */}
            {shouldLoadVideo && (
              <Video
                ref={playerRef}
                source={{ uri: videoUrl }}
                style={[styles.videoPlayer, { backgroundColor: thumbnailBackgroundColor }]}
                resizeMode="contain"
                // Removed poster to avoid conflict with renderLoader
                paused={!shouldPlayVideo}
                muted={false}
                repeat={true}
                playInBackground={false}
                playWhenInactive={false}
                onLoadStart={() => onVideoStatus?.(post.uri, 'loading')}
                onLoad={handleLoad}
                onEnd={handleEnd}
                onError={handleError}
                onReadyForDisplay={handleReadyForDisplay}
                onBuffer={handleBuffering}
                progressUpdateInterval={500} // Reduce update frequency for better performance
                bufferConfig={{
                  minBufferMs: 15000, // Increase buffer size for smoother playback
                  maxBufferMs: 50000,
                  bufferForPlaybackMs: 2500,
                  bufferForPlaybackAfterRebufferMs: 5000
                }}
                ignoreSilentSwitch="ignore"
                allowsExternalPlayback={false}
                automaticallyWaitsToMinimizeStalling={true} // Enable auto-waiting to reduce stalling
                useTextureView={false}
                renderLoader={() => (
                  <View style={styles.loadingOverlay}>
                    <Loading3FillIcon size={48} color="white" />
                  </View>
                )}
              />
            )}
            
            {/* Loading indicator only shown when needed */}
            {!shouldLoadVideo && !isBlurred && !videoUrl && (
              <View style={styles.loadingOverlay}>
                <Loading3FillIcon size={48} color="white" />
                <Text style={styles.loadingText}>No video URL found</Text>
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
        </TouchableWithoutFeedback>
        
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 12,
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

});

export default VideoCard;