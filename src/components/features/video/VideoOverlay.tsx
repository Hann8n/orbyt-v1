import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated as RNAnimated,
  Dimensions,
  TouchableWithoutFeedback,
  ImageSourcePropType,
  Pressable,
} from 'react-native';
import { PanGestureHandler, GestureHandlerRootView, PanGestureHandlerGestureEvent, HandlerStateChangeEvent, PanGestureHandlerEventPayload, State as GestureState } from 'react-native-gesture-handler';
import AtprotoService from '../../../services/api/AtprotoService';
import CommentSection from '../../features/comments/CommentSection';
import ShareSheet from '../../ui/ShareSheet';
import { VideoCardRef } from './VideoCard';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import ProfileCache, { profileKeys, useProfileColors } from '../../../services/cache/ProfileCache';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import Icon from '../../ui/Icon';
import { queryKeys } from '../../../services/queryKeys';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Extrapolate,
  runOnJS
} from 'react-native-reanimated';
import { TEXT, BRAND, INTERACTIVE, PROFILE, OVERLAY } from '../../../utils/formatting/Colors';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import VerificationBadge from '../verification/VerificationBadge';
import { extractVideoUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import RelativeDate from '../../ui/RelativeDate';
import { format } from 'date-fns';
import { useClearView } from '../../../services/ClearViewContext';

// Define RootParamList type for navigation
type RootParamList = {
  Main: undefined;
  AuthorProfile: { handle: string };
};

interface Author {
  avatar?: string;
  displayName?: string;
  handle?: string;
  did?: string;
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

interface VideoOverlayProps {
  post: Post;
  videoRef?: React.RefObject<VideoCardRef>;
  isVisible: boolean;
  scrollY: Animated.SharedValue<number>;
  prefetchProfile?: boolean;
  feedOption?: 'yourMix' | 'following' | 'discover';
  isModal?: boolean;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  progressBarAtCardBottom?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const DEFAULT_PROFILE_COLOR = PROFILE.DEFAULT_RING;

// Memoized heart animation frames
const heartAnimationFrames: ImageSourcePropType[] = [
  require('../../../assets/Heart Animation/Heart-0.png'),
  require('../../../assets/Heart Animation/Heart-1.png'),
  require('../../../assets/Heart Animation/Heart-2.png'),
  require('../../../assets/Heart Animation/Heart-3.png'),
  require('../../../assets/Heart Animation/Heart-4.png'),
  require('../../../assets/Heart Animation/Heart-5.png'),
  require('../../../assets/Heart Animation/Heart-6.png'),
  require('../../../assets/Heart Animation/Heart-7.png'),
  require('../../../assets/Heart Animation/Heart-8.png'),
  require('../../../assets/Heart Animation/Heart-9.png'),
  require('../../../assets/Heart Animation/Heart-10.png'),
  require('../../../assets/Heart Animation/Heart-11.png'),
  require('../../../assets/Heart Animation/Heart-12.png'),
  require('../../../assets/Heart Animation/Heart-13.png'),
  require('../../../assets/Heart Animation/Heart-14.png'),
];

// Format ms to mm:ss
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Optimized VideoOverlay component with reduced state and memoization
const VideoOverlay: React.FC<VideoOverlayProps> = ({ post, videoRef, isVisible, scrollY, prefetchProfile, feedOption, isModal, onScrubbingChange, progressBarAtCardBottom }) => {
  const isTabletDevice = isTablet();
  const isSmallDevice = isSmallScreen() || isTablet();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const { isClearViewMode } = useClearView();
  
  // --- Progress Bar State ---
  const [progress, setProgress] = useState(0); // 0-1 float
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrubProgress = useSharedValue(0); // 0-1 float
  const [scrubTime, setScrubTime] = useState(0); // ms
  const [duration, setDuration] = useState(0); // ms
  const [wasPlayingBeforeScrub, setWasPlayingBeforeScrub] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0); // NEW: cache width

  // Animated values for progress bar height and color
  const progressBarHeight = useSharedValue(2); // thinner default height
  // The background bar color is always nearly transparent white (more transparent now)
  const progressBarColor = 'rgba(255,255,255,0.05)';

  useEffect(() => {
    if (isScrubbing) {
      progressBarHeight.value = withTiming(8, { duration: 120 }); // slightly thinner when scrubbing
    } else {
      progressBarHeight.value = withTiming(2, { duration: 120 });
    }
  }, [isScrubbing, progressBarHeight]);

  const animatedProgressBarStyle = useAnimatedStyle(() => ({
    height: progressBarHeight.value,
    backgroundColor: progressBarColor,
    borderRadius: 2,
  }));

  const animatedProgressFillStyle = useAnimatedStyle(() => ({
    width: `${Math.round((isScrubbing ? scrubProgress.value : progress) * 100)}%`,
    height: '100%',
    backgroundColor: isScrubbing ? '#fff' : 'rgba(255,255,255,0.8)',
    borderRadius: 2,
  }));

  // Poll progress and duration from videoRef
  useEffect(() => {
    if (!videoRef?.current) return;
    let interval: NodeJS.Timeout | null = null;
    if (isVisible && !isScrubbing) {
      interval = setInterval(() => {
        if (videoRef?.current && typeof videoRef.current.getProgress === 'function') {
          const p = videoRef.current.getProgress();
          setProgress(isNaN(p) ? 0 : Math.max(0, Math.min(1, p)));
        }
        if (videoRef?.current && typeof videoRef.current.getDuration === 'function') {
          const d = videoRef.current.getDuration();
          setDuration(isNaN(d) ? 0 : d);
        }
      }, 100);
    } else if (!isVisible) {
      setProgress(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [videoRef, isVisible, isScrubbing]);

  // Ensure duration is set when scrubbing starts
  useEffect(() => {
    if (isScrubbing && videoRef?.current) {
      const d = videoRef.current.getDuration();
      if (d && d > 0) {
        setDuration(d);
      }
    }
  }, [isScrubbing, videoRef]);

  // --- Scrubbing Handlers ---
  const progressBarRef = useRef<View>(null);
  const PROGRESS_TOUCH_HEIGHT = 24;
  const PROGRESS_BAR_HEIGHT = 4;

  // NEW: onLayout handler to cache width
  const handleProgressBarLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    setProgressBarWidth(event.nativeEvent.layout.width);
  }, []);

  // PanGestureHandler state - optimized to reduce scroll interference
  const handlePanGesture = (event: PanGestureHandlerGestureEvent) => {
    if (!videoRef?.current || progressBarWidth === 0) return;
    const touchX = event.nativeEvent.x;
    let p = Math.max(0, Math.min(1, touchX / progressBarWidth));
    scrubProgress.value = p;
    if (videoRef?.current?.getDuration) {
      const t = p * videoRef.current.getDuration();
      // Use runOnJS to prevent blocking scroll events
      runOnJS(setScrubTime)(t);
    }
  };

  // Handler for gesture state changes (start/end) - optimized
  const handlePanStateChange = (event: HandlerStateChangeEvent<PanGestureHandlerEventPayload>) => {
    const state = event.nativeEvent.state;
    if (state === GestureState.BEGAN) {
      // Start scrubbing
      if (!videoRef?.current || progressBarWidth === 0) return;
      setIsScrubbing(true);
      onScrubbingChange?.(true);
      setWasPlayingBeforeScrub(videoRef.current.getPlayState());
      videoRef.current.playPause(false);
      setDuration(videoRef.current.getDuration());
      const touchX = event.nativeEvent.x;
      let p = Math.max(0, Math.min(1, touchX / progressBarWidth));
      scrubProgress.value = p;
      if (videoRef?.current?.getDuration) {
        const t = p * videoRef.current.getDuration();
        runOnJS(setScrubTime)(t);
      }
    } else if (
      state === GestureState.END ||
      state === GestureState.CANCELLED ||
      state === GestureState.FAILED
    ) {
      // End scrubbing - optimized to prevent blocking scroll
      if (!videoRef?.current) {
        setIsScrubbing(false);
        onScrubbingChange?.(false);
        return;
      }
      // Use requestAnimationFrame to prevent blocking scroll events
      requestAnimationFrame(() => {
        videoRef.current?.seek(scrubProgress.value);
      });
      setIsScrubbing(false);
      onScrubbingChange?.(false);
      setProgress(scrubProgress.value);
      if (wasPlayingBeforeScrub) {
        requestAnimationFrame(() => {
          videoRef.current?.playPause(true);
        });
      }
      setTimeout(() => {
        scrubProgress.value = 0;
        runOnJS(setScrubTime)(0);
      }, 200);
    }
  };

  // Memoize author and record to prevent unnecessary re-renders
  const author = useMemo(() => post.author || {}, [post.author]);
  const record = useMemo(() => post.record || {}, [post.record]);

  // Get profile colors for the author (unified with ProfileHeader logic)
  const { colors: profileColors } = useProfileColors(author.handle);
  
  // Memoize profile picture URL
  const profilePicUrl = useMemo(() => 
    author.avatar && author.avatar.startsWith('http')
      ? author.avatar
      : 'https://via.placeholder.com/40',
    [author.avatar]
  );

  // Simplified state management
  const [isLiked, setIsLiked] = useState<boolean>(!!post.viewer?.like);
  const [likeCount, setLikeCount] = useState<number>(post.likeCount || 0);
  const [isReposted, setIsReposted] = useState<boolean>(!!post.viewer?.repost);
  const [repostCount, setRepostCount] = useState<number>(post.repostCount || 0);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [showShareSheet, setShowShareSheet] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [needsCollapsing, setNeedsCollapsing] = useState<boolean>(false);
  const [isAnimatingHeart, setIsAnimatingHeart] = useState<boolean>(false);
  const [isLikePending, setIsLikePending] = useState<boolean>(false);
  const [isRepostPending, setIsRepostPending] = useState<boolean>(false);
  
  // Refs for animations
  const heartAnimationTimer = useRef<NodeJS.Timeout | null>(null);
  const heartScale = useSharedValue(1);
  const repostScale = useSharedValue(1);
  
  const navigation = useNavigation<NavigationProp<RootParamList>>();
  const queryClient = useQueryClient();
  
  // Simplified overlay visibility animation - always visible on small screens
  const overlayOpacity = useSharedValue(isVisible || isSmallDevice ? 1 : 0);
  
  useEffect(() => {
    // On small devices, always show the overlay unless in clear view mode
    if (isSmallDevice && isClearViewMode) {
      overlayOpacity.value = 0;
    } else if (isSmallDevice) {
      overlayOpacity.value = 1;
    } else {
      overlayOpacity.value = withTiming(isVisible ? 1 : 0, { duration: 150 });
    }
  }, [isVisible, overlayOpacity, isSmallDevice, isClearViewMode]);
  
  // Optimized profile query with better caching
  const { data: profileData } = useQuery({
    queryKey: author.handle ? profileKeys.detail(author.handle) : ['profiles', 'detail', ''],
    queryFn: async () => {
      if (!author.handle) return null;
      return await ProfileCache.getProfile(author.handle);
    },
    refetchOnWindowFocus: false,
    staleTime: ProfileCache.cacheExpiry,
    gcTime: 5 * 60 * 1000,
    enabled: Boolean(author.handle),
    initialData: () => author.handle ? queryClient.getQueryData(profileKeys.detail(author.handle)) : null
  });

  // Memoize text collapsing logic
  useEffect(() => {
    if (record.text && record.text.length > 80) {
      setNeedsCollapsing(true);
    } else {
      setNeedsCollapsing(false);
    }
    setIsCollapsed(true); // Always collapse by default
  }, [record.text]);

  // Simplified profile prefetching
  useEffect(() => {
    if (prefetchProfile && author.handle && profileData) {
      // Profile is already cached, no need for additional prefetching
    }
  }, [prefetchProfile, author.handle, profileData]);

  // Memoized animation functions
  const animateHeart = useCallback(() => {
    if (isAnimatingHeart) return;
    
    setIsAnimatingHeart(true);
    heartScale.value = withSequence(
      withSpring(1.3, { duration: 100 }),
      withSpring(1, { duration: 100 })
    );
    
    heartAnimationTimer.current = setTimeout(() => {
      setIsAnimatingHeart(false);
    }, 200);
  }, [heartScale, isAnimatingHeart]);

  const animateRepost = useCallback(() => {
    repostScale.value = withSequence(
      withSpring(1.2, { duration: 100 }),
      withSpring(1, { duration: 100 })
    );
  }, [repostScale]);

  // Memoized event handlers
  const handleLike = useCallback(async () => {
    if (isLikePending) return;
    
    setIsLikePending(true);
    animateHeart();
    
    try {
      const newIsLiked = !isLiked;
      setIsLiked(newIsLiked);
      setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);
      
      if (newIsLiked) {
        await AtprotoService.likePost(post.uri, post.cid || '');
      } else {
        if (post.viewer?.like) {
          await AtprotoService.deleteLike(post.viewer.like);
        }
      }
    } catch (error) {
      // Revert on error
      setIsLiked(isLiked);
      setLikeCount(prev => isLiked ? prev + 1 : prev - 1);
      console.warn('Like error:', error);
    } finally {
      setIsLikePending(false);
    }
  }, [isLiked, isLikePending, post.uri, post.cid, post.viewer?.like, animateHeart]);

  const handleRepost = useCallback(async () => {
    if (isRepostPending) return;
    
    setIsRepostPending(true);
    animateRepost();
    
    try {
      const newIsReposted = !isReposted;
      setIsReposted(newIsReposted);
      setRepostCount(prev => newIsReposted ? prev + 1 : prev - 1);
      
      if (newIsReposted) {
        await AtprotoService.repostPost(post.uri, post.cid || '');
      } else {
        if (post.viewer?.repost) {
          await AtprotoService.deleteRepost(post.viewer.repost);
        }
      }
    } catch (error) {
      // Revert on error
      setIsReposted(isReposted);
      setRepostCount(prev => isReposted ? prev + 1 : prev - 1);
      console.warn('Repost error:', error);
    } finally {
      setIsRepostPending(false);
    }
  }, [isReposted, isRepostPending, post.uri, post.cid, post.viewer?.repost, animateRepost]);

  const handleCommentPress = useCallback(() => {
    setShowComments(true);
  }, []);

  const handleSharePress = useCallback(() => {
    setShowShareSheet(true);
  }, []);

  const handleRepostAuthorPress = useCallback(() => {
    if (post.repostedBy?.handle) {
      navigation.navigate("AuthorProfile", { handle: post.repostedBy.handle });
    }
  }, [post.repostedBy?.handle, navigation]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const handleCloseComments = useCallback(() => {
    setShowComments(false);
  }, []);

  // Memoized animated styles
  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }]
  }));
  
  const repostAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: repostScale.value }]
  }));

  const animatedOverlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value
  }));

  // Memoized UI components
  const likeIcon = useMemo(() => (
    <Animated.View style={isLiked ? heartAnimatedStyle : undefined}>
      {isAnimatingHeart ? (
        <Image 
          source={heartAnimationFrames[Math.floor(Math.random() * heartAnimationFrames.length)]}
          style={[styles.icon, isTabletDevice && styles.iconTablet, { tintColor: INTERACTIVE.HEART.ACTIVE }]} 
        />
      ) : isLiked ? (
        <Image 
          source={require('../../../assets/PostActions/Heart-PixelArtIconx3.png')} 
          style={[styles.icon, isTabletDevice && styles.iconTablet, { tintColor: INTERACTIVE.HEART.ACTIVE }]} 
        />
      ) : (
        <Image 
          source={require('../../../assets/PostActions/Heart-PixelArtIconx3.png')} 
          style={[styles.icon, isTabletDevice && styles.iconTablet, { tintColor: BRAND.SECONDARY }]} 
        />
      )}
    </Animated.View>
  ), [isLiked, isAnimatingHeart, heartAnimatedStyle, isTabletDevice]);

  const repostIcon = useMemo(() => (
    <Animated.View style={isReposted ? repostAnimatedStyle : undefined}>
      {isReposted ? (
        <Icon name="repeat" size={isTabletDevice ? 34 : 30} color={INTERACTIVE.REPOST.ACTIVE} />
      ) : (
        <Icon name="repeat" size={isTabletDevice ? 34 : 30} color={INTERACTIVE.REPOST.INACTIVE} />
      )}
    </Animated.View>
  ), [isReposted, repostAnimatedStyle, isTabletDevice]);

  const commentIcon = useMemo(() => (
    <Image 
      source={require('../../../assets/PostActions/Comments-PixelArtIcon-x3.png')} 
      style={[styles.icon, isTabletDevice && styles.iconTablet, { tintColor: INTERACTIVE.COMMENT }]} 
    />
  ), [isTabletDevice]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartAnimationTimer.current) {
        clearTimeout(heartAnimationTimer.current);
      }
    };
  }, []);

  return (
    <Animated.View style={[styles.container, animatedOverlayStyle]}>
      {/* Hide overlay content while scrubbing */}
      {!isScrubbing && (
        <>
          {/* Orbyt Pixel Art Icon Overlay */}
          {(!isCollapsed && needsCollapsing) && (
            <Animated.View 
              style={styles.fullScreenDimOverlay}
              pointerEvents="none"
            />
          )}
          
          <Animated.View style={[
            styles.overlayContentContainer,
            isModal ? { bottom: 0 } : (isSmallDevice ? { bottom: bottomNavBarHeight } : {}),
            progressBarAtCardBottom ? { paddingBottom: 15 } : {},
          ]}>
            <View style={styles.infoColumn}>
              {post.repostedBy && (
                <TouchableOpacity 
                  style={styles.repostIndicatorContainer} 
                  onPress={handleRepostAuthorPress}
                  activeOpacity={0.7}
                >
                  <Icon name="repeat" size={22} color={INTERACTIVE.REPOST.ACTIVE} />
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Text style={
                      isTabletDevice
                        ? styles.repostIndicatorTextTablet
                        : styles.repostIndicatorText
                    }>
                      {post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown'} reposted
                    </Text>
                    {post.repostedBy?.handle && (
                      <VerificationBadge 
                        handle={post.repostedBy.handle} 
                        textSize={isTabletDevice ? 16 : 14} 
                        style={{ marginLeft: 4 }}
                        textColor={styles.repostIndicatorText.color}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              )}
              
              {record.text && (
                <View style={styles.descriptionContainer}>
                  <TouchableOpacity onPress={toggleCollapsed} activeOpacity={0.8}>
                    <TextWithAuthorLinks
                      text={record.text}
                      style={styles.descriptionText}
                      numberOfLines={isCollapsed ? 1 : undefined}
                      onAuthorPress={(handle) => navigation.navigate("AuthorProfile", { handle })}
                    />
                  </TouchableOpacity>
                  {/* Expanded info below description */}
                  {!isCollapsed && (
                    <View style={styles.expandedInfoContainer}>
                      <View style={styles.expandedDivider} />
                      <View style={styles.expandedRow}>
                        {post.record?.metadata?.orbyt === true && (
                          <View style={styles.expandedPlatformRow}>
                            <Icon name="device-tv" size={isTabletDevice ? 22 : 18} color="#FFD600" style={styles.expandedPlatformIcon} />
                            <Text style={isTabletDevice ? styles.expandedPlatformTextTablet : styles.expandedPlatformText}>
                              {post.record?.metadata?.platform || 'Posted via orbyt'}
                            </Text>
                          </View>
                        )}
                        {post.record?.createdAt && (
                          <Text style={isTabletDevice ? styles.expandedDateTablet : styles.expandedDate}>
                            {format(new Date(post.record.createdAt), 'MMM d, yyyy, h:mm a')}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}
              
              <TouchableOpacity
                onPress={() =>
                  author.handle &&
                  navigation.navigate("AuthorProfile", { handle: author.handle })
                }
                style={styles.authorInfoContainer}
              >
                <Image
                  source={{ uri: profilePicUrl }}
                  style={[
                    isTabletDevice
                      ? styles.profilePictureTablet
                      : isSmallDevice
                        ? styles.profilePictureSmallScreen
                        : styles.profilePicture,
                    { borderColor: profileColors.foregroundColor }
                  ]}
                />
                <View style={styles.authorTextContainer}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Text style={
                      isTabletDevice
                        ? styles.authorNameTablet
                        : isSmallDevice
                          ? styles.authorNameSmallScreen
                          : styles.authorName
                    }>
                      {author.displayName || author.handle || 'Unknown'}
                    </Text>
                    {author.handle && <VerificationBadge 
                      handle={author.handle} 
                      textSize={isTabletDevice ? 16 : 14} 
                      textColor={BRAND.SECONDARY}
                    />}
                  </View>
                  <Text style={
                    isTabletDevice
                      ? styles.authorHandleTablet
                      : isSmallDevice
                        ? styles.authorHandleSmallScreen
                        : styles.authorHandle
                  }>
                    @{author.handle || 'unknown'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            
            <View style={styles.actionsContainer}>
              <TouchableOpacity 
                style={
                  isTabletDevice
                    ? styles.actionButtonTablet
                    : isSmallDevice
                      ? styles.actionButtonSmallScreen
                      : styles.actionButton
                } 
                onPress={handleSharePress}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <Icon name="more-horizontal" size={isTabletDevice ? 32 : 28} color={BRAND.SECONDARY} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  isTabletDevice
                    ? styles.actionButtonTablet
                    : isSmallDevice
                      ? styles.actionButtonSmallScreen
                      : styles.actionButton,
                  isRepostPending && styles.actionButtonDisabled
                ]} 
                onPress={handleRepost}
                disabled={isRepostPending}
                activeOpacity={0.7}
              >
                {repostIcon}
                <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(repostCount)}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={
                  isTabletDevice
                    ? styles.actionButtonTablet
                    : isSmallDevice
                      ? styles.actionButtonSmallScreen
                      : styles.actionButton
                } 
                onPress={handleCommentPress}
                activeOpacity={0.7}
              >
                {commentIcon}
                <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(post.replyCount || 0)}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  isTabletDevice
                    ? styles.actionButtonTablet
                    : isSmallDevice
                      ? styles.actionButtonSmallScreen
                      : styles.actionButton,
                  isLikePending && styles.actionButtonDisabled
                ]} 
                onPress={handleLike}
                disabled={isLikePending}
                activeOpacity={0.7}
              >
                {likeIcon}
                <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(likeCount)}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </>
      )}
      {isScrubbing && !isClearViewMode && (
        <View
          style={[
            styles.timeTrackingContainer,
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: progressBarAtCardBottom ? 36 : (isTabletDevice ? bottomNavBarHeight + 36 : insets.bottom + bottomNavBarHeight + 36), // above progress bar
              zIndex: 200,
              alignItems: 'center',
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.timeTrackingText}>
            <Text style={styles.timeCurrent}>{formatTime(Math.round(scrubTime))}</Text>
            <Text style={styles.timeDivider}> / </Text>
            <Text style={styles.timeTotal}>{formatTime(Math.round(duration))}</Text>
          </Text>
        </View>
      )}
      {/* Progress Bar Divider (Touchable for scrubbing) - hide in clear view mode */}
      {!isClearViewMode && (
        <PanGestureHandler
          onGestureEvent={handlePanGesture}
          onHandlerStateChange={handlePanStateChange}
          shouldCancelWhenOutside={false}
          activeOffsetX={[-10, 10]}
          activeOffsetY={[-10, 10]}
        >
          <View
            ref={progressBarRef}
            onLayout={handleProgressBarLayout} // NEW: cache width
            style={[
              styles.progressBarTouchableArea,
              {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: progressBarAtCardBottom ? 5 : (isTabletDevice ? bottomNavBarHeight : insets.bottom + bottomNavBarHeight),
                height: 24,
                zIndex: 100,
              },
            ]}
            pointerEvents="auto"
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  overflow: 'hidden',
                },
                animatedProgressBarStyle,
              ]}
            >
              <Animated.View style={animatedProgressFillStyle} />
            </Animated.View>
          </View>
        </PanGestureHandler>
      )}
      
      <Modal
        animationType="none"
        transparent={true}
        visible={showComments}
        onRequestClose={handleCloseComments}
      >
        <View style={{ flex: 1 }}>
          <TouchableOpacity 
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            }} 
            activeOpacity={1} 
            onPress={handleCloseComments} 
          />
          <CommentSection 
            post={post} 
            onDismiss={handleCloseComments}
            visible={showComments}
            totalLikes={likeCount}
            totalComments={post.replyCount || 0}
          />
        </View>
      </Modal>
      
      <ShareSheet
        visible={showShareSheet}
        onDismiss={() => setShowShareSheet(false)}
        postUri={post.uri}
        postCid={post.cid}
        authorDid={post.author?.did || ''}
        feedOption={feedOption}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  tvIconOverlay: {
    position: 'absolute',
    left: 16,
    bottom: 80,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    padding: 4,
  },
  tvIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  fullScreenDimOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: OVERLAY.DIM,
    zIndex: 1,
  },
  overlayContentContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 0,
  },

  infoColumn: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    marginBottom: 0,
  },
  repostIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  repostIndicatorIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    tintColor: INTERACTIVE.REPOST.ACTIVE,
    marginRight: 8,
  },
  repostIndicatorText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginLeft: 4,
  },
  descriptionContainer: {
    marginBottom: 4,
    paddingRight: 10,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  descriptionText: {
    color: BRAND.SECONDARY,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  profilePicture: {
    width: 45,
    height: 45,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: PROFILE.DEFAULT_RING,
  },
  profilePictureSmallScreen: {
    width: 42,
    height: 42,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: PROFILE.DEFAULT_RING,
  },
  authorTextContainer: {
    marginLeft: 8,
    flex: 1,
    marginRight: 20,
  },
  authorName: {
    color: BRAND.SECONDARY,
    fontWeight: 'bold',
    fontSize: 16,
    fontFamily: 'Firma-Black',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 22,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameSmallScreen: {
    color: BRAND.SECONDARY,
    fontWeight: 'bold',
    fontSize: 15,
    fontFamily: 'Firma-Black',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 18,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorHandle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorHandleSmallScreen: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginLeft: 5,
    marginBottom: -6,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionButton: {
    alignItems: 'center',
    marginVertical: 5,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 32.5,
  },
  actionButtonSmallScreen: {
    alignItems: 'center',
    marginVertical: 3,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 32.5,
  },
  iconContainer: {
    width: 30.5,
    height: 30.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: BRAND.SECONDARY,
    fontSize: 12.5,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  icon: {
    width: 30,
    height: 30,
    alignSelf: 'center',
    resizeMode: 'contain',
  },
  authorLink: {
    fontFamily: 'Firma-SemiBold',
  },
  actionButtonDisabled: {
    // Removed opacity transparency effect
  },
  expandedInfoContainer: {
    marginTop: 6,
    paddingTop: 6,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
    borderRadius: 1,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expandedDate: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontFamily: 'Firma-Regular',
    marginRight: 8,
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  expandedPlatformRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandedPlatformIcon: {
    width: 18,
    height: 18,
    marginRight: 4,
    resizeMode: 'contain',
    tintColor: '#FFD600',
  },
  expandedPlatformText: {
    color: '#FFD600',
    fontSize: 13,
    fontFamily: 'Firma-SemiBold',
  },
  authorNameTablet: {
    color: BRAND.SECONDARY,
    fontWeight: 'bold',
    fontSize: 19, // was 26
    fontFamily: 'Firma-Black',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 25,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorHandleTablet: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16, // was 22
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionButtonTablet: {
    alignItems: 'center',
    marginVertical: 7, // was 10
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 40, // was 60
  },
  actionTextTablet: {
    color: BRAND.SECONDARY,
    fontSize: 15, // was 22
    marginTop: 3, // was 4
    textAlign: 'center',
    width: '100%',
    minWidth: 45, // was 60
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  iconTablet: {
    width: 36, // was 48
    height: 36, // was 48
    alignSelf: 'center',
    resizeMode: 'contain',
  },
  profilePictureTablet: {
    width: 54, // was 80
    height: 54, // was 80
    borderRadius: 27, // was 40
    borderWidth: 2,
    borderColor: PROFILE.DEFAULT_RING,
  },
  repostIndicatorTextTablet: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16, // was 22
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginLeft: 4,
  },
  expandedDateTablet: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 15, // was 20
    fontFamily: 'Firma-Regular',
    marginRight: 8,
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  expandedPlatformTextTablet: {
    color: '#FFD600',
    fontSize: 15, // was 20
    fontFamily: 'Firma-SemiBold',
  },
  progressBarTouchableArea: {
    width: '100%',
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  progressBarContainer: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  scrubInfoContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28, // 24px above the bar
    alignItems: 'center',
    zIndex: 200,
  },
  scrubInfoText: {
    color: '#FFD600',
    fontSize: 16,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  timeTrackingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  timeTrackingText: {
    flexDirection: 'row',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    fontFamily: 'Firma-Black',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timeCurrent: {
    color: '#fff',
    opacity: 1,
    fontSize: 22,
    fontWeight: 'bold',
  },
  timeDivider: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 20,
    fontWeight: 'bold',
  },
  timeTotal: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 20,
    fontWeight: 'bold',
  },

});

export default React.memo(VideoOverlay);