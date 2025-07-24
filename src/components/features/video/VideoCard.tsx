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
  if (
    embed?.$type === 'app.bsky.embed.recordWithMedia#view' &&
    (embed as any).media?.$type &&
    (embed as any).media.$type.includes('video')
  ) {
    return (embed as any).media;
  }
  return embed;
};

const CachedVideoCard = memo(forwardRef<VideoCardRef, CachedVideoCardProps>(
  ({ post, isVisible, onVideoStatus, height, moderationDecision, shouldDisablePlayback = false }, ref) => {
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
    const [showAnyway, setShowAnyway] = useState(false);

    // Memoize computed values for display size
    const { width: screenWidth } = Dimensions.get('window');
    const containerHeight = height || Dimensions.get('window').height;
    const containerWidth = screenWidth;
    const videoNativeRatio = useMemo(() => videoEmbed?.aspectRatio
      ? videoEmbed.aspectRatio.width / videoEmbed.aspectRatio.height
      : 9 / 16, [videoEmbed]);
    const [displayWidth, displayHeight] = useMemo(() => {
      if (containerWidth / containerHeight > videoNativeRatio) {
        return [containerHeight * videoNativeRatio, containerHeight];
      } else {
        return [containerWidth, containerWidth / videoNativeRatio];
      }
    }, [containerWidth, containerHeight, videoNativeRatio]);

    const overlayOpacity = useRef(new Animated.Value(isVisible ? 0 : 0.5)).current;

    // If blurred (warn), show overlay unless user chose to show anyway
    const shouldBlur = moderationDecision?.blur && !showAnyway;

    useEffect(() => {
      if (previousVisibilityRef.current && !isVisible) {
        overlayOpacity.setValue(0.5);
      } else if (!previousVisibilityRef.current && isVisible) {
        Animated.timing(overlayOpacity, {
          toValue: customDimLevel || 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } else if (isVisible) {
        Animated.timing(overlayOpacity, {
          toValue: customDimLevel,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
      
      previousVisibilityRef.current = isVisible;
    }, [isVisible, overlayOpacity, customDimLevel]);

    useEffect(() => {
      const isValidEmbed =
        videoEmbed &&
        videoEmbed.$type &&
        videoEmbed.$type.includes('video') &&
        ((typeof videoEmbed.playlist === 'string' &&
          videoEmbed.playlist.trim().length > 0) ||
          (Array.isArray(videoEmbed.playlist) && videoEmbed.playlist.length > 0));
      if (!isValidEmbed) {
        setHasError(true);
        onVideoStatus?.(post.uri, 'invalid');
      }
    }, [videoEmbed, post.uri, onVideoStatus]);

    const videoUrl = extractVideoUrl(videoEmbed);

    // Preloading is now handled globally by ListFeedView via prioritizeNextVideos.

    useEffect(() => {
      // Pause video when blurred, resume if unblurred and conditions allow
      if (playerRef.current && isPlayerValid) {
        if (shouldBlur) {
          setUserPaused(true);
        } else if (isVisible && !userPaused && !shouldDisablePlayback) {
          setUserPaused(false);
        }
      }
    }, [shouldBlur, isVisible, userPaused, isPlayerValid, shouldDisablePlayback]);

    useEffect(() => {
      if (!isScreenFocused && playerRef.current && isPlayerValid) {
        wasPlayingBeforeBlur.current = !userPaused && isVisible;
        setUserPaused(true);
      } else if (isScreenFocused && playerRef.current && isPlayerValid) {
        const currentRoute = navigationState?.routes?.[navigationState.index];
        const isOnMainFeed = currentRoute?.name === 'Main' || 
                           (currentRoute?.state?.routes?.[currentRoute.state.index || 0]?.name === 'HomeScreen');
        
        if (wasPlayingBeforeBlur.current && !userPaused && isVisible && isOnMainFeed) {
          setUserPaused(false);
        }
      }
    }, [isScreenFocused, userPaused, isVisible, navigationState]);

    useImperativeHandle(ref, () => ({
      playPause: (shouldPlay: boolean) => {
        setUserPaused(!shouldPlay);
      },
      unload: () => {
        setIsPlayerValid(false);
        setIsLoaded(false);
        setProgress(0);
        setDuration(0);
        setCurrentPosition(0);
        setUserPaused(false);
        setCustomDimLevel(0);
        setHasMarkedAsWatched(false);
        setShowAnyway(false);
      },
      getProgress: () => progress,
      getDuration: () => duration,
      seek: async (fraction: number) => {
        if (playerRef.current && duration > 0) {
          const newPosition = Math.max(0, Math.min(fraction * duration, duration));
          playerRef.current.seek(newPosition / 1000); // react-native-video expects seconds
          setProgress(fraction);
          setCurrentPosition(newPosition);
          return Promise.resolve();
        }
        return Promise.resolve();
      },
      getCurrentTime: () => currentPosition,
      setDimLevel: (level: number) => {
        setCustomDimLevel(level);
      },
      getPlayState: () => {
        return !userPaused;
      },
    }));

    // Memoize handlers
    const handleToggle = useCallback((): void => {
      setUserPaused((prev) => !prev);
    }, []);
    const handleBuffer = useCallback((bufferData: any) => {
      // Optionally show buffering UI or send analytics
      // Example: setBuffering(bufferData.isBuffering);
    }, []);

    useEffect(() => {
      return () => {
        if (playerRef.current) {
          playerRef.current = null;
        }
        setIsPlayerValid(false);
        preloadCompleteRef.current = false;
      };
    }, []);

    useEffect(() => {
      return () => {
        VideoPreloadManager.clearUnneededVideos([]);
      };
    }, []);

    useEffect(() => {
      const subscription = AppState.addEventListener('change', (nextState) => {
        const previousState = appStateRef.current;
        appStateRef.current = nextState;
        
        if (previousState !== 'active' && nextState === 'active') {
          const currentRoute = navigationState?.routes?.[navigationState.index];
          const isOnMainFeed = currentRoute?.name === 'Main' || 
                             (currentRoute?.state?.routes?.[currentRoute.state.index || 0]?.name === 'HomeScreen');
          
          if (playerRef.current && isPlayerValid && 
              wasPlayingBeforeBlur.current && !userPaused && isVisible && isOnMainFeed) {
            setUserPaused(false);
          }
        } else if (previousState === 'active' && nextState !== 'active') {
          if (playerRef.current && isPlayerValid) {
            wasPlayingBeforeBlur.current = !userPaused && isVisible;
            setUserPaused(true);
          }
        }
      });
      return () => subscription.remove();
    }, [userPaused, isVisible, navigationState]);



    return (
      <View style={[styles.cachedContainer, { height: containerHeight, margin: 0, padding: 0 }]}>
        {hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              Error loading video: {'Unknown error'}
            </Text>
          </View>
        ) : (
          <TouchableWithoutFeedback onPress={handleToggle}>
            <View style={[styles.videoContainer, { width: containerWidth, height: containerHeight }]}>
              <Video
                ref={playerRef}
                source={{ uri: videoUrl || '' }}
                style={{ width: displayWidth, height: displayHeight }}
                resizeMode="contain"
                paused={userPaused || shouldBlur || shouldDisablePlayback || !isVisible}
                repeat={true}
                volume={1.0}
                onLoad={status => {
                  setIsLoaded(true);
                  setIsPlayerValid(true);
                  setDuration((status.duration ? status.duration * 1000 : 0));
                  if (!videoStatusNotifiedRef.current) {
                    videoStatusNotifiedRef.current = true;
                    onVideoStatus?.(post.uri, 'loaded');
                  }
                }}
                onProgress={status => {
                  const positionMillis = status.currentTime * 1000;
                  setCurrentPosition(positionMillis);
                  if (duration > 0) {
                    const progressValue = positionMillis / duration;
                    setProgress(progressValue);
                    if (isVisible && progressValue > 0.5 && !hasMarkedAsWatched) {
                      WatchHistory.addToWatchHistory(post.uri);
                      setHasMarkedAsWatched(true);
                    }
                  }
                }}
                onError={err => {
                  setHasError(true);
                  onVideoStatus?.(post.uri, 'invalid');
                }}
                onBuffer={handleBuffer} // Buffering feedback
                bufferConfig={{
                  minBufferMs: 15000, // 15s minimum buffer
                  maxBufferMs: 50000, // 50s max buffer
                  bufferForPlaybackMs: 2500, // 2.5s before playback
                  bufferForPlaybackAfterRebufferMs: 5000, // 5s after rebuffer
                }}
                maxBitRate={1500000} // 1.5 Mbps cap for slow networks
                muted={false}
                controls={false}
                playInBackground={false}
                playWhenInactive={false}
                ignoreSilentSwitch="ignore"
                disableFocus={true}
              />
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
                    setShowAnyway(true);
                    // Start playing the video when user chooses to show anyway
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
        )}
      </View>
    );
  }
));

const VideoCard = forwardRef<VideoCardRef, VideoCardProps>(
  ({ post, isVisible, onVideoStatus, shouldCache, height, moderationDecision, shouldDisablePlayback }, ref) => {
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
    overflow: 'hidden',
    margin: 0,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cachedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    margin: 0,
    padding: 0,
    borderTopWidth: 0,
  },
  videoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    margin: 0,
    padding: 0,
  },
  errorContainer: {
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'white',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    padding: 32,
  },
  blurText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
    fontFamily: 'Firma-Medium',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  showAnywayButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
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

export default VideoCard;