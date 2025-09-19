import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
  memo,
} from 'react';

import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { Image } from 'react-native';
import Video from 'react-native-video';
import { Colors } from '../../ui/UI';
import { extractVideoUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers';
import VideoOverlayUI from './VideoOverlayUI';
import { useThumbnailColor } from '../../../hooks/useThumbnailColor';

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
    
    // Consolidated state management
    const [videoState, setVideoState] = useState({
      hasError: false,
      userPaused: false,
      isReady: false,
      isBuffering: false,
      duration: 0,
      currentPosition: 0,
    });

    // Overlay state - consolidated
    const [overlayState, setOverlayState] = useState({
      isLikePending: false,
      isRepostPending: false,
      isLiked: !!post.viewer?.like,
      likeCount: post.likeCount || 0,
      repostCount: post.repostCount || 0,
      isReposted: !!post.viewer?.repost,
    });

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
    const cardHeight = height || width * (16/9);

    // Content warning state - use moderation decision directly
    const [userChoseToView, setUserChoseToView] = useState(false);
    
    // Get moderation decision from props or attached to post
    const decision = moderationDecision || post?.moderationDecision || post?.post?.moderationDecision;
    
    // Determine if content should be blurred
    const shouldBlur = decision?.blur || false;
    const shouldShowContent = !shouldBlur || userChoseToView;
    const isBlurred = shouldBlur && !shouldShowContent;
    const hasWarning = shouldBlur;
    const reason = decision?.reason;
    const informs = decision?.informs || [];
    
    // Handle user choosing to view content
    const handleViewContent = useCallback(() => {
      setUserChoseToView(true);
    }, []);
    
    // Reset when post changes
    useEffect(() => {
      setUserChoseToView(false);
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

    // Simplified video playback logic
    const shouldPlayVideo = !shouldDisablePlayback && 
                           !videoState.hasError && 
                           !videoState.userPaused &&
                           !(hasWarning && !shouldShowContent) &&
                           shouldPlay && 
                           !!videoUrl;

    const shouldLoadVideo = !(hasWarning && !shouldShowContent) && !!videoUrl;

    // Video playback control functions
    const play = useCallback(() => {
      if (videoState.hasError) return;
      // Don't play if content is blurred and user hasn't chosen to view
      if (hasWarning && !shouldShowContent) return;
      setVideoState(prev => ({ ...prev, userPaused: false }));
    }, [videoState.hasError, hasWarning, shouldShowContent]);

    const pause = useCallback(() => {
      setVideoState(prev => ({ ...prev, userPaused: true }));
    }, []);

    const togglePlay = useCallback(() => {
      // Don't toggle if content is blurred and user hasn't chosen to view
      if (hasWarning && !shouldShowContent) return;
      
      if (videoState.userPaused) {
        play();
      } else {
        pause();
      }
    }, [videoState.userPaused, play, pause, hasWarning, shouldShowContent]);

        // Tap to pause/play handler
    const handleVideoTap = useCallback(() => {
      if (shouldDisablePlayback || videoState.hasError) return;
      
      // Don't allow play/pause if content is blurred and user hasn't chosen to view
      if (hasWarning && !shouldShowContent) return;

      // Direct state update to avoid function call overhead
      setVideoState(prev => ({ 
        ...prev,
        userPaused: !prev.userPaused
      }));
    }, [shouldDisablePlayback, videoState.hasError, hasWarning, shouldShowContent]);

    const seekTo = useCallback((position: number) => {
      if (playerRef.current) {
        playerRef.current.seek(position);
        setVideoState(prev => ({ ...prev, currentPosition: position }));
      }
    }, []);

    const seek = useCallback((position: number) => {
      seekTo(position);
    }, [seekTo]);

    const unload = useCallback(() => {
      if (playerRef.current) {
        playerRef.current.seek(0);
      }
    }, []);

    const playPause = useCallback((shouldPlay: boolean) => {
      // Don't play if content is blurred and user hasn't chosen to view
      if (shouldPlay && hasWarning && !shouldShowContent) return;
      setVideoState(prev => ({ ...prev, userPaused: !shouldPlay }));
    }, [hasWarning, shouldShowContent]);

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

    // Video event handlers
    const handleLoad = useCallback((data: any) => {
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



    const handleEnd = useCallback(() => {
      setVideoState(prev => ({
        ...prev,
        currentPosition: 0
      }));
      
      if (playerRef.current) {
        playerRef.current.seek(0);
      }
    }, []);

    const handleError = useCallback((error: any) => {
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
      
      setOverlayState(prev => ({
        ...prev,
        isLikePending: true,
        isLiked: !prev.isLiked,
        likeCount: prev.isLiked ? prev.likeCount - 1 : prev.likeCount + 1
      }));
      
      try {
        // TODO: Implement actual like API call
        // await AtprotoService.likePost(post.uri, post.cid);
      } catch (error) {
        // Revert on error
        setOverlayState(prev => ({
          ...prev,
          isLiked: !prev.isLiked,
          likeCount: prev.isLiked ? prev.likeCount + 1 : prev.likeCount - 1
        }));
      } finally {
        setOverlayState(prev => ({ ...prev, isLikePending: false }));
      }
    }, [overlayState.isLikePending, post.uri, post.cid]);

    const handleRepost = useCallback(async () => {
      if (overlayState.isRepostPending) return;
      
      setOverlayState(prev => ({
        ...prev,
        isRepostPending: true,
        isReposted: !prev.isReposted,
        repostCount: prev.isReposted ? prev.repostCount - 1 : prev.repostCount + 1
      }));
      
      try {
        // TODO: Implement actual repost API call
        // await AtprotoService.repostPost(post.uri, post.cid);
      } catch (error) {
        setOverlayState(prev => ({
          ...prev,
          isReposted: !prev.isReposted,
          repostCount: prev.isReposted ? prev.repostCount + 1 : prev.repostCount - 1
        }));
        console.error('Repost error:', error);
      } finally {
        setOverlayState(prev => ({ ...prev, isRepostPending: false }));
      }
    }, [overlayState.isRepostPending, post.uri, post.cid]);

    const handleSourcePress = useCallback(() => {
      // TODO: Implement source feed navigation
    }, []);

    // Video Status Reporting
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
            {/* Show thumbnail if available and video not ready */}
            {posterUrl && !videoState.isReady && (
              <Image
                source={{ uri: posterUrl }}
                style={styles.thumbnailImage}
                resizeMode="contain"
              />
            )}
            
            {/* Video Player */}
            {shouldLoadVideo && (
              <Video
                ref={playerRef}
                source={{ uri: videoUrl }}
                style={[styles.videoPlayer, { backgroundColor: thumbnailBackgroundColor }]}
                resizeMode="contain"
                poster={posterUrl}
                posterResizeMode="contain"
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
                bufferConfig={{
                  minBufferMs: 1500,
                  bufferForPlaybackMs: 500,
                  bufferForPlaybackAfterRebufferMs: 1500
                }}
                ignoreSilentSwitch="ignore"
                allowsExternalPlayback={false}
                automaticallyWaitsToMinimizeStalling={false}
                useTextureView={false}
              />
            )}
            
            {/* Loading indicator when no video URL or buffering */}
            {(!shouldLoadVideo || videoState.isBuffering) && !isBlurred && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="white" />
                {!shouldLoadVideo && !videoUrl && (
                  <Text style={styles.loadingText}>No video URL found</Text>
                )}
                {videoState.isBuffering && (
                  <Text style={styles.loadingText}>Buffering...</Text>
                )}
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
    overflow: 'scroll',
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
  thumbnailImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: 1,
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