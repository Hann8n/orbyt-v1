import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withSpring, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../ui/UI';
import { isTablet, isSmallScreen, getBottomNavBarHeight } from '../../../utils/helpers';
import { HeartFillIcon, ChatFillIcon, RefreshFillIcon, MoreFillIcon, AddCircleLineIcon, CheckCircleFillIcon } from '../../ui/Icon';
import { isCurrentUser } from '../../../stores/profileInteractionStore';
import { Avatar } from '../../ui/UI';
import { formatNumber, formatHandle } from '../../../utils/helpers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import { VerificationBadge } from '../badging';
import { useGlobalShareSheet, useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useRouter, useSegments } from 'expo-router';
import { useFollowContext } from '../../../context/FollowContext';


const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Use any type for post
type Post = any;

type RootStackParamList = {
  AuthorProfile: { handle: string };
};

export interface VideoOverlayUIProps {
  post: Post;
  isVisible: boolean;
  isModal?: boolean;
  feedOption?: string;
  sourceFeed?: string;
  onLike?: () => void;
  onRepost?: () => void;
  onSourcePress?: () => void;
  isLiked?: boolean;
  isReposted?: boolean;
  likeCount?: number;
  repostCount?: number;
  isLikePending?: boolean;
  isRepostPending?: boolean;
  isFollowing?: boolean;
  hasProfile?: boolean;
  channelSlug?: string | null;
  onChannelPress?: () => void;
}

