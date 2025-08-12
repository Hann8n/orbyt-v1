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
import { useVideoPlaybackState } from '@stores/visibilityStore';
import { usePlaybackStore } from '@stores/playbackStore';
import {
  View,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  AppState,
  Animated,
} from 'react-native';
import Video from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

// Navigation state handled by visibility store
import { useRecyclingState } from '@shopify/flash-list';
import WatchHistory from '../../../services/WatchHistory';
import { extractVideoUrl, extractVideoThumbnail } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet, getVideoCardHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { feedService } from '../../../services/FeedService';
import { Colors } from '../../ui/UI';

// Import buffering strategies
import { MOBILE_BUFFER_CONFIG, createInitialBufferState, updateBufferState } from '../../../utils/helpers/videoBuffering';

// Video configuration 
const VIDEO_CONFIG = {
  PROGRESS_UPDATE_INTERVAL: 250,
  BUFFER_CONFIG: MOBILE_BUFFER_CONFIG,
} as const;

export interface VideoEmbed {
  $type: string;
  playlist: string | string[];
  aspectRatio?: {
    width: number;
    height: number;
  };
}

interface Author {
  avatar?: string;
  displayName?: string;
  handle?: string;
}

interface Post {
  embed: VideoEmbed;
  uri: string;
  author?: Author;
}

interface CachedVideoCardProps {
  post: Post;
  isVisible: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  moderationDecision?: ModerationDecision;
  shouldDisablePlayback?: boolean;
  isPlaying?: boolean;
}

interface VideoCardProps extends CachedVideoCardProps {
  shouldCache: boolean;
}

export interface VideoCardRef {
  playPause: (shouldPlay: boolean) => void;
  unload: () => void;
  getProgress: () => number;
  getDuration: () => number;
  seek: (fraction: number) => Promise<void>;
  getCurrentTime: () => number;
  setDimLevel: (level: number) => void;
  getPlayState: () => boolean;
}

const getVideoEmbed = (embed: VideoEmbed): VideoEmbed | undefined => {
  if (!embed || embed.$type !== 'app.bsky.embed.video#view') return undefined;
  return embed;
};

