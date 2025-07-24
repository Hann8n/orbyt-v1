import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
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
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
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

type ExtendedVideoPlayer = VideoPlayer & {
  _hasBeenDestroyed?: boolean;
  onPlaybackStatusUpdate?: (status: any) => void;
  seek: (position: number) => Promise<void>;
};

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

const CachedVideoCard = forwardRef<VideoCardRef, CachedVideoCardProps>(
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
    const playerRef = useRef<ExtendedVideoPlayer | null>(null);
    const videoEmbed = getVideoEmbed(post.embed);
    const preloadCompleteRef = useRef(false);
    const insets = useSafeAreaInsets();
    const isScreenFocused = useIsFocused();
    const videoStatusNotifiedRef = useRef(false);
    const previousVisibilityRef = useRef(isVisible);
    const appStateRef = useRef(AppState.currentState);
    const navigationState = useNavigationState(state => state);
    const [showAnyway, setShowAnyway] = useState(false);

    const { width: screenWidth } = Dimensions.get('window');
    const containerHeight = height || Dimensions.get('window').height;
    const containerWidth = screenWidth;

    const videoNativeRatio = videoEmbed?.aspectRatio
      ? videoEmbed.aspectRatio.width / videoEmbed.aspectRatio.height
      : 9 / 16;

    let displayWidth: number, displayHeight: number;
    if (containerWidth / containerHeight > videoNativeRatio) {
      displayHeight = containerHeight;
      displayWidth = containerHeight * videoNativeRatio;
    } else {
      displayWidth = containerWidth;
      displayHeight = containerWidth / videoNativeRatio;
    }

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

    const isValidPlayer = (player: ExtendedVideoPlayer | null): boolean => {
      if (!player) return false;
      return (
        typeof player.play === 'function' &&
        typeof player.pause === 'function' &&
        !player._hasBeenDestroyed
      );
    };

    const safePlay = (player: ExtendedVideoPlayer | null): Promise<void> => {
      if (!isValidPlayer(player)) return Promise.resolve();
      try {
        const playPromise = player!.play() as unknown;
        if (playPromise !== undefined && typeof (playPromise as any).then === 'function') {
          return playPromise as Promise<void>;
        }
        return Promise.resolve();
      } catch (err) {
        console.warn('Safe play error:', err);
        return Promise.resolve();
      }
    };

    const safePause = (player: ExtendedVideoPlayer | null): void => {
      if (!isValidPlayer(player)) return;
      try {
        player!.pause();
      } catch (err) {
        console.warn('Safe pause error:', err);
      }
    };

    useEffect(() => {
      if (!videoUrl) return;

      const preloadVideo = async () => {
        try {
          await VideoPreloadManager.addToPreloadQueue(
            videoUrl,
            async () => {
              // Remove delay for faster video loading
              return Promise.resolve();
            },
            isVisible,
            post.author?.handle
          );

          if (!preloadCompleteRef.current) {
            preloadCompleteRef.current = true;
            setIsPreloadReady(true);
            
            if (!videoStatusNotifiedRef.current) {
              videoStatusNotifiedRef.current = true;
              onVideoStatus?.(post.uri, 'preloaded');
            }
          }
        } catch (err) {
          console.warn('Failed to preload video:', err);
          setIsPreloadReady(true);
        }
      };

      preloadVideo();

      const unsubscribe = VideoPreloadManager.subscribeToStatusUpdates(
        videoUrl,
        (status) => {
          if (status === 'preloaded' && !preloadCompleteRef.current) {
            preloadCompleteRef.current = true;
            setIsPreloadReady(true);
            
            if (!videoStatusNotifiedRef.current) {
              videoStatusNotifiedRef.current = true;
              onVideoStatus?.(post.uri, 'preloaded');
            }
          }
        }
      );

      return () => {
        unsubscribe();
      };
    }, [videoUrl, post.uri, post.author?.handle, onVideoStatus, isVisible]);

    const player = useVideoPlayer(videoUrl || '', (p: VideoPlayer) => {
      const extendedPlayer = p as ExtendedVideoPlayer;
      extendedPlayer.loop = true;
      extendedPlayer.volume = 1.0;
      extendedPlayer._hasBeenDestroyed = false;
      playerRef.current = extendedPlayer;
      extendedPlayer.onPlaybackStatusUpdate = (status) => {
        if (status.isLoaded) {
          if (status.durationMillis) {
            setDuration(status.durationMillis);
          }
          if (status.durationMillis) {
            const progressValue = status.positionMillis / status.durationMillis;
            setProgress(progressValue);
            setCurrentPosition(status.positionMillis);
            if (isVisible && progressValue > 0.5 && !hasMarkedAsWatched) {
              WatchHistory.addToWatchHistory(post.uri);
              setHasMarkedAsWatched(true);
            }
          } else {
            setProgress(0);
            setCurrentPosition(0);
          }
        } else {
          setProgress(0);
          setCurrentPosition(0);
        }
      };

      if (videoUrl) {
        setIsPlayerValid(true);
        setIsLoaded(true);
        
        if (!videoStatusNotifiedRef.current) {
          videoStatusNotifiedRef.current = true;
          onVideoStatus?.(post.uri, 'loaded');
        }

        // Simplified initial play logic for fast scrolling
        if (isVisible && !userPaused) {
          safePlay(extendedPlayer).catch((err) =>
            console.warn('Initial play failed:', err)
          );
        }
      }
    });

    useEffect(() => {
      // Pause video when blurred, resume if unblurred and conditions allow
      if (playerRef.current && isPlayerValid) {
        if (shouldBlur) {
          safePause(playerRef.current);
        } else if (isVisible && !userPaused && !shouldDisablePlayback) {
          safePlay(playerRef.current).catch((err) =>
            console.warn('Unblur play error:', err)
          );
        }
      }
    }, [shouldBlur, isVisible, userPaused, isPlayerValid, shouldDisablePlayback]);

    useEffect(() => {
      if (!isScreenFocused && playerRef.current && isValidPlayer(playerRef.current)) {
        wasPlayingBeforeBlur.current = !userPaused && isVisible;
        safePause(playerRef.current);
      } else if (isScreenFocused && playerRef.current && isValidPlayer(playerRef.current)) {
        const currentRoute = navigationState?.routes?.[navigationState.index];
        const isOnMainFeed = currentRoute?.name === 'Main' || 
                           (currentRoute?.state?.routes?.[currentRoute.state.index || 0]?.name === 'HomeScreen');
        
        if (wasPlayingBeforeBlur.current && !userPaused && isVisible && isOnMainFeed) {
          safePlay(playerRef.current).catch((err) =>
            console.warn('Resume play error:', err)
          );
        }
      }
    }, [isScreenFocused, userPaused, isVisible, navigationState]);

    useImperativeHandle(ref, () => ({
      playPause: (shouldPlay: boolean) => {
        if (!playerRef.current || !isValidPlayer(playerRef.current)) return;
        if (shouldPlay) {
          safePlay(playerRef.current).catch((err) =>
            console.warn('Play error:', err)
          );
          setUserPaused(false);
        } else {
          safePause(playerRef.current);
          setUserPaused(true);
        }
      },
      unload: () => {
        if (playerRef.current) {
          playerRef.current._hasBeenDestroyed = true;
          safePause(playerRef.current);
          playerRef.current = null;
        }
        setIsPlayerValid(false);
        preloadCompleteRef.current = false;
      },
      getProgress: () => progress,
      getDuration: () => duration,
      seek: async (fraction: number) => {
        if (playerRef.current && isValidPlayer(playerRef.current) && duration > 0) {
          const newPosition = Math.max(0, Math.min(fraction * duration, duration));
          try {
            await playerRef.current.seek(newPosition);
            setProgress(fraction);
            setCurrentPosition(newPosition);
            return Promise.resolve();
          } catch (err) {
            console.warn('Seek error:', err);
            return Promise.reject(err);
          }
        }
        return Promise.resolve();
      },
      getCurrentTime: () => currentPosition,
      setDimLevel: (level: number) => {
        setCustomDimLevel(level);
      },
      // Add getPlayState for preview modal
      getPlayState: () => {
        return !userPaused;
      },
    }));

    const handleToggle = useCallback((): void => {
      if (!playerRef.current || !isValidPlayer(playerRef.current)) return;
      if (userPaused) {
        safePlay(playerRef.current).catch((err) =>
          console.warn('Error during user play:', err)
        );
        setUserPaused(false);
      } else {
        safePause(playerRef.current);
        setUserPaused(true);
      }
    }, [userPaused]);

    useEffect(() => {
      return () => {
        if (playerRef.current) {
          playerRef.current._hasBeenDestroyed = true;
          safePause(playerRef.current);
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
          
          if (playerRef.current && isValidPlayer(playerRef.current) && 
              wasPlayingBeforeBlur.current && !userPaused && isVisible && isOnMainFeed) {
            safePlay(playerRef.current).catch((err) =>
              console.warn('AppState resume error:', err)
            );
          }
        } else if (previousState === 'active' && nextState !== 'active') {
          if (playerRef.current && isValidPlayer(playerRef.current)) {
            wasPlayingBeforeBlur.current = !userPaused && isVisible;
            safePause(playerRef.current);
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
              <VideoView
                player={player}
                style={{ width: displayWidth, height: displayHeight }}
                contentFit="contain"
                allowsFullscreen
                allowsPictureInPicture={false}
                pointerEvents="none"
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
                    if (playerRef.current && isValidPlayer(playerRef.current) && isVisible && !userPaused) {
                      safePlay(playerRef.current).catch((err) =>
                        console.warn('Show anyway play error:', err)
                      );
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
);

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