const VideoOverlayUI: React.FC<VideoOverlayUIProps> = ({
  post,
  isVisible,
  isModal = false,
  feedOption,
  sourceFeed,
  onLike,
  onRepost,
  onSourcePress,
  isLiked = false,
  isReposted = false,
  likeCount = 0,
  repostCount = 0,
  isLikePending = false,
  isRepostPending = false,
  isFollowing = false,
  hasProfile = false,
  channelSlug,
  onChannelPress,
}) => {
  const isTabletDevice = isTablet();
  const isSmallScreenDevice = isSmallScreen();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const { width, height } = useWindowDimensions();
  const { presentShareSheet } = useGlobalShareSheet();
  const { presentCommentSection } = useGlobalCommentSection();
  const navigation = useRouter();
  const segments = useSegments();
  const hasTabBar = Array.isArray(segments) && segments[0] === '(tabs)';
  
  // Overlay state
  const [isOverlayCollapsed, setIsOverlayCollapsed] = useState(true);

  // Memoize expensive calculations to prevent rerenders
  const author = useMemo(() => post.author || {}, [post.author]);
  const record = useMemo(() => post.record || {}, [post.record]);
  const profilePicUrl = useMemo(() => 
    author.avatar && author.avatar.startsWith('http')
      ? author.avatar
      : 'https://via.placeholder.com/40',
    [author.avatar]
  );

  const toggleCollapsed = useCallback(() => {
    setIsOverlayCollapsed(prev => !prev);
  }, []);

  // Reset text state when post changes
  useEffect(() => {
    setIsOverlayCollapsed(true);
    // Also reset follow confirmation when the post changes so it doesn't leak between items
    setShowFollowConfirmation(false);
  }, [post?.uri, record?.text]);

  // Heuristic to detect long text without layout measurement
  const hasLongText = useMemo(
    () => typeof record.text === 'string' && record.text.length > 140,
    [record.text]
  );

  // Modal-aware navigation to AuthorProfile (works inside FeedModal or regular screens)
  const navigateToAuthorProfile = useCallback((rawHandle?: string | null) => {
    const cleanHandle = (rawHandle || '').trim();
    if (!cleanHandle) return;
    navigation.push(`/profile/${cleanHandle}`);
  }, [navigation]);

  // Navigation to hashtag feed
  const navigateToHashtagFeed = useCallback((hashtag: string) => {
    navigation.push({
      pathname: '/(modals)/feed',
      params: {
        feedOption: `hashtag:${hashtag}`,
        backgroundColor: '#000000',
        searchQuery: `#${hashtag}`,
      }
    });
  }, [navigation]);

  // Handle author press
  const handleAuthorPress = useCallback(() => {
    const handle = author.handle?.trim();
    if (handle && typeof handle === 'string' && handle.trim() !== '') {
      navigateToAuthorProfile(handle);
    }
  }, [author, navigateToAuthorProfile]);

  // Handle repost author press
  const handleRepostAuthorPress = useCallback(() => {
    const handle = post.repostedBy?.handle?.trim();
    if (handle && typeof handle === 'string' && handle.trim() !== '') {
      navigateToAuthorProfile(handle);
    }
  }, [post.repostedBy, navigateToAuthorProfile]);

  // Handle share button press
  const handleSharePress = useCallback(() => {
    presentShareSheet({
      postUri: post.uri,
      postCid: post.cid,
      authorDid: post.author?.did || '',
      authorName: post.author?.displayName,
      authorHandle: post.author?.handle,
      feedOption: feedOption as any,
      sourceFeed,
    });
  }, [post.uri, post.cid, post.author, feedOption, sourceFeed, presentShareSheet]);

  // Memoize UI calculations to prevent recalculation on every render
  const likeScale = useSharedValue(1);
  const likeAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: likeScale.value }],
    };
  });
  
  const uiCalculations = useMemo(() => {
    return {
      contentPadding: Math.round(Math.max(8, Math.min(14, width * 0.025))),
      actionIconSize: Math.round(Math.max(28, Math.min(40, width * 0.085))),
      smallIconSize: Math.max(14, Math.min(20, Math.round(width * 0.05))),
      // No ring offset needed since overlay avatars don't use rings by default
      authorAvatarSize: Math.round(Math.max(46, Math.min(64, width * 0.12))),
      repostAvatarSize: Math.round(Math.max(20, Math.min(28, width * 0.06))),
    };
  }, [width]);
  
  const { contentPadding, actionIconSize, smallIconSize, authorAvatarSize, repostAvatarSize } = uiCalculations;

  // Memoize icon rendering to prevent unnecessary recreations
  const renderLikeIcon = useCallback(() => (
    <Animated.View style={likeAnimatedStyle}>
      <HeartFillIcon 
        size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} 
        color={isLiked ? Colors.INTERACTIVE.HEART.ACTIVE : Colors.white} 
      />
    </Animated.View>
  ), [likeAnimatedStyle, isTabletDevice, actionIconSize, isLiked]);

  // Repost animation: quick tilt (wiggle) + slight scale pulse
  const repostScale = useSharedValue(1);
  const repostRotate = useSharedValue(0); // radians
  const repostAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    // Ensure rotate is always a string, even when value is 0
    const rotateValue = repostRotate.value;
    const rotateStr = rotateValue === 0 ? '0rad' : `${rotateValue}rad`;
    return {
      transform: [
        { rotate: rotateStr },
        { scale: repostScale.value },
      ] as any,
    };
  });

  const renderRepostIcon = useCallback(() => (
    <Animated.View style={repostAnimatedStyle}>
      <RefreshFillIcon 
        size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} 
        color={isReposted ? Colors.INTERACTIVE.REPOST.ACTIVE : Colors.INTERACTIVE.REPOST.INACTIVE} 
      />
    </Animated.View>
  ), [repostAnimatedStyle, isTabletDevice, actionIconSize, isReposted]);

  // Memoize static icons to prevent recreation
  const repostIcon = useMemo(() => (
    <RefreshFillIcon 
      size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} 
      color={isReposted ? Colors.INTERACTIVE.REPOST.ACTIVE : Colors.INTERACTIVE.REPOST.INACTIVE} 
    />
  ), [isTabletDevice, actionIconSize, isReposted]);

  const commentIcon = useMemo(() => (
    <ChatFillIcon size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} color={Colors.INTERACTIVE.COMMENT} />
  ), [isTabletDevice, actionIconSize]);

  // Follow state and mutation (lifted: follow state comes from parent, mutation from context)
  const { followMutation, currentUser } = useFollowContext();
  const isCurrentUserProfile = isCurrentUser(post.author?.did, post.author?.handle, currentUser);

  // Local UI state for confirmation badge
  const [showFollowConfirmation, setShowFollowConfirmation] = useState(false);
  // Track that we've already shown a follow confirmation for this post so the + badge doesn't return after timeout
  const [hasFollowedForPost, setHasFollowedForPost] = useState(false);

  // Auto-hide follow confirmation after a short delay to keep overlay lightweight
  useEffect(() => {
    if (!showFollowConfirmation) return;
    const timeoutId = setTimeout(() => {
      setShowFollowConfirmation(false);
    }, 6000);
    return () => clearTimeout(timeoutId);
  }, [showFollowConfirmation]);

  // Precompute follow badge metrics
  const followBadgeMetrics = useMemo(() => {
    const badgeSize = Math.round(authorAvatarSize * 0.42);
    const offset = Math.round(badgeSize * 0.25);
    // Make hit box larger for easier tapping, but keep icon in same position
    const hitBoxSize = Math.round(badgeSize * 1.4);
    // Adjust positioning so icon stays in same visual position
    const hitBoxOffset = Math.round((hitBoxSize - badgeSize) / 2);
    return { badgeSize, offset, hitBoxSize, hitBoxOffset };
  }, [authorAvatarSize]);

  const { badgeSize, offset, hitBoxSize, hitBoxOffset } = followBadgeMetrics;

  // Memoize dynamic styles to prevent style object recreation
  const overlayContentStyle = useMemo(() => [
    styles.overlayContentContainer,
    { padding: contentPadding },
    isModal
      ? { bottom: 0 }
      : hasTabBar && (isSmallScreenDevice || isTabletDevice)
        ? { bottom: bottomNavBarHeight }
        : {},
  ], [contentPadding, isModal, isSmallScreenDevice, isTabletDevice, bottomNavBarHeight, hasTabBar]);

  // Use animated opacity instead of conditional rendering to prevent unmounting
  // This reduces jank when switching between videos
  const overlayOpacityShared = useSharedValue(isVisible ? 1 : 0);
  const isVisibleShared = useSharedValue(isVisible);
  
  // Update shared value when prop changes (runs on JS thread but minimal work)
  useEffect(() => {
    isVisibleShared.value = isVisible;
  }, [isVisible, isVisibleShared]);
  
  // Use useAnimatedReaction to update opacity on UI thread when visibility changes
  // This moves the animation scheduling to UI thread for better scroll performance
  useAnimatedReaction(
    () => isVisibleShared.value,
    (visible) => {
      'worklet';
      overlayOpacityShared.value = withTiming(visible ? 1 : 0, {
        duration: 60,
        easing: Easing.out(Easing.ease),
      });
    },
    [overlayOpacityShared]
  );
  
  // Explicit worklet directive ensures this runs on UI thread for optimal performance
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: overlayOpacityShared.value,
    };
  });
  
  const overlayPointerEvents = isVisible ? 'box-none' as const : 'none' as const;

  return (
    <>
      <Animated.View 
        style={[styles.overlayContainer, overlayAnimatedStyle]} 
        pointerEvents={overlayPointerEvents}
      >
      <View 
        style={overlayContentStyle} 
        pointerEvents="box-none"
      >
        <View style={styles.infoColumn} pointerEvents="box-none">
          {/* Repost indicator - repost icon + name text */}
          {post.repostedBy && (
            <View style={styles.repostIndicatorBox}>
              <Pressable 
                style={styles.repostIndicatorContainer}
                onPress={handleRepostAuthorPress}
              >
                <View style={{ opacity: 0.8 }}>
                  <RefreshFillIcon 
                    size={isTabletDevice ? 26 : 24}
                    color={Colors.lightGray}
                  />
                </View>
                <Text style={[
                  isTabletDevice
                    ? styles.repostIndicatorTextTablet
                    : styles.repostIndicatorText,
                  { opacity: 0.8 }
                ]}>
                  {`reposted by ${formatHandle(post.repostedBy?.handle)}`}
                </Text>
              </Pressable>
            </View>
          )}
          
          {/* Description container */}
          {record.text && (
            <View style={styles.descriptionContainer}>
              {hasLongText ? (
                <Pressable onPress={toggleCollapsed}>
                  <TextWithAuthorLinks
                    text={record.text}
                    style={styles.descriptionText}
                    numberOfLines={isOverlayCollapsed ? 2 : undefined}
                    onAuthorPress={navigateToAuthorProfile}
                    onHashtagPress={navigateToHashtagFeed}
                    facets={record.facets}
                  />
                </Pressable>
              ) : (
                <TextWithAuthorLinks
                  text={record.text}
                  style={styles.descriptionText}
                  onAuthorPress={navigateToAuthorProfile}
                  onHashtagPress={navigateToHashtagFeed}
                  facets={record.facets}
                />
              )}
            </View>
          )}
          
          {/* Author info */}
          <Pressable
            style={styles.authorInfoContainer}
            onPress={handleAuthorPress}
          >
            <View style={{ position: 'relative', overflow: 'visible' }}>
              <Avatar
                uri={profilePicUrl}
                type="profile"
                size={authorAvatarSize}
                style={[
                  isTabletDevice
                    ? styles.profilePictureTablet
                    : styles.profilePicture
                ]}
              />
              {/* Follow badge overlay: show + when not following, show check briefly after follow */}
              {hasProfile && !isFollowing && !showFollowConfirmation && !hasFollowedForPost && !isCurrentUserProfile && (
                <Pressable
                  onPress={() => {
                    if (!post.author?.handle) return;
                    // Optimistically show checkmark immediately
                    setShowFollowConfirmation(true);
                    setHasFollowedForPost(true);
                    // Trigger server follow
                    try {
                      followMutation.mutate({ handle: post.author.handle, isFollowing: true });
                    } catch (err) {
                      // If mutation fails, hide the checkmark
                      setShowFollowConfirmation(false);
                      setHasFollowedForPost(false);
                    }
                  }}
                  disabled={followMutation.isPending}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  style={[
                    styles.followBadge,
                    { 
                      right: -offset - hitBoxOffset, 
                      top: -offset - hitBoxOffset 
                    },
                    { width: hitBoxSize, height: hitBoxSize },
                  ]}
                >
                  <AddCircleLineIcon size={badgeSize} color={Colors.black} />
                </Pressable>
              )}
              {showFollowConfirmation && !isCurrentUserProfile && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.followBadge,
                    { right: -offset, top: -offset },
                    { width: badgeSize, height: badgeSize },
                  ]}
                >
                  <CheckCircleFillIcon size={badgeSize} color="#01f5b3" />
                </View>
              )}
            </View>
            <View style={styles.authorTextContainer}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text 
                  style={[
                    styles.baseText,
                    isTabletDevice
                      ? styles.authorNameTablet
                      : styles.authorName
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {formatHandle(author.handle)}
                </Text>
                {author.handle && <VerificationBadge 
                  handle={author.handle} 
                  textSize={isTabletDevice ? 16 : 14} 
                  autoPosition={true}
                  textColor={Colors.white}
                />}
              </View>
              {channelSlug ? (
                <Pressable 
                  style={styles.sourceIndicatorContainer}
                  onPress={onChannelPress}
                >
                  <Text style={[
                    isTabletDevice
                      ? styles.sourceTextTablet
                      : styles.sourceText,
                    { 
                      color: Colors.white,
                      opacity: 0.70
                    }
                  ]}>
                    /{channelSlug}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </View>
        
        {/* Action buttons */}
        <View style={styles.actionsContainer} pointerEvents="box-none">
          <Pressable 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton
            ]} 
            onPress={handleSharePress}
          >
            <View style={styles.iconContainer}>
              <MoreFillIcon size={isTabletDevice ? Math.max(actionIconSize - 6, 24) : actionIconSize - 6} color={Colors.white} />
            </View>
          </Pressable>

          <Pressable 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton,
              isRepostPending && styles.actionButtonDisabled
            ]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Different animation than heart: wiggle (tilt) + slight scale
              if (!isReposted) {
                repostScale.value = withSequence(
                  withTiming(1.08, { duration: 120 }),
                  withTiming(1.0, { duration: 120 })
                );
                repostRotate.value = withSequence(
                  withTiming(0.20, { duration: 90 }), // ~11.5deg
                  withTiming(-0.12, { duration: 90 }), // ~-7deg
                  withTiming(0, { duration: 90 })
                );
              } else {
                // On undo, ensure we reset any lingering transforms
                repostScale.value = withTiming(1, { duration: 100 });
                repostRotate.value = withTiming(0, { duration: 100 });
              }
              onRepost?.();
            }}
            disabled={isRepostPending}
          >
            {renderRepostIcon()}
            <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(repostCount)}</Text>
          </Pressable>
          
          <Pressable 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton
            ]} 
            onPress={() => {
              presentCommentSection({
                post,
                totalLikes: likeCount,
                totalComments: post.replyCount || 0,
                isLiked,
                postedAt: post.record?.createdAt || post.indexedAt,
                onToggleLike: onLike,
                isLikePending,
              });
            }}
          >
            {commentIcon}
            <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(post.replyCount || 0)}</Text>
          </Pressable>
          
          <Pressable 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton,
              isLikePending && styles.actionButtonDisabled
            ]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Animate only on like; if unliking mid-animation, reset scale
              if (!isLiked) {
                likeScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
                  likeScale.value = withSpring(1);
                });
              } else {
                // ensure we cancel any lingering animation when unliking
                likeScale.value = withSpring(1);
              }
              onLike?.();
            }}
            disabled={isLikePending}
          >
            {renderLikeIcon()}
            <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(likeCount)}</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
    </>
  );
};

