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
import { useVideoPlaybackState } from '../../../stores/visibilityStore';
import { usePlaybackStore, useVideoDimLevel } from '../../../stores/playbackStore';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

// Navigation state handled by visibility store
import { useRecyclingState } from '@shopify/flash-list';
import WatchHistory from '../../../services/WatchHistory';
import { extractVideoUrl, extractVideoThumbnail, extractVideoEmbedAndUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet, getVideoCardHeight } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import Icon from '../../ui/Icon';
import { feedService } from '../../../services/FeedService';
import { Colors } from '../../ui/UI';
import VideoOverlay from './VideoOverlay';

// Import buffering strategies
import { MOBILE_BUFFER_CONFIG } from '../../../utils/helpers/videoBuffering';

// Video configuration optimized for scroll performance
const VIDEO_CONFIG = {
  PROGRESS_UPDATE_INTERVAL: 1000, // Reduced from 250ms to 1000ms for better performance
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

interface Record {
  text?: string;
  metadata?: {
    orbyt?: boolean;
    platform?: string;
  };
  createdAt?: string;
}

export interface Post {
  uri: string;
  cid?: string;
  author?: Author;
  record?: Record;
  viewer?: {
    like?: string;
    repost?: string;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  embed?: any;
  repostedBy?: Author;
  metadata?: {
    orbyt?: boolean;
  };
}



export interface VideoCardRef {
  playPause: (shouldPlay: boolean) => void;
  seek: (fraction: number) => void;
  unload: () => void;
  getProgress: () => number;
  getDuration: () => number;
  getCurrentTime: () => number;
  setDimLevel: (level: number) => void;
  getPlayState: () => boolean;
}

interface CachedVideoCardProps {
  post: Post;
  isVisible: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
  height: number;
  moderationDecision?: ModerationDecision;
  shouldDisablePlayback?: boolean;
  isPlaying: boolean;
  // Overlay props
  overlayPost?: Post;
  overlayVisible?: boolean;
  overlayPrefetchProfile?: boolean;
  overlayFeedOption?: 'yourMix' | 'following' | 'discover';
  overlaySourceFeed?: string;
  overlayIsModal?: boolean;
  overlayOnScrubbingChange?: (isScrubbing: boolean) => void;
  overlayProgressBarAtCardBottom?: boolean;
}

const CachedVideoCard = memo(forwardRef<VideoCardRef, CachedVideoCardProps>(
  ({ 
    post, 
    isVisible, 
    onVideoStatus, 
    height, 
    moderationDecision, 
    shouldDisablePlayback = false, 
    isPlaying: shouldPlay = false,
    // Overlay props
    overlayPost,
    overlayVisible = false,
    overlayPrefetchProfile = false,
    overlayFeedOption,
    overlaySourceFeed,
    overlayIsModal = false,
    overlayOnScrubbingChange,
    overlayProgressBarAtCardBottom = false
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
    
    // Simplified state management - removed complex buffer state tracking
    const [videoState, setVideoState] = useState({
      hasError: false,
      userPaused: false,
      isReady: false,
      isBuffering: false,
      progress: 0,
      duration: 0,
      currentPosition: 0,
      customDimLevel: 0,
    });

    // Refs
    const playerRef = useRef<any>(null);
    const progressUpdateInterval = useRef<NodeJS.Timeout | null>(null);
    const videoId = post.uri;

    // Get dim level for this video based on active state
    const videoDimLevel = useVideoDimLevel(videoId);

    // Memoize computed values for display size
    const { width: screenWidth } = Dimensions.get('window');
    const containerHeight = height || Dimensions.get('window').height;
    const containerWidth = screenWidth;
    
    // Use the correct video extraction function
    const { videoEmbed, videoUrl } = useMemo(() => {
      return extractVideoEmbedAndUrl(post);
    }, [post.embed, post.uri]);
    
    const videoNativeRatio = useMemo(() => videoEmbed?.aspectRatio
      ? videoEmbed.aspectRatio.width / videoEmbed.aspectRatio.height
      : 9 / 16, [videoEmbed]);

    const displayWidth = containerWidth;
    const displayHeight = containerHeight;
    
    // Build ordered list of candidate URLs (prefer HLS, then MP4, then any)
    const playlistCandidates = useMemo(() => {
      const urls: string[] = [];
      const list = Array.isArray(videoEmbed?.playlist)
        ? (videoEmbed?.playlist as string[])
        : (videoEmbed?.playlist ? [videoEmbed?.playlist as string] : []);
      const unique = Array.from(new Set(list.filter(Boolean)));
      const hls = unique.filter(u => u.toLowerCase().includes('.m3u8'));
      const mp4 = unique.filter(u => u.toLowerCase().includes('.mp4'));
      const other = unique.filter(u => !u.toLowerCase().includes('.m3u8') && !u.toLowerCase().includes('.mp4'));
      urls.push(...hls, ...mp4, ...other);
      return urls;
    }, [videoEmbed]);

    const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
    const finalVideoUrl = playlistCandidates[currentSourceIndex] || videoUrl;
    const posterUrl = extractVideoThumbnail(videoEmbed as any) || undefined;
    


    // Determine if video should be blurred
    const shouldBlur = feedService.isVideoBlurred(post.uri, !!moderationDecision?.blur);

    // Calculate overlay opacity based on various factors - optimized for scroll performance
    const overlayOpacity = useMemo(() => {
      if (shouldBlur) return 1;
      if (videoState.customDimLevel > 0) return videoState.customDimLevel;
      // Apply automatic dimming for non-active videos
      if (videoDimLevel > 0) return videoDimLevel;
      return 0;
    }, [shouldBlur, videoState.customDimLevel, videoDimLevel]);

    // Use tab visibility system to determine if video should play
    const { shouldPlay: shouldPlayFromTab } = useVideoPlaybackState(isVisible);
    
    // Determine if video should play
    const shouldPlayVideo = useMemo(() => {
      if (shouldDisablePlayback || videoState.hasError || videoState.userPaused) return false;
      return shouldPlayFromTab && isVisible;
    }, [shouldDisablePlayback, videoState.hasError, videoState.userPaused, shouldPlayFromTab, isVisible]);

    // Register video with playback store
    useEffect(() => {
      if (finalVideoUrl) {
        registerVideo(videoId, finalVideoUrl);
      }
      return () => {
        unregisterVideo(videoId);
      };
    }, [videoId, finalVideoUrl, registerVideo, unregisterVideo]);

    // Update playback store when video state changes
    useEffect(() => {
      setVideoPlaying(videoId, shouldPlayVideo);
    }, [videoId, shouldPlayVideo, setVideoPlaying]);

    useEffect(() => {
      setVideoBuffering(videoId, videoState.isBuffering);
    }, [videoId, videoState.isBuffering, setVideoBuffering]);

    // Simplified progress tracking - reduced frequency for better performance
    useEffect(() => {
      if (shouldPlayVideo && videoState.duration > 0) {
        progressUpdateInterval.current = setInterval(() => {
          if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime?.() || 0;
            const duration = playerRef.current.getDuration?.() || videoState.duration;
            const progress = duration > 0 ? currentTime / duration : 0;
            
            setVideoState(prev => ({
              ...prev,
              currentPosition: currentTime,
              progress,
            }));
            
            updateVideoProgress(videoId, progress, currentTime, duration);
            
            // Mark as watched if progress > 80%
            if (progress > 0.8) {
              markVideoAsWatched(videoId);
              WatchHistory.addToWatchHistory(post.uri);
            }
          }
        }, VIDEO_CONFIG.PROGRESS_UPDATE_INTERVAL);
      } else {
        if (progressUpdateInterval.current) {
          clearInterval(progressUpdateInterval.current);
          progressUpdateInterval.current = null;
        }
      }

      return () => {
        if (progressUpdateInterval.current) {
          clearInterval(progressUpdateInterval.current);
          progressUpdateInterval.current = null;
        }
      };
    }, [shouldPlayVideo, videoState.duration, videoId, updateVideoProgress, markVideoAsWatched, post.uri]);

    // Reset state when video changes for proper FlashList recycling
    useRecyclingState(null, [post.uri], () => {
      setVideoState({
        hasError: false,
        userPaused: false,
        isReady: false,
        isBuffering: false,
        progress: 0,
        duration: 0,
        currentPosition: 0,
        customDimLevel: 0,
      });
      setCurrentSourceIndex(0);
    });

    // Expose methods via ref
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
      getPlayState: () => shouldPlayVideo
    }));

    // Safety check for video-specific component
    if (!finalVideoUrl) {
      console.log('No video URL found for post:', post.uri, 'embed:', post.embed);
      return null;
    }

    // Always render video component when visible to ensure it can load
    // This is essential for video playback to work
    const shouldRenderVideo = isVisible;

    return (
      <View style={[styles.container, { width: displayWidth, height: displayHeight }]}>
        <TouchableWithoutFeedback onPress={() => setVideoState(prev => ({ ...prev, userPaused: !prev.userPaused }))}>
          <View style={styles.videoContainer} pointerEvents="box-none">
            {/* Always show thumbnail first to prevent black frame */}
            {posterUrl && (
              <Image
                source={{ uri: posterUrl }}
                style={{ 
                  width: displayWidth, 
                  height: displayHeight,
                  position: 'absolute',
                  zIndex: 1
                }}
                resizeMode="contain"
              />
            )}
            
            {/* Video component - will overlay on top of thumbnail */}
            {finalVideoUrl && shouldRenderVideo && (
              <Video
                key={post.uri}
                ref={playerRef}
                source={{ uri: finalVideoUrl }}
                style={{ 
                  width: displayWidth, 
                  height: displayHeight,
                  position: 'absolute',
                  zIndex: 2
                }}
                repeat={true}
                paused={!shouldPlayVideo}
                muted={false}
                resizeMode="contain"
                bufferConfig={VIDEO_CONFIG.BUFFER_CONFIG}
                onLoadStart={() => {
                  onVideoStatus?.(post.uri, 'loading');
                }}
                onLoad={(data) => {
                  setVideoState(prev => ({ 
                    ...prev, 
                    isReady: true, 
                    duration: data.duration || 0 
                  }));
                  onVideoStatus?.(post.uri, 'loaded');
                }}
                onReadyForDisplay={() => {
                  // Video is ready to display - this ensures smooth transition from thumbnail
                  onVideoStatus?.(post.uri, 'ready');
                }}
                onProgress={(data) => {
                  // Only update progress if video is playing to reduce re-renders
                  if (shouldPlayVideo) {
                    const progress = data.playableDuration > 0 ? data.currentTime / data.playableDuration : 0;
                    setVideoState(prev => ({
                      ...prev,
                      currentPosition: data.currentTime,
                      progress,
                    }));
                  }
                }}
                onBuffer={(data) => {
                  setVideoState(prev => ({ ...prev, isBuffering: data.isBuffering }));
                }}
                onError={(error) => {
                  console.warn('Video error:', error);
                  setVideoState(prev => ({ ...prev, hasError: true }));
                  onVideoStatus?.(post.uri, 'error');
                  
                  // Try next source if available
                  if (currentSourceIndex < playlistCandidates.length - 1) {
                    setCurrentSourceIndex(prev => prev + 1);
                  }
                }}
                onEnd={() => {
                  // Reset to beginning for loop
                  if (playerRef.current) {
                    playerRef.current.seek(0);
                  }
                }}
              />
            )}
            
            {/* Loading indicator */}
            {videoState.isBuffering && shouldPlayVideo && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.white} />
              </View>
            )}
            
            {/* Blur overlay for content warnings */}
            {shouldBlur && (
              <BlurView intensity={20} style={styles.blurOverlay}>
                <View style={styles.warningContainer}>
                  <Icon name="warning" size={48} color={Colors.white} />
                  <Text style={styles.warningText}>
                    {moderationDecision?.reason || 'Content Warning'}
                  </Text>
                </View>
              </BlurView>
            )}
            
            {/* Custom dim overlay */}
            {overlayOpacity > 0 && (
              <View style={[styles.dimOverlay, { opacity: overlayOpacity }]} />
            )}
          </View>
        </TouchableWithoutFeedback>
        
        {/* Integrated VideoOverlay */}
        {overlayPost && (
          <VideoOverlay 
            post={overlayPost}
            isVisible={overlayVisible}
            prefetchProfile={overlayPrefetchProfile}
            videoRef={{ current: { 
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
              getPlayState: () => shouldPlayVideo
            } } as React.RefObject<VideoCardRef>}
            feedOption={overlayFeedOption}
            sourceFeed={overlaySourceFeed}
            isModal={overlayIsModal}
            onScrubbingChange={overlayOnScrubbingChange}
            progressBarAtCardBottom={overlayProgressBarAtCardBottom}
          />
        )}
      </View>
    );
  }
));

