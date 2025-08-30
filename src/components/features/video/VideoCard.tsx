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
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';

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

    // Calculate overlay opacity
    const overlayOpacity = useMemo(() => {
      if (hasWarning) return 1;
      if (videoState.customDimLevel > 0) return videoState.customDimLevel;
      return 0;
    }, [hasWarning, videoState.customDimLevel]);

    // Video playback logic - prevent playback when content is blurred
    const shouldPlayVideo = useMemo(() => {
      // Don't play if any of these conditions are met
      if (shouldDisablePlayback || videoState.hasError || videoState.userPaused) return false;
      
      // Critical: Don't play if content is blurred and user hasn't chosen to view
      if (hasWarning && !shouldShowContent) return false;
      
      // Only play if explicitly told to play and we have a video URL
      return shouldPlay && !!finalVideoUrl;
    }, [shouldDisablePlayback, videoState.hasError, videoState.userPaused, hasWarning, shouldShowContent, shouldPlay, finalVideoUrl]);

    // Determine if video should even load (prevent loading blurred content)
    const shouldLoadVideo = useMemo(() => {
      // Don't load if content is blurred and user hasn't chosen to view
      if (hasWarning && !shouldShowContent) return false;
      
      return !!finalVideoUrl;
    }, [hasWarning, shouldShowContent, finalVideoUrl]);

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
            {shouldLoadVideo && (
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
                  onVideoStatus?.(post.uri, 'loading');
                }}
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
                {!shouldLoadVideo && !finalVideoUrl && (
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

});

export default VideoCard;