// Styles
const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 5,
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
    paddingVertical: 4,
    paddingLeft: 0,
    paddingRight: 4,
  },
  repostIndicatorText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginLeft: 6,
    includeFontPadding: false,
    lineHeight: 18,
  },
  repostIndicatorTextTablet: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    marginLeft: 6,
    includeFontPadding: false,
    lineHeight: 20,
  },
  repostIndicatorBox: {
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.SMALL,
    marginBottom: 0,
    alignSelf: 'flex-start',
  },
  repostAvatar: {
    marginRight: 6,
  },
  descriptionContainer: {
    marginBottom: 6,
    paddingRight: 10,
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  descriptionText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  showMoreText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(40, 22, 22, 0.15)',
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
    borderRadius: BORDER_RADIUS.FULL,
  },
  profilePictureSmallScreen: {
    width: 46,
    height: 46,
    borderRadius: BORDER_RADIUS.FULL,
  },
  profilePictureTablet: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.FULL,
  },
  authorTextContainer: {
    marginLeft: 8,
    flex: 1,
    marginRight: 20,
  },
  baseText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontFamily: 'Firma-Medium',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorName: {
    fontSize: 15,
    fontFamily: 'Firma-SemiBold',
    lineHeight: 21,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameSmallScreen: {
    fontSize: 15,
    fontFamily: 'Firma-SemiBold',
    lineHeight: 21,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameTablet: {
    fontSize: 15,
    fontFamily: 'Firma-SemiBold',
    lineHeight: 21,
    includeFontPadding: false,
    flexShrink: 1,
  },
  sourceIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    paddingHorizontal: 0,
  },
  sourceText: {
    fontSize: 15,
    fontFamily: 'Firma-Medium',
  },
  sourceTextSmallScreen: {
    fontSize: 15,
    fontFamily: 'Firma-Medium',
  },
  sourceTextTablet: {
    fontSize: 15,
    fontFamily: 'Firma-Medium',
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginLeft: 5,
    marginBottom: 0,
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
    marginVertical: 4,
  },
  actionButtonSmallScreen: {
    marginVertical: 3,
  },
  actionButtonTablet: {
    marginVertical: 5,
    width: 44,
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
  followBadge: {
    position: 'absolute',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    elevation: 6, // Android elevation
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  actionButtonDisabled: {
    // Removed opacity transparency effect
  },
});

// Custom comparison function to prevent unnecessary re-renders
// Only re-render if critical props change
const arePropsEqual = (prevProps: VideoOverlayUIProps, nextProps: VideoOverlayUIProps) => {
  // Always re-render if visibility changes (needed for opacity transition)
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  
  // Compare post URI (most important identifier)
  if (prevProps.post?.uri !== nextProps.post?.uri) return false;
  
  // Compare interaction states
  if (prevProps.isLiked !== nextProps.isLiked) return false;
  if (prevProps.isReposted !== nextProps.isReposted) return false;
  if (prevProps.likeCount !== nextProps.likeCount) return false;
  if (prevProps.repostCount !== nextProps.repostCount) return false;
  if (prevProps.isLikePending !== nextProps.isLikePending) return false;
  if (prevProps.isRepostPending !== nextProps.isRepostPending) return false;
  
  // Compare modal state
  if (prevProps.isModal !== nextProps.isModal) return false;
  
  // Compare feed options
  if (prevProps.feedOption !== nextProps.feedOption) return false;
  if (prevProps.sourceFeed !== nextProps.sourceFeed) return false;
  
  // If all critical props are the same, skip re-render
  return true;
};

export default React.memo(VideoOverlayUI, arePropsEqual);