interface VideoCardProps extends CachedVideoCardProps {
  shouldCache: boolean;
}

const VideoCard = forwardRef<VideoCardRef, VideoCardProps>(
  ({ 
    post, 
    isVisible, 
    onVideoStatus, 
    shouldCache, 
    height, 
    moderationDecision, 
    shouldDisablePlayback, 
    isPlaying: shouldPlay = false,
    // Overlay props to pass through
    overlayPost,
    overlayVisible,
    overlayPrefetchProfile,
    overlayFeedOption,
    overlaySourceFeed,
    overlayIsModal,
    overlayOnScrubbingChange,
    overlayProgressBarAtCardBottom
  }, ref) => {
    
    const insets = useSafeAreaInsets();
    const isSmallDevice = isSmallScreen() || isTablet();
    
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    
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
          // Pass through overlay props
          overlayPost={overlayPost}
          overlayVisible={overlayVisible}
          overlayPrefetchProfile={overlayPrefetchProfile}
          overlayFeedOption={overlayFeedOption}
          overlaySourceFeed={overlaySourceFeed}
          overlayIsModal={overlayIsModal}
          overlayOnScrubbingChange={overlayOnScrubbingChange}
          overlayProgressBarAtCardBottom={overlayProgressBarAtCardBottom}
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
    overflow: 'hidden',
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
  warningContainer: {
    alignItems: 'center',
    padding: 20,
  },
  warningText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
});

// Optimized memo comparison for FlashList performance
export default React.memo(VideoCard, (prevProps, nextProps) => {
  // Only re-render on essential changes for smooth scrolling
  if (prevProps.post.uri !== nextProps.post.uri) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.isPlaying !== nextProps.isPlaying) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.shouldDisablePlayback !== nextProps.shouldDisablePlayback) return false;
  if (prevProps.moderationDecision?.blur !== nextProps.moderationDecision?.blur) return false;
  if (prevProps.overlayVisible !== nextProps.overlayVisible) return false;
  
  // Avoid re-rendering for scroll position changes during scrolling
  return true;
});