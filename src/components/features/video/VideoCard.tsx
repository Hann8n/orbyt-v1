import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
  useMemo,
  memo, // <-- Add memo
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
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import { useIsFocused, useNavigationState } from '@react-navigation/native';
import WatchHistory from '../../../services/WatchHistory';
import { extractVideoUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet, getVideoCardHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { isVideoBlurred, setVideoBlurState } from '../../../services/FeedStore';
import PerformanceMonitor from '../../../utils/helpers/performance';


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
  shouldPreload?: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  moderationDecision?: ModerationDecision;
  shouldDisablePlayback?: boolean;
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
  ({ post, isVisible, shouldPreload = false, onVideoStatus, height, moderationDecision, shouldDisablePlayback = false }, ref) => {
    const isSmallDevice = isSmallScreen() || isTablet();
    const [hasError, setHasError] = useState<boolean>(false);
    const [userPaused, setUserPaused] = useState<boolean>(false);
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const [isPlayerValid, setIsPlayerValid] = useState<boolean>(false);
    const [isPreloadReady, setIsPreloadReady] = useState<boolean>(false);

    const [progress, setProgress] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [currentPosition, setCurrentPosition] = useState<number>(0);
    const [hasMarkedAsWatched, setHasMarkedAsWatched] = useState<boolean>(false);
    const [customDimLevel, setCustomDimLevel] = useState<number>(0);
    const wasPlayingBeforeBlur = useRef<boolean>(false);
    const playerRef = useRef<any>(null);
    const videoEmbed = getVideoEmbed(post.embed);
    const preloadCompleteRef = useRef(false);
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

    // Determine if video should be blurred
    const shouldBlur = moderationDecision?.blur || isVideoBlurred(post.uri, !!moderationDecision?.blur);

    // Calculate overlay opacity based on various factors
    const overlayOpacity = useMemo(() => {
      if (shouldBlur) return 1;
      if (customDimLevel > 0) return customDimLevel;
      if (!isVisible) return 0.3;
      return 0;
    }, [shouldBlur, customDimLevel, isVisible]);

    // Determine if video should actually play - optimized to reduce recalculations
    const shouldPlay = useMemo(() => {
      if (shouldDisablePlayback) return false;
      if (shouldBlur) return false;
      if (!isVisible) return false;
      if (userPaused) return false;
      if (!isScreenFocused) return false;
      if (!isLoaded) return false;
      if (!isPlayerValid) return false;
      return true;
    }, [shouldDisablePlayback, shouldBlur, isVisible, userPaused, isScreenFocused, isLoaded, isPlayerValid]);

    // Handle video status changes - optimized to prevent blocking scroll
    const handleVideoStatus = useCallback((status: string) => {
      if (status === 'ready') {
        setIsLoaded(true);
        setIsPlayerValid(true);
        if (!videoStatusNotifiedRef.current) {
          // Track video load performance
          const loadTime = PerformanceMonitor.endVideoLoadTimer(post.uri);
          if (loadTime > 2000) {
            console.warn(`Slow video load: ${loadTime}ms for ${post.uri}`);
          }
          
          // Use requestAnimationFrame to prevent blocking scroll events
          requestAnimationFrame(() => {
            onVideoStatus?.(post.uri, 'ready');
          });
          videoStatusNotifiedRef.current = true;
        }
        // If video becomes ready while visible, start playing immediately
        if (isVisible && !shouldDisablePlayback && !shouldBlur) {
          setUserPaused(false);
        }
      } else if (status === 'error') {
        setHasError(true);
        requestAnimationFrame(() => {
          onVideoStatus?.(post.uri, 'error');
        });
      } else if (status === 'loading') {
        // Start tracking video load time
        PerformanceMonitor.startVideoLoadTimer(post.uri);
        requestAnimationFrame(() => {
          onVideoStatus?.(post.uri, 'loading');
        });
      }
    }, [post.uri, onVideoStatus, isVisible, shouldDisablePlayback, shouldBlur]);

    // Handle buffer events - optimized
    const handleBuffer = useCallback((data: any) => {
      if (data.isBuffering) {
        requestAnimationFrame(() => {
          onVideoStatus?.(post.uri, 'buffering');
        });
      } else {
        requestAnimationFrame(() => {
          onVideoStatus?.(post.uri, 'ready');
        });
      }
    }, [post.uri, onVideoStatus]);

    // Handle progress updates - optimized to reduce frequency
    const handleProgress = useCallback((data: any) => {
      // Throttle progress updates to reduce re-renders
      const newProgress = data.currentTime / data.playableDuration;
      if (Math.abs(newProgress - progress) > 0.01) { // Only update if change is significant
        setProgress(newProgress);
        setCurrentPosition(data.currentTime);
        setDuration(data.playableDuration);
      }
    }, [progress]);

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
      getPlayState: () => shouldPlay,
    }), [progress, duration, currentPosition, shouldPlay]);

    // Handle visibility changes - optimized
    useEffect(() => {
      if (isVisible !== previousVisibilityRef.current) {
        previousVisibilityRef.current = isVisible;
        
        // When becoming visible, ensure video is ready to play
        if (isVisible && isLoaded && isPlayerValid) {
          requestAnimationFrame(() => {
            onVideoStatus?.(post.uri, 'ready');
          });
          // Reset user pause state when becoming visible to allow auto-play
          if (userPaused && !shouldDisablePlayback && !shouldBlur) {
            setUserPaused(false);
          }
        }
      }
    }, [isVisible, isLoaded, isPlayerValid, post.uri, onVideoStatus, userPaused, shouldDisablePlayback, shouldBlur]);

    // Handle app state changes
    useEffect(() => {
      const handleAppStateChange = (nextAppState: string) => {
        appStateRef.current = nextAppState as any;
      };
      const subscription = AppState.addEventListener('change', handleAppStateChange);
      return () => subscription.remove();
    }, []);

    // Handle navigation state changes
    useEffect(() => {
      if (navigationState?.type === 'stack') {
        // Pause when navigating away
        if (!isVisible) {
          setUserPaused(true);
        }
      }
    }, [navigationState, isVisible]);

    // Handle blur state changes
    useEffect(() => {
      if (shouldBlur) {
        wasPlayingBeforeBlur.current = shouldPlay;
        setUserPaused(true);
      } else if (wasPlayingBeforeBlur.current && isVisible) {
        setUserPaused(false);
      }
    }, [shouldBlur, shouldPlay, isVisible]);

    // Preload video if needed - optimized
    useEffect(() => {
      if (shouldPreload && videoUrl && !preloadCompleteRef.current) {
        VideoPreloadManager.addToPreloadQueue(videoUrl, () => Promise.resolve(), false)
          .then(() => {
            setIsPreloadReady(true);
            preloadCompleteRef.current = true;
            // Mark preloaded videos as ready immediately
            if (!isLoaded) {
              setIsLoaded(true);
              setIsPlayerValid(true);
            }
          })
          .catch(() => {
            // Preload failed, but continue anyway
            preloadCompleteRef.current = true;
          });
      }
    }, [shouldPreload, videoUrl, isLoaded]);

    // Handle preloaded videos - they should be ready to play immediately
    useEffect(() => {
      if (isVisible && shouldPreload && isPreloadReady && !isLoaded) {
        // Preloaded videos should be immediately ready
        setIsLoaded(true);
        setIsPlayerValid(true);
        videoStatusNotifiedRef.current = true;
        requestAnimationFrame(() => {
          onVideoStatus?.(post.uri, 'ready');
        });
      }
    }, [isVisible, shouldPreload, isPreloadReady, isLoaded, post.uri, onVideoStatus]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (playerRef.current) {
          playerRef.current.seek(0);
        }
      };
    }, []);

    if (!videoUrl) return null;

    return (
      <View style={[styles.container, { width: displayWidth, height: displayHeight }]}>
        <TouchableWithoutFeedback onPress={() => setUserPaused(!userPaused)}>
          <View style={styles.videoContainer}>
            {videoUrl && (isVisible || shouldPreload) && (
              <Video
                ref={playerRef}
                source={{ uri: videoUrl }}
                style={{ width: displayWidth, height: displayHeight }}
                resizeMode="contain"
                repeat={true}
                paused={!shouldPlay}
                onLoad={() => handleVideoStatus('ready')}
                onError={err => {
                  setHasError(true);
                  requestAnimationFrame(() => {
                    onVideoStatus?.(post.uri, 'error');
                  });
                }}
                onBuffer={handleBuffer}
                onProgress={handleProgress}
                onEnd={handleEnd}
                bufferConfig={{
                  minBufferMs: 15000,
                  maxBufferMs: 50000,
                  bufferForPlaybackMs: 2500,
                  bufferForPlaybackAfterRebufferMs: 5000,
                }}
                maxBitRate={1500000}
                muted={false}
                controls={false}
                playInBackground={false}
                playWhenInactive={false}
                ignoreSilentSwitch="ignore"
                disableFocus={true}
                // Performance optimizations
                progressUpdateInterval={100} // Reduced from default for smoother updates
                reportBandwidth={false} // Disable bandwidth reporting to reduce overhead
                automaticallyWaitsToMinimizeStalling={true} // iOS optimization
                textTracks={[]} // Disable text tracks to reduce overhead
                // Android specific optimizations
                useTextureView={Platform.OS === 'android'} // Use TextureView for better performance on Android
              />
            )}
            <Animated.View style={[styles.dimOverlay, { opacity: overlayOpacity }]} />
            {isVisible && !isLoaded && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            {shouldBlur && (
              <BlurView intensity={80} style={styles.blurOverlay}>
                <Icon name="hidden" size={60} color="#fff" style={styles.warningIcon} />
                <Text style={styles.blurText}>
                  {moderationDecision?.reason || 'This video is flagged as sensitive or explicit.'}
                </Text>
                <TouchableWithoutFeedback onPress={() => {
                  setVideoBlurState(post.uri, false);
                  forceRerender(n => n + 1);
                  if (playerRef.current && isPlayerValid && isVisible && !userPaused) {
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
  ({ post, isVisible, shouldPreload = false, onVideoStatus, shouldCache, height, moderationDecision, shouldDisablePlayback }, ref) => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const insets = useSafeAreaInsets();
    const isSmallDevice = isSmallScreen() || isTablet();
    
    const cardHeight = isSmallDevice ? screenHeight : getVideoCardHeight(insets);
    const cardWidth = screenWidth;

    const containerStyle = {
      width: cardWidth,
      height: cardHeight,
      position: 'absolute' as 'absolute',
      top: isSmallDevice ? 0 : 0,
      left: 0,
      margin: 0,
      padding: 0,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    };

    if (!shouldCache) return null;
    return (
      <View style={[styles.container, containerStyle]}>
        <CachedVideoCard
          ref={ref}
          post={post}
          isVisible={isVisible}
          shouldPreload={shouldPreload}
          onVideoStatus={onVideoStatus}
          height={cardHeight}
          moderationDecision={moderationDecision}
          shouldDisablePlayback={shouldDisablePlayback}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
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
    backgroundColor: '#000',
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
    color: '#fff',
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
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Firma-Medium',
    fontWeight: '600',
    textAlign: 'center',
  },
  warningIcon: {
    marginBottom: 20,
  },

});

// Custom comparison for React.memo - optimized for performance
const areEqual = (prevProps: VideoCardProps, nextProps: VideoCardProps) => {
  // Quick checks first
  if (prevProps.post?.uri !== nextProps.post?.uri) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.shouldPreload !== nextProps.shouldPreload) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.moderationDecision?.blur !== nextProps.moderationDecision?.blur) return false;
  if (prevProps.shouldDisablePlayback !== nextProps.shouldDisablePlayback) return false;
  
  // Deep check for post embed only if URI is the same
  if (prevProps.post?.embed !== nextProps.post?.embed) return false;
  
  return true;
};

export default memo(VideoCard, areEqual);