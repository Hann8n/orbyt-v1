import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AtprotoService from '../../../services/api/AtprotoService';
import CommentSection from '../comments/CommentSection';
import ShareSheet from '../../ui/ShareSheet';
import { VideoCardRef } from './VideoCard';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import ProfileCache, { profileKeys, useProfileColors, useFollowMutation, type CachedProfile } from '../../../services/cache/ProfileCache';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import Icon, { SlashIcon, HeartFillIcon, ChatFillIcon, RefreshFillIcon, MoreFillIcon, TvIcon } from '../../ui/Icon';
import { Avatar, Colors } from '../../ui/UI';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import VerificationBadge from '../verification/VerificationBadge';
import { isSmallScreen, isTablet, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import { useClearView } from '../../../stores/uiStore';
import { useChannelColors, useChannel } from '../../../services/cache/ChannelCache';
import { useRecyclingState } from '@shopify/flash-list';

// Define RootParamList type for navigation
type RootParamList = {
  Main: undefined;
  AuthorProfile: { handle: string };
  Channel: {
    uri: string;
    title?: string;
    description?: string;
    avatar?: string;
    creator?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
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
  prefetchProfile?: boolean;
  feedOption?: 'yourMix' | 'following' | 'discover';
  sourceFeed?: string;
  isModal?: boolean;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  progressBarAtCardBottom?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Map feed URIs to readable names
const getFeedDisplayName = (uri: string): string => {
  switch (uri) {
    case 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids':
      return 'for your consideration';
    case 'at://following':
      return 'following';
    default:
      if (uri.includes('/app.bsky.feed.generator/')) {
        const parts = uri.split('/app.bsky.feed.generator/');
        if (parts.length > 1) {
          const feedName = parts[1];
          return feedName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      }
      return 'Custom Feed';
  }
};

// Optimized VideoOverlay component with smooth transitions
const VideoOverlay: React.FC<VideoOverlayProps> = ({ 
  post, 
  videoRef, 
  isVisible, 
  prefetchProfile, 
  feedOption, 
  sourceFeed, 
  isModal, 
  onScrubbingChange, 
  progressBarAtCardBottom 
}) => {
  // Reset overlay state when video changes for proper FlashList recycling
  useRecyclingState(null, [post.uri], () => {
    // Reset any overlay-specific state here if needed
  });

  const isTabletDevice = isTablet();
  const isSmallDevice = isSmallScreen();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const { isClearViewMode } = useClearView();

  // Animated values for smooth transitions
  const fadeAnim = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isVisible ? 0 : 20)).current;

  // Simplified state management - removed complex animations and progress tracking
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [needsCollapsing, setNeedsCollapsing] = useState<boolean>(false);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [showShareSheet, setShowShareSheet] = useState<boolean>(false);
  const [isLikePending, setIsLikePending] = useState<boolean>(false);
  const [isRepostPending, setIsRepostPending] = useState<boolean>(false);

  // Memoize author and record to prevent unnecessary re-renders
  const author = useMemo(() => post.author || {}, [post.author]);
  const record = useMemo(() => post.record || {}, [post.record]);

  // Get profile colors for the author
  const { colors: profileColors } = useProfileColors(author.handle);
  
  // Memoize profile picture URL
  const profilePicUrl = useMemo(() => 
    author.avatar && author.avatar.startsWith('http')
      ? author.avatar
      : 'https://via.placeholder.com/40',
    [author.avatar]
  );

  // Simplified state management - removed complex progress tracking
  const [isLiked, setIsLiked] = useState<boolean>(!!post.viewer?.like);
  const [likeCount, setLikeCount] = useState<number>(post.likeCount || 0);
  const [isReposted, setIsReposted] = useState<boolean>(!!post.viewer?.repost);
  const [repostCount, setRepostCount] = useState<number>(post.repostCount || 0);
  
  const navigation = useNavigation<NavigationProp<RootParamList>>();
  const queryClient = useQueryClient();
  
  // Get current user data
  const { data: userData } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      return await AtprotoService.getCurrentUser();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Optimized profile query with better caching
  const { data: profileData } = useQuery<CachedProfile | null>({
    queryKey: author.handle ? profileKeys.detail(author.handle) : ['profiles', 'detail', ''],
    queryFn: async () => {
      if (!author.handle) return null;
      return await ProfileCache.getProfile(author.handle);
    },
    refetchOnWindowFocus: false,
    staleTime: ProfileCache.cacheExpiry,
    gcTime: 5 * 60 * 1000,
    enabled: Boolean(author.handle),
    initialData: () => author.handle ? (queryClient.getQueryData<CachedProfile>(profileKeys.detail(author.handle)) ?? null) : null
  });

  // Follow mutation hook
  const followMutation = useFollowMutation();

  // Check if current user is following the author
  const isFollowing = useMemo(() => {
    return !!profileData?.isFollowing;
  }, [profileData?.isFollowing]);

  // Check if this is the current user's own post
  const isOwnPost = useMemo(() => {
    return userData?.did === author.did;
  }, [userData?.did, author.did]);

  // Smooth visibility transitions - optimized for instant playback
  useEffect(() => {
    const duration = 150; // Reduced from 200ms for faster transitions
    
    if (isVisible) {
      // Fade in and slide up
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Fade out and slide down
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 20,
          duration,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible, fadeAnim, slideAnim]);

  // Handle follow action
  const handleFollowPress = useCallback(() => {
    if (!author.handle) return;
    
    followMutation.mutate({ handle: author.handle, isFollowing: !isFollowing });
  }, [author.handle, isFollowing, followMutation]);

  // Memoize text collapsing logic
  useEffect(() => {
    if (record.text && record.text.length > 80) {
      setNeedsCollapsing(true);
    } else {
      setNeedsCollapsing(false);
    }
    setIsCollapsed(true);
  }, [record.text]);

  // Memoized event handlers - simplified without animations
  const handleLike = useCallback(async () => {
    if (isLikePending) return;
    
    setIsLikePending(true);
    
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
      setIsLiked(isLiked);
      setLikeCount(prev => isLiked ? prev + 1 : prev - 1);
      console.warn('Like error:', error);
    } finally {
      setIsLikePending(false);
    }
  }, [isLiked, isLikePending, post.uri, post.cid, post.viewer?.like]);

  const handleRepost = useCallback(async () => {
    if (isRepostPending) return;
    
    setIsRepostPending(true);
    
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
      setIsReposted(isReposted);
      setRepostCount(prev => isReposted ? prev + 1 : prev - 1);
      console.warn('Repost error:', error);
    } finally {
      setIsRepostPending(false);
    }
  }, [isReposted, isRepostPending, post.uri, post.cid, post.viewer?.repost]);

  const handleCommentPress = useCallback(() => {
    setShowComments(true);
  }, []);

  const handleSharePress = useCallback(() => {
    setShowShareSheet(true);
  }, []);

  // Centralized navigation to author profile
  const navigateToAuthorProfile = useCallback((targetHandle?: string | null) => {
    const cleanHandle = (targetHandle || '').trim();
    if (!cleanHandle) return;
    let rootNav: any = navigation as any;
    while (rootNav?.getParent?.()) {
      rootNav = rootNav.getParent();
    }
    rootNav?.navigate?.('AuthorProfile', { handle: cleanHandle });
  }, [navigation]);

  const handleRepostAuthorPress = useCallback(() => {
    if (post.repostedBy?.handle) {
      navigateToAuthorProfile(post.repostedBy.handle);
    }
  }, [post.repostedBy?.handle, navigateToAuthorProfile]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const handleCloseComments = useCallback(() => {
    setShowComments(false);
  }, []);

  // Memoized UI components - simplified without animations
  const likeIcon = useMemo(() => (
    <HeartFillIcon 
      size={isTabletDevice ? 38 : 34} 
      color={isLiked ? Colors.INTERACTIVE.HEART.ACTIVE : Colors.white} 
    />
  ), [isLiked, isTabletDevice]);

  const repostIcon = useMemo(() => (
    <RefreshFillIcon 
      size={isTabletDevice ? 38 : 34} 
      color={isReposted ? Colors.INTERACTIVE.REPOST.ACTIVE : Colors.INTERACTIVE.REPOST.INACTIVE} 
    />
  ), [isReposted, isTabletDevice]);

  const commentIcon = useMemo(() => (
    <ChatFillIcon size={isTabletDevice ? 38 : 34} color={Colors.INTERACTIVE.COMMENT} />
  ), [isTabletDevice]);

  // Only use sourceFeed for yourMix feeds
  const shouldUseSourceFeed = feedOption === 'yourMix' && sourceFeed;
  
  // Get channel colors for source feed (only for yourMix feeds)
  const { colors: channelColors } = useChannelColors(shouldUseSourceFeed ? sourceFeed : null);
  
  // Get channel data for source feed to get actual title (only for yourMix feeds)
  const { data: sourceChannel } = useChannel(shouldUseSourceFeed ? sourceFeed : null);
  
  // Memoize source display name - only for yourMix feeds
  const sourceDisplayName = useMemo(() => {
    if (shouldUseSourceFeed) {
      if (sourceFeed === 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids') {
        return null;
      }
      return getFeedDisplayName(sourceFeed) || sourceChannel?.displayName;
    }
    return null;
  }, [shouldUseSourceFeed, sourceFeed, sourceChannel?.displayName]);

  // Decide if we should render overlay
  const shouldRenderOverlay = useMemo(() => {
    if (isClearViewMode) return false;
    return true;
  }, [isClearViewMode]);

  // Memoized animated styles for performance
  const animatedContainerStyle = useMemo(() => ({
    opacity: fadeAnim,
    transform: [{ translateY: slideAnim }],
  }), [fadeAnim, slideAnim]);

  return shouldRenderOverlay ? (
    <Animated.View
      style={[styles.container, animatedContainerStyle]}
      pointerEvents={isVisible ? "box-none" : "none"}
    >
      {/* Optimized gradient overlay with hardware acceleration */}
      <Animated.View style={[styles.uiOverlay, { opacity: fadeAnim }]} pointerEvents="none">
        <LinearGradient
          colors={isCollapsed 
            ? ['transparent', 'transparent', 'transparent', 'transparent']
            : ['rgba(0, 0, 0, 0.95)', 'rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 0.3)', 'transparent']
          }
          locations={[0, 0.4, 0.6, 1]}
          style={{ flex: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
        />
      </Animated.View>
      
      <Animated.View 
        style={[
          styles.overlayContentContainer,
          isModal ? { bottom: 0 } : (isSmallDevice ? { bottom: bottomNavBarHeight } : {}),
          { transform: [{ translateY: slideAnim }] }
        ]} 
        pointerEvents="box-none"
      >
        <View style={styles.infoColumn} pointerEvents="box-none">
          {post.repostedBy && (
            <View style={styles.repostIndicatorBox}>
              <TouchableOpacity 
                style={styles.repostIndicatorContainer} 
                onPress={handleRepostAuthorPress}
                activeOpacity={0.7}
              >
                <Avatar
                  uri={post.repostedBy?.avatar && post.repostedBy.avatar.startsWith('http')
                    ? post.repostedBy.avatar
                    : 'https://via.placeholder.com/40'}
                  type="user"
                  size={isTabletDevice ? 24 : 22}
                  ringColor="transparent"
                  style={styles.repostAvatar}
                />
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={
                    isTabletDevice
                      ? styles.repostIndicatorTextTablet
                      : styles.repostIndicatorText
                  }>
                    {(post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown').length > 30 
                      ? (post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown').substring(0, 30) + '...'
                      : (post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown')
                    }
                  </Text>
                  {post.repostedBy?.handle && (
                    <VerificationBadge 
                      handle={post.repostedBy.handle} 
                      textSize={isTabletDevice ? 16 : 14} 
                      autoPosition={true}
                      textColor={styles.repostIndicatorText.color}
                    />
                  )}
                  <Text style={[
                    isTabletDevice
                      ? styles.repostIndicatorTextTablet
                      : styles.repostIndicatorText,
                    { marginLeft: -1 }
                  ]}>
                    {' reposted'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
          
          {(record.text || !record.text) && (
            <View style={styles.descriptionContainer}>
              {record.text ? (
                <>
                  <TouchableOpacity onPress={toggleCollapsed} activeOpacity={0.8}>
                    <TextWithAuthorLinks
                      text={record.text}
                      style={styles.descriptionText}
                      numberOfLines={isCollapsed ? 1 : undefined}
                      onAuthorPress={(handle) => navigateToAuthorProfile(handle)}
                    />
                  </TouchableOpacity>
                  {!isCollapsed && record.createdAt && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.dateText}>
                        {new Date(record.createdAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                        {record.metadata?.orbyt && record.metadata?.platform && (
                          <Text style={styles.orbytText}> • {record.metadata.platform}</Text>
                        )}
                      </Text>
                    </>
                  )}
                </>
              ) : (
                <>
                  <TouchableOpacity onPress={toggleCollapsed} activeOpacity={0.8}>
                    <MoreFillIcon size={28} color={Colors.white} />
                  </TouchableOpacity>
                  {!isCollapsed && record.createdAt && (
                    <Text style={styles.dateText}>
                      {new Date(record.createdAt).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                      {record.metadata?.orbyt && record.metadata?.platform && (
                        <Text style={styles.orbytText}> • {record.metadata.platform}</Text>
                      )}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
          
          <TouchableOpacity
            onPress={() => author.handle && navigateToAuthorProfile(author.handle)}
            style={styles.authorInfoContainer}
          >
            <Avatar
              uri={profilePicUrl}
              type="profile"
              size={isTabletDevice ? 50 : isSmallDevice ? 46 : 50}
              profileColors={profileColors}
              ringColor="transparent"
              style={[
                isTabletDevice
                  ? styles.profilePictureTablet
                  : isSmallDevice
                    ? styles.profilePictureSmallScreen
                    : styles.profilePicture
              ]}
            />
            <View style={styles.authorTextContainer}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text 
                  style={[
                    styles.baseText,
                    isTabletDevice
                      ? styles.authorNameTablet
                      : isSmallDevice
                        ? styles.authorNameSmallScreen
                        : styles.authorName
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {author.displayName || author.handle || 'Unknown'}
                </Text>
                {author.handle && <VerificationBadge 
                  handle={author.handle} 
                  textSize={isTabletDevice ? 16 : 14} 
                  autoPosition={true}
                  textColor={Colors.white}
                />}
                {author.handle && !isOwnPost && !isFollowing && (
                  <>
                    <Text style={styles.dotSeparator}>•</Text>
                    <TouchableOpacity
                      onPress={handleFollowPress}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.baseText,
                          isTabletDevice
                            ? styles.followTextTablet
                            : isSmallDevice
                              ? styles.followTextSmallScreen
                              : styles.followText
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {'Follow'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              {feedOption === 'yourMix' && sourceDisplayName ? (
                <TouchableOpacity 
                  style={styles.sourceIndicatorContainer}
                  onPress={() => {
                    if (sourceFeed) {
                      navigation.navigate('Channel', {
                        uri: sourceFeed,
                        title: sourceDisplayName,
                        description: '',
                        avatar: '',
                        creator: undefined,
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ marginRight: 4 }}>
                    <TvIcon 
                      size={isTabletDevice ? 16 : 14}
                      color={sourceDisplayName === 'for your consideration' ? Colors.lightGray : channelColors.accentColor}
                    />
                  </View>
                  <Text style={[
                    isTabletDevice
                      ? styles.sourceTextTablet
                      : isSmallDevice
                        ? styles.sourceTextSmallScreen
                        : styles.sourceText,
                    { color: sourceDisplayName === 'for your consideration' ? Colors.lightGray : '#cfd6e8' }
                  ]}>
                    {sourceDisplayName}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
        
        <View style={styles.actionsContainer} pointerEvents="box-none">
          <TouchableOpacity 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : isSmallDevice
                  ? styles.actionButtonSmallScreen
                  : styles.actionButton
            ]} 
            onPress={handleSharePress}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <MoreFillIcon size={isTabletDevice ? 32 : 28} color={Colors.white} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.baseActionButton,
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
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : isSmallDevice
                  ? styles.actionButtonSmallScreen
                  : styles.actionButton
            ]} 
            onPress={handleCommentPress}
            activeOpacity={0.7}
          >
            {commentIcon}
            <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(post.replyCount || 0)}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.baseActionButton,
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
      
      <CommentSection 
        post={post} 
        onDismiss={handleCloseComments}
        visible={showComments}
        totalLikes={likeCount}
        totalComments={post.replyCount || 0}
        isLiked={isLiked}
        onOpenShareSheet={() => setShowShareSheet(true)}
        postedAt={post.record?.createdAt}
        onToggleLike={handleLike}
        isLikePending={isLikePending}
      />
      
      <ShareSheet
        visible={showShareSheet}
        onDismiss={() => setShowShareSheet(false)}
        postUri={post.uri}
        postCid={post.cid}
        authorDid={post.author?.did || ''}
        authorName={post.author?.displayName || post.author?.handle}
        feedOption={feedOption}
        sourceFeed={sourceFeed}
      />
    </Animated.View>
  ) : null;
};

const styles = StyleSheet.create({
  // Base styles for reuse
  baseText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontFamily: 'Firma-Medium',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  uiOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.8,
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
  repostIndicatorText: {
    color: 'rgba(0, 0, 0, 0.8)',
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginLeft: 4,
  },
  descriptionContainer: {
    marginBottom: 4,
    paddingRight: 10,
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  descriptionText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dateText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  orbytText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 4,
  },
  moreButtonText: {
    color: Colors.white,
    fontSize: 24, // Increased from 16
    fontFamily: 'Firma-Bold', // Changed from 'Firma-Regular' to 'Firma-Bold'
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  profilePicture: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  profilePictureSmallScreen: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  authorTextContainer: {
    marginLeft: 8,
    flex: 1,
    marginRight: 20,
  },
  authorName: {
    fontSize: 16,
    fontFamily: 'Firma-Black',
    lineHeight: 22,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameSmallScreen: {
    fontSize: 15,
    fontFamily: 'Firma-Black',
    lineHeight: 18,
    includeFontPadding: false,
    flexShrink: 1,
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginLeft: 5,
    marginBottom: -6,
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  baseActionButton: {
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 36.5,
  },
  actionButton: {
    marginVertical: 5,
  },
  actionButtonSmallScreen: {
    marginVertical: 3,
  },
  iconContainer: {
    width: 34.5,
    height: 34.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: Colors.white,
    fontSize: 12.5,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionButtonDisabled: {
    // Removed opacity transparency effect
  },
  authorNameTablet: {
    fontSize: 19,
    fontFamily: 'Firma-Black',
    lineHeight: 25,
    includeFontPadding: false,
    flexShrink: 1,
  },
  actionButtonTablet: {
    marginVertical: 7,
    width: 44,
  },
  actionTextTablet: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginTop: 3,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  profilePictureTablet: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  repostIndicatorTextTablet: {
    color: 'rgba(0, 0, 0, 0.8)',
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    marginLeft: 4,
  },
  repostIndicatorBox: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
    borderRadius: 6,
    paddingHorizontal: 4,
    marginBottom: 3,
    alignSelf: 'flex-start',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  repostAvatar: {
    marginRight: 2,
  },
  sourceIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    paddingHorizontal: 0,
  },
  sourceText: {
    fontSize: 13,
    fontFamily: 'Firma-SemiBold',
  },
  sourceTextSmallScreen: {
    fontSize: 12,
    fontFamily: 'Firma-SemiBold',
  },
  sourceTextTablet: {
    fontSize: 15,
    fontFamily: 'Firma-SemiBold',
  },
  followText: {
    fontSize: 16,
    fontFamily: 'Firma-Bold',
    lineHeight: 22,
    includeFontPadding: false,
    flexShrink: 1,
  },
  followTextSmallScreen: {
    fontSize: 15,
    fontFamily: 'Firma-Bold',
    lineHeight: 18,
    includeFontPadding: false,
    flexShrink: 1,
  },
  followTextTablet: {
    fontSize: 19,
    fontFamily: 'Firma-Bold',
    lineHeight: 25,
    includeFontPadding: false,
    flexShrink: 1,
  },
  dotSeparator: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginHorizontal: 8,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

// Optimized memo comparison for scroll performance
export default React.memo(VideoOverlay, (prevProps, nextProps) => {
  // Only re-render on essential changes for smooth scrolling
  if (prevProps.post.uri !== nextProps.post.uri) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.feedOption !== nextProps.feedOption) return false;
  if (prevProps.sourceFeed !== nextProps.sourceFeed) return false;
  if (prevProps.isModal !== nextProps.isModal) return false;
  if (prevProps.progressBarAtCardBottom !== nextProps.progressBarAtCardBottom) return false;
  
  // Avoid re-rendering for scroll position changes during scrolling
  return true;
});