const CachedVideoCard = memo(forwardRef<VideoCardRef, CachedVideoCardProps>(
  ({ 
    post, 
    isVisible, 
    onVideoStatus, 
    height, 
    moderationDecision, 
    shouldDisablePlayback = false, 
    isPlaying: shouldPlay = false
  }, ref) => {
    const isSmallDevice = isSmallScreen() || isTablet();
    
    // Register video with playback store
    const { 
      registerVideo, 
      unregisterVideo, 
      setVideoPlaying, 
      setVideoBuffering, 
      updateVideoProgress,
      markVideoAsWatched,
      getVideoState: getPlaybackState 
    } = usePlaybackStore();
    
    // Consolidated state management with buffer state tracking
    const [videoState, setVideoState] = useState({
      hasError: false,
      userPaused: false,
      isReady: false,
      isBuffering: false,
      progress: 0,
      duration: 0,
      currentPosition: 0,
      hasMarkedAsWatched: false,
      customDimLevel: 0,
      isPlaying: false,
      // Buffer state tracking
      bufferState: createInitialBufferState(),
      connectionQuality: 'good' as 'poor' | 'moderate' | 'good' | 'excellent'
    });

    // Reset state when post changes and register/unregister video
    useEffect(() => {
      const videoUrl = extractVideoUrl(post.embed);
      if (videoUrl) {
        // Register video in playback store
        registerVideo(post.uri, videoUrl);
      }
      
      setVideoState({
        hasError: false,
        userPaused: false,
        isReady: false,
        isBuffering: false,
        progress: 0,
        duration: 0,
        currentPosition: 0,
        hasMarkedAsWatched: false,
        customDimLevel: 0,
        isPlaying: false,
        // Reset buffer tracking state
        bufferState: createInitialBufferState(),
        connectionQuality: videoState.connectionQuality // Keep connection quality assessment
      });
      if (playerRef.current) {
        try { playerRef.current.seek(0); } catch {}
      }
      
      // Cleanup function to unregister video
      return () => {
        unregisterVideo(post.uri);
      };
    }, [post.uri, registerVideo, unregisterVideo]);
    
    const wasPlayingBeforeBlur = useRef<boolean>(false);
    const playerRef = useRef<any>(null);
    const videoEmbed = getVideoEmbed(post.embed);
    const insets = useSafeAreaInsets();
    // Screen focus is handled by the visibility store automatically
    const videoStatusNotifiedRef = useRef(false);
    const previousVisibilityRef = useRef(isVisible);
    const appStateRef = useRef(AppState.currentState);
    // Navigation state is handled by the visibility store
    const [, forceRerender] = useState(0);

    // Memoize computed values for display size
    const { width: screenWidth } = Dimensions.get('window');
    const containerHeight = height || Dimensions.get('window').height;
    const containerWidth = screenWidth;
    const videoNativeRatio = useMemo(() => videoEmbed?.aspectRatio
      ? videoEmbed.aspectRatio.width / videoEmbed.aspectRatio.height
      : 9 / 16, [videoEmbed]);

    const displayWidth = containerWidth;
    const displayHeight = containerHeight;
    const videoUrl = extractVideoUrl(videoEmbed);
    const posterUrl = extractVideoThumbnail(videoEmbed as any) || undefined;

    // Determine if video should be blurred - prioritize user choice over moderation
    const shouldBlur = feedService.isVideoBlurred(post.uri, !!moderationDecision?.blur);

    // Calculate overlay opacity based on various factors - optimized for scroll performance
    const overlayOpacity = useMemo(() => {
      if (shouldBlur) return 1;
      if (videoState.customDimLevel > 0) return videoState.customDimLevel;
      return 0;
    }, [shouldBlur, videoState.customDimLevel]);

    // Determine playback state based on multiple factors including tab visibility
    const { shouldPlay: shouldPlayFromTab } = useVideoPlaybackState(isVisible);
    const shouldPlayVideo = shouldPlay && isVisible && !shouldDisablePlayback && !shouldBlur && shouldPlayFromTab;

    // Direct state update without complex effects
    useEffect(() => {
      setVideoState(prev => ({ ...prev, isPlaying: shouldPlayVideo }));
      // Sync with playback store
      setVideoPlaying(post.uri, shouldPlayVideo);
      
      if (shouldPlayVideo) {
        onVideoStatus?.(post.uri, 'playing');
      } else {
        onVideoStatus?.(post.uri, 'paused');
      }
    }, [shouldPlayVideo, post.uri, onVideoStatus, setVideoPlaying]);

    // Simple video status handling with consolidated state
    const handleVideoStatus = useCallback((status: string) => {
      if (status === 'ready') {
        setVideoState(prev => ({ ...prev, isReady: true }));
        onVideoStatus?.(post.uri, 'ready');
      } else if (status === 'error') {
        setVideoState(prev => ({ ...prev, hasError: true }));
        onVideoStatus?.(post.uri, 'error');
      }
    }, [post.uri, onVideoStatus]);

    // Enhanced buffer handling with performance tracking
    const handleBuffer = useCallback((data: any) => {
      setVideoState(prev => {
        // Update buffer state tracking
        const newBufferState = updateBufferState(prev.bufferState, data.isBuffering);
        
        // Dynamically adjust connection quality based on buffering patterns
        let connectionQuality = prev.connectionQuality;
        
        if (newBufferState.bufferingCount > 3) {
          // If buffering frequently, downgrade quality estimate
          if (newBufferState.lastBufferingDuration > 3000) {
            connectionQuality = 'poor';
          } else if (newBufferState.lastBufferingDuration > 1000) {
            connectionQuality = 'moderate';
          }
        }
        
        return { 
          ...prev, 
          isBuffering: data.isBuffering,
          bufferState: newBufferState,
          connectionQuality
        };
      });
      
      // Sync with playback store
      setVideoBuffering(post.uri, data.isBuffering);
      
      if (data.isBuffering) {
        onVideoStatus?.(post.uri, 'buffering');
      } else {
        onVideoStatus?.(post.uri, 'playing');
      }
    }, [post.uri, onVideoStatus, setVideoBuffering]);

    // Simplified progress handling with consolidated state
    const handleProgress = useCallback((data: any) => {
      const newProgress = data.currentTime / data.playableDuration;
      setVideoState(prev => ({ 
        ...prev, 
        progress: newProgress,
        currentPosition: data.currentTime,
        duration: data.playableDuration
      }));
      
      // Sync with playback store
      updateVideoProgress(post.uri, newProgress, data.currentTime, data.playableDuration);
    }, [post.uri, updateVideoProgress]);

    // Handle video end with consolidated state
    const handleEnd = useCallback(() => {
      if (!videoState.hasMarkedAsWatched) {
        WatchHistory.addToWatchHistory(post.uri);
        setVideoState(prev => ({ ...prev, hasMarkedAsWatched: true }));
        // Sync with playback store
        markVideoAsWatched(post.uri);
      }
    }, [post.uri, videoState.hasMarkedAsWatched, markVideoAsWatched]);

    // Expose methods via ref with consolidated state
    useImperativeHandle(ref, () => ({
      playPause: (shouldPlay: boolean) => {
        setVideoState(prev => ({ ...prev, userPaused: !shouldPlay }));
      },
      unload: () => {
        if (playerRef.current) {
          playerRef.current.seek(0);
        }
      },
      getProgress: () => videoState.progress,
      getDuration: () => videoState.duration,
      seek: async (fraction: number) => {
        if (playerRef.current && videoState.duration > 0) {
          const targetTime = videoState.duration * fraction;
          playerRef.current.seek(targetTime);
        }
      },
      getCurrentTime: () => videoState.currentPosition,
      setDimLevel: (level: number) => {
        setVideoState(prev => ({ ...prev, customDimLevel: level }));
      },
      getPlayState: () => videoState.isPlaying,
    }), [videoState]);

    // Simple visibility tracking - no complex logic
    useEffect(() => {
      if (isVisible !== previousVisibilityRef.current) {
        previousVisibilityRef.current = isVisible;
        onVideoStatus?.(post.uri, isVisible ? 'visible' : 'hidden');
      }
    }, [isVisible, post.uri, onVideoStatus]);

    // Handle app state changes - single subscription
    useEffect(() => {
      const handleAppStateChange = (nextAppState: string) => {
        appStateRef.current = nextAppState as any;
      };
      const subscription = AppState.addEventListener('change', handleAppStateChange);
      return () => subscription.remove();
    }, []);

    // Simple blur handling with consolidated state
    useEffect(() => {
      if (shouldBlur) {
        setVideoState(prev => ({ ...prev, userPaused: true }));
      }
    }, [shouldBlur]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (playerRef.current) {
          try {
            playerRef.current.seek(0);
          } catch (e) {
            // Silently handle seek errors during cleanup
          }
        }
      };
    }, []);

    // Safety check for video-specific component (filtering is already done at API level for feeds)
    if (!videoUrl) return null;

    return (
      <View style={[styles.container, { width: displayWidth, height: displayHeight }]}>
        <TouchableWithoutFeedback onPress={() => setVideoState(prev => ({ ...prev, userPaused: !prev.userPaused }))}>
          <View style={styles.videoContainer} pointerEvents="box-none">
            {videoUrl && (
              <Video
                key={post.uri}
                ref={playerRef}
                source={{ uri: videoUrl }}
                style={{ width: displayWidth, height: displayHeight }}
                repeat={true}
                paused={!videoState.isPlaying}
                onLoad={() => handleVideoStatus('ready')}
                onReadyForDisplay={() => handleVideoStatus('ready')}
                onError={err => {
                  setVideoState(prev => ({ ...prev, hasError: true }));
                  onVideoStatus?.(post.uri, 'error');
                }}
                onBuffer={handleBuffer}
                onProgress={handleProgress}
                onEnd={handleEnd}
                bufferConfig={{
                  minBufferMs: VIDEO_CONFIG.BUFFER_CONFIG.minBufferMs,
                  maxBufferMs: VIDEO_CONFIG.BUFFER_CONFIG.maxBufferMs,
                  bufferForPlaybackMs: VIDEO_CONFIG.BUFFER_CONFIG.bufferForPlaybackMs,
                  bufferForPlaybackAfterRebufferMs: VIDEO_CONFIG.BUFFER_CONFIG.bufferForPlaybackAfterRebufferMs,
                }}
                muted={false}
                controls={false}
                playInBackground={false}
                playWhenInactive={false}
                ignoreSilentSwitch="ignore"
                disableFocus={true}
                progressUpdateInterval={VIDEO_CONFIG.PROGRESS_UPDATE_INTERVAL}
                reportBandwidth={false}
                automaticallyWaitsToMinimizeStalling={false}
                textTracks={[]}
                useTextureView={Platform.OS === 'android'}
                allowsExternalPlayback={false}
                preventsDisplaySleepDuringVideoPlayback={false}
                poster={posterUrl}
                posterResizeMode="contain"
                resizeMode="contain"
                hideShutterView={true}
              />
            )}
            <Animated.View style={[styles.dimOverlay, { opacity: overlayOpacity }]} pointerEvents="none" />
            {isVisible && !videoState.isReady && !posterUrl && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={Colors.white} />
              </View>
            )}
            {shouldBlur && (
              <BlurView intensity={80} style={styles.blurOverlay} pointerEvents="box-none">
                <Icon name="hidden" size={60} color={Colors.white} style={styles.warningIcon} />
                <Text style={styles.blurText}>
                  {moderationDecision?.reason || 'This video is flagged as sensitive or explicit.'}
                </Text>
                <TouchableWithoutFeedback onPress={() => {
                  feedService.setVideoBlurState(post.uri, false);
                  forceRerender(n => n + 1);
                  if (playerRef.current && videoState.isReady && isVisible && !videoState.userPaused) {
                    setVideoState(prev => ({ ...prev, userPaused: false }));
                  }
                }}>
                  <View style={styles.showAnywayButton}>
                    <Text style={styles.showAnywayButtonText}>Show Anyway</Text>
                  </View>
                </TouchableWithoutFeedback>
              </BlurView>
            )}
          </View>
        </TouchableWithoutFeedback>
      </View>
    );
  }
));

