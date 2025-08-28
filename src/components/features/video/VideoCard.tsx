import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from 'react';

import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'react-native';
import Video from 'react-native-video';
import { Colors } from '../../ui/UI';
import { extractVideoUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers/screenSize';
import { useClearView } from '../../../stores/uiStore';
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

// Helper for video assets extraction
const useVideoAssets = (post: Post, isVisible: boolean) => {
  return useMemo(() => {
    const videoEmbed = post.embed;
    
    // Extract video URL from the correct location - use playlist from videoEmbed
    const videoUrl = videoEmbed?.playlist || 
                    post.embed?.external?.uri || 
                    post.embed?.record?.uri || 
                    post.embed?.url ||
                    post.videoUrl ||
                    '';
    
    // Extract thumbnail from the correct location
    const thumbnailUrl = videoEmbed?.thumbnail || 
                        '';
    
    const backgroundColors = ['#000000', '#111111'];
    
    // Debug logging
    console.log('[VideoCard] Video assets:', {
      postUri: post.uri,
      videoEmbed: videoEmbed,
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      playlist: videoEmbed?.playlist
    });
    
    return {
      videoEmbed,
      videoUrl,
      thumbnailUrl,
      backgroundColors
    };
  }, [post]);
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
    const { isClearViewMode } = useClearView();
    
    // Simplified state management
    const [videoState, setVideoState] = useState({
      hasError: false,
      userPaused: false,
      isReady: false,
      isBuffering: false,

      duration: 0,
      currentPosition: 0,
      customDimLevel: 0,
    });

    // Overlay state
    const [isLikePending, setIsLikePending] = useState(false);
    const [isRepostPending, setIsRepostPending] = useState(false);
    const [isLiked, setIsLiked] = useState(!!post.viewer?.like);
    const [likeCount, setLikeCount] = useState(post.likeCount || 0);
    const [repostCount, setRepostCount] = useState(post.repostCount || 0);
    const [isReposted, setIsReposted] = useState(!!post.viewer?.repost);

    // Refs
    const playerRef = useRef<any>(null);
    const videoId = post.uri;

    // Get combined video assets
    const { 
      thumbnailUrl: posterUrl, 
      backgroundColors, 
      videoEmbed, 
      videoUrl 
    } = useVideoAssets(post, isVisible);
    
    // Extract thumbnail color for background
    const { backgroundColor: thumbnailBackgroundColor } = useThumbnailColor(posterUrl);
    
    // Get final video URL
    const finalVideoUrl = useMemo(() => videoUrl || '', [videoUrl]);

    // Track dimensions
    const { width } = Dimensions.get('window');
    
    // Get optimal video height
    const cardHeight = useMemo(() => {
      if (height) return height;
      return width * (16/9); // Default 16:9 aspect ratio
    }, [width, height]);

    // Simplified moderation
    const shouldShowBlur = false;
    const [userChoseToView, setUserChoseToView] = useState(false);

    const viewContent = useCallback(() => {
      setUserChoseToView(true);
    }, []);

    // Calculate overlay opacity
    const overlayOpacity = useMemo(() => {
      if (shouldShowBlur) return 1;
      if (videoState.customDimLevel > 0) return videoState.customDimLevel;
      return 0;
    }, [shouldShowBlur, videoState.customDimLevel]);

    // Simplified video playback logic - just use the isPlaying prop directly
    const shouldPlayVideo = useMemo(() => {
      if (shouldDisablePlayback || videoState.hasError || videoState.userPaused) return false;
      if (shouldShowBlur && !userChoseToView) return false;
      return shouldPlay && !!finalVideoUrl;
    }, [shouldDisablePlayback, videoState.hasError, videoState.userPaused, shouldShowBlur, userChoseToView, shouldPlay, finalVideoUrl]);

    // Video playback control functions
    const play = useCallback(() => {
      if (videoState.hasError) return;
      setVideoState(prev => ({ ...prev, userPaused: false }));
    }, [videoState.hasError]);

    const pause = useCallback(() => {
      setVideoState(prev => ({ ...prev, userPaused: true }));
    }, []);

    const togglePlay = useCallback(() => {
      if (videoState.userPaused) {
        play();
      } else {
        pause();
      }
    }, [videoState.userPaused, play, pause]);

    // Tap to pause/play handler - optimized to avoid dependency chain
    const handleVideoTap = useCallback(() => {
      if (shouldDisablePlayback || videoState.hasError) return;
      // Direct state update to avoid function call overhead
      setVideoState(prev => ({ 
        ...prev, 
        userPaused: !prev.userPaused 
      }));
    }, [shouldDisablePlayback, videoState.hasError]);

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
      setVideoState(prev => ({ ...prev, userPaused: !shouldPlay }));
    }, []);

    const getPlayState = useCallback(() => {
      return shouldPlayVideo;
    }, [shouldPlayVideo]);

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
      console.log('[VideoCard] Video loaded:', data);
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

    const handleProgress = useCallback((data: any) => {
      if (!data) return;
      const currentPosition = Math.round(data.currentTime * 1000);
      const totalDuration = videoState.duration || Math.round(data.seekableDuration * 1000);
      
      if (Math.abs(currentPosition - videoState.currentPosition) > 250) {
        setVideoState(prev => ({
          ...prev,
          currentPosition,
          duration: totalDuration
        }));
      }
    }, [videoState.duration, videoState.currentPosition]);

    const handleEnd = useCallback(() => {
      setVideoState(prev => ({
        ...prev,
        currentPosition: 0,
        progress: 0
      }));
      
      if (playerRef.current) {
        playerRef.current.seek(0);
      }
    }, []);

    const handleError = useCallback((error: any) => {
      console.log('[VideoCard] Video error:', error);
      setVideoState(prev => ({
        ...prev,
        hasError: true,
        isBuffering: false
      }));
      onVideoStatus?.(post.uri, 'error');
    }, [post.uri, onVideoStatus]);

    const handleReadyForDisplay = useCallback(() => {
      console.log('[VideoCard] Video ready for display');
      setVideoState(prev => ({
        ...prev,
        isBuffering: false
      }));
      onVideoStatus?.(post.uri, 'ready');
    }, [post.uri, onVideoStatus]);

    const handleBuffering = useCallback((isBuffering: boolean) => {
      console.log('[VideoCard] Buffering:', isBuffering);
      setVideoState(prev => ({
        ...prev,
        isBuffering
      }));
    }, []);

    // Overlay interaction handlers
    const handleLike = useCallback(async () => {
      if (isLikePending) return;
      setIsLikePending(true);
      
      try {
        // Toggle like state
        const newIsLiked = !isLiked;
        setIsLiked(newIsLiked);
        setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);
        
        // TODO: Implement actual like API call
        // await AtprotoService.likePost(post.uri, post.cid);
      } catch (error) {
        // Revert on error
        setIsLiked(!isLiked);
        setLikeCount(prev => isLiked ? prev + 1 : prev - 1);
      } finally {
        setIsLikePending(false);
      }
    }, [isLiked, isLikePending, post.uri, post.cid]);

    const handleRepost = useCallback(async () => {
      if (isRepostPending) return;
      setIsRepostPending(true);
      
      try {
        const newIsReposted = !isReposted;
        setIsReposted(newIsReposted);
        setRepostCount(prev => newIsReposted ? prev + 1 : prev - 1);
        
        // TODO: Implement actual repost API call
        // await AtprotoService.repostPost(post.uri, post.cid);
      } catch (error) {
        setIsReposted(isReposted);
        setRepostCount(prev => isReposted ? prev + 1 : prev - 1);
        console.error('Repost error:', error);
      } finally {
        setIsRepostPending(false);
      }
    }, [isReposted, isRepostPending, post.uri, post.cid]);

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
            {finalVideoUrl && (
              <Video
                ref={playerRef}
                source={{ uri: finalVideoUrl }}
                style={[styles.videoPlayer, { backgroundColor: thumbnailBackgroundColor }]}
                resizeMode="contain"
                poster={posterUrl}
                posterResizeMode="contain"
                paused={!shouldPlayVideo}
                muted={false}
                repeat={true}
                playInBackground={false}
                playWhenInactive={false}
                onLoadStart={() => {
                  console.log('[VideoCard] Video load start');
                  onVideoStatus?.(post.uri, 'loading');
                }}
                onLoad={handleLoad}
                onProgress={handleProgress}
                onEnd={handleEnd}
                onError={handleError}
                onReadyForDisplay={handleReadyForDisplay}
                onBuffer={({ isBuffering }: { isBuffering: boolean }) => handleBuffering(isBuffering)}
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
            {(!finalVideoUrl || videoState.isBuffering) && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="white" />
                {!finalVideoUrl && (
                  <Text style={styles.loadingText}>No video URL found</Text>
                )}
                {videoState.isBuffering && (
                  <Text style={styles.loadingText}>Buffering...</Text>
                )}
              </View>
            )}

            {/* Integrated Overlay System using VideoOverlayUI */}
            {showOverlay && isVisible && !isClearViewMode && (
              <VideoOverlayUI
                post={post}
                isVisible={isVisible}
                isModal={isModal}
                feedOption={feedOption}
                sourceFeed={sourceFeed}
                onLike={handleLike}
                onRepost={handleRepost}
                onSourcePress={handleSourcePress}
                isLiked={isLiked}
                isReposted={isReposted}
                likeCount={likeCount}
                repostCount={repostCount}
                isLikePending={isLikePending}
                isRepostPending={isRepostPending}
              />
            )}
          </View>
        </TouchableWithoutFeedback>
        
        {/* Content Warning Overlay */}
        {(overlayOpacity > 0 || shouldShowBlur) && (
          <TouchableWithoutFeedback onPress={viewContent}>
            <View style={[
              styles.contentWarningOverlay, 
              { 
                opacity: overlayOpacity,
                backgroundColor: shouldShowBlur ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.7)'
              }
            ]}>
              {shouldShowBlur && (
                <View style={styles.blurMessage}>
                  <Text style={styles.blurTitle}>Content Warning</Text>
                  <Text style={styles.blurText}>This content may not be appropriate for all viewers.</Text>
                  <TouchableWithoutFeedback onPress={viewContent}>
                    <View style={styles.viewButton}>
                      <Text style={styles.viewButtonText}>Show Content</Text>
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
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
    borderRadius: BORDER_RADIUS.MEDIUM,
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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

});

export default VideoCard;