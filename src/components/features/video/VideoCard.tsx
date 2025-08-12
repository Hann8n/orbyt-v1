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

import { useIsFocused, useNavigationState } from '@react-navigation/native';
import { useRecyclingState } from '@shopify/flash-list';
import WatchHistory from '../../../services/WatchHistory';
import { extractVideoUrl, extractVideoThumbnail } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet, getVideoCardHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { feedService } from '../../../services/FeedService';
import { Colors } from '../../ui/UI';

// Simplified video configuration for immediate playback
const VIDEO_CONFIG = {
  PROGRESS_UPDATE_INTERVAL: 250,
  MIN_BUFFER_MS: 500,
  MAX_BUFFER_MS: 3000,
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
    
    // Simplified state management for immediate playback
    const [hasError, setHasError] = useState<boolean>(false);
    const [userPaused, setUserPaused] = useState<boolean>(false);
    const [isReady, setIsReady] = useState<boolean>(false);
    const [isBuffering, setIsBuffering] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [currentPosition, setCurrentPosition] = useState<number>(0);
    const [hasMarkedAsWatched, setHasMarkedAsWatched] = useState<boolean>(false);
    const [customDimLevel, setCustomDimLevel] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);

    // Reset state when post changes
    useEffect(() => {
      setHasError(false);
      setIsBuffering(false);
      setProgress(0);
      setDuration(0);
      setCurrentPosition(0);
      setHasMarkedAsWatched(false);
      setCustomDimLevel(0);
      setUserPaused(false);
      setIsReady(false);
      if (playerRef.current) {
        try { playerRef.current.seek(0); } catch {}
      }
    }, [post.uri]);
    
    const wasPlayingBeforeBlur = useRef<boolean>(false);
    const playerRef = useRef<any>(null);
    const videoEmbed = getVideoEmbed(post.embed);
    const insets = useSafeAreaInsets();
    const isScreenFocused = useIsFocused();
    const videoStatusNotifiedRef = useRef(false);
    const previousVisibilityRef = useRef(isVisible);
    const appStateRef = useRef(AppState.currentState);
    const navigationState = useNavigationState(state => state);
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
      if (customDimLevel > 0) return customDimLevel;
      return 0;
    }, [shouldBlur, customDimLevel]);

    // Ultra-simplified video state - just check if we should play
    const shouldPlayVideo = shouldPlay && isVisible && isReady && !shouldDisablePlayback && !shouldBlur;

    // Direct state update without complex effects
    useEffect(() => {
      setIsPlaying(shouldPlayVideo);
      if (shouldPlayVideo) {
        onVideoStatus?.(post.uri, 'playing');
      } else {
        onVideoStatus?.(post.uri, 'paused');
      }
    }, [shouldPlayVideo, post.uri, onVideoStatus]);

    // Simple video status handling
    const handleVideoStatus = useCallback((status: string) => {
      if (status === 'ready') {
        setIsReady(true);
        onVideoStatus?.(post.uri, 'ready');
      } else if (status === 'error') {
        setHasError(true);
        onVideoStatus?.(post.uri, 'error');
      }
    }, [post.uri, onVideoStatus]);

    // Simplified buffer handling
    const handleBuffer = useCallback((data: any) => {
      setIsBuffering(data.isBuffering);
      if (data.isBuffering) {
        onVideoStatus?.(post.uri, 'buffering');
      }
    }, [post.uri, onVideoStatus]);

    // Simplified progress handling
    const handleProgress = useCallback((data: any) => {
      const newProgress = data.currentTime / data.playableDuration;
      setProgress(newProgress);
      setCurrentPosition(data.currentTime);
      setDuration(data.playableDuration);
    }, []);

    // Handle video end
    const handleEnd = useCallback(() => {
      if (!hasMarkedAsWatched) {
        WatchHistory.addToWatchHistory(post.uri);
        setHasMarkedAsWatched(true);
      }
    }, [post.uri, hasMarkedAsWatched]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      playPause: (shouldPlay: boolean) => {
        setUserPaused(!shouldPlay);
      },
      unload: () => {
        if (playerRef.current) {
          playerRef.current.seek(0);
        }
      },
      getProgress: () => progress,
      getDuration: () => duration,
      seek: async (fraction: number) => {
        if (playerRef.current && duration > 0) {
          const targetTime = duration * fraction;
          playerRef.current.seek(targetTime);
        }
      },
      getCurrentTime: () => currentPosition,
      setDimLevel: (level: number) => {
        setCustomDimLevel(level);
      },
      getPlayState: () => isPlaying,
    }), [progress, duration, currentPosition, isPlaying]);

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

    // Simple blur handling
    useEffect(() => {
      if (shouldBlur) {
        setUserPaused(true);
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
        <TouchableWithoutFeedback onPress={() => setUserPaused(!userPaused)}>
          <View style={styles.videoContainer} pointerEvents="box-none">
            {videoUrl && (
              <Video
                key={post.uri}
                ref={playerRef}
                source={{ uri: videoUrl }}
                style={{ width: displayWidth, height: displayHeight }}
                repeat={true}
                paused={!isPlaying}
                onLoad={() => handleVideoStatus('ready')}
                onReadyForDisplay={() => handleVideoStatus('ready')}
                onError={err => {
                  setHasError(true);
                  onVideoStatus?.(post.uri, 'error');
                }}
                onBuffer={handleBuffer}
                onProgress={handleProgress}
                onEnd={handleEnd}
                bufferConfig={{
                  minBufferMs: VIDEO_CONFIG.MIN_BUFFER_MS,
                  maxBufferMs: VIDEO_CONFIG.MAX_BUFFER_MS,
                  bufferForPlaybackMs: 250,
                  bufferForPlaybackAfterRebufferMs: 500,
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
                posterResizeMode="cover"
                resizeMode="cover"
                hideShutterView={true}
              />
            )}
            <Animated.View style={[styles.dimOverlay, { opacity: overlayOpacity }]} pointerEvents="none" />
            {isVisible && !isReady && !posterUrl && (
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
                  if (playerRef.current && isReady && isVisible && !userPaused) {
                    setUserPaused(false);
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