const VideoCard = forwardRef<VideoCardRef, VideoCardProps>(
  ({ 
    post, 
    isVisible, 
    onVideoStatus, 
    shouldCache, 
    height, 
    moderationDecision, 
    shouldDisablePlayback, 
    isPlaying: shouldPlay = false
  }, ref) => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const insets = useSafeAreaInsets();
    const isSmallDevice = isSmallScreen() || isTablet();
    
    // Prefer explicit height when provided (e.g., modal provides full viewport height)
    const cardHeight = typeof height === 'number' && height > 0
      ? height
      : (isSmallDevice ? screenHeight : getVideoCardHeight(insets));
    const cardWidth = screenWidth;

    const containerStyle = {
      width: cardWidth,
      height: cardHeight,
      margin: 0,
      padding: 0,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      backgroundColor: Colors.black,
    };

    if (!shouldCache) return null;
    return (
      <View style={[styles.container, containerStyle]}>
        <CachedVideoCard
          ref={ref}
          post={post}
          isVisible={isVisible}
          onVideoStatus={onVideoStatus}
          height={cardHeight}
          moderationDecision={moderationDecision}
          shouldDisablePlayback={shouldDisablePlayback}
          isPlaying={shouldPlay}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.black,
    zIndex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 2,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  blurText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    marginHorizontal: 40,
    marginBottom: 20,
  },
  showAnywayButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  showAnywayButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
    fontWeight: '600',
    textAlign: 'center',
  },
  warningIcon: {
    marginBottom: 20,
  },
});

// Ultra-optimized memo comparison for immediate video performance  
const areEqual = (prevProps: VideoCardProps, nextProps: VideoCardProps) => {
  // Only re-render on essential changes for fastest playback
  return (
    prevProps.post?.uri === nextProps.post?.uri &&
    prevProps.isVisible === nextProps.isVisible &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.shouldDisablePlayback === nextProps.shouldDisablePlayback
  );
};

export default memo(VideoCard, areEqual);