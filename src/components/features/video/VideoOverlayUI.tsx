import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../ui/UI';
import { isTablet, isSmallScreen, getBottomNavBarHeight } from '../../../utils/device/screen';
import {
  HeartFillIcon,
  ChatFillIcon,
  RefreshFillIcon,
  MoreFillIcon,
  AddCircleLineIcon,
  CheckCircleFillIcon,
} from '../../ui/Icon';
import { isCurrentUser } from '../../../stores/profileInteractionStore';
import { Avatar } from '../../ui/UI';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import { VerificationBadge } from '../badging';
import { useGlobalShareSheet, useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useRouter, useSegments } from 'expo-router';
import { useFollowContext } from '../../../context/FollowContext';
import { useTabBarHeight } from '../../../context/FeedIndicatorContext';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchProfile, useProfile } from '../../../services/data/ProfileService';
import type { ExtendedPostView, PostRecord } from '../../../services/api/types';
import type { RichTextFacet } from '../../../utils/types/richText';
import { useFeedSettings } from '../../../stores/userStore';
import { getProfileColors } from '../../../utils/formatting/colors';

// Use proper API types
type Post = ExtendedPostView;

export interface VideoOverlayUIProps {
  post: Post;
  isVisible: boolean;
  isModal?: boolean;
  feedOption?: 'following' | 'discover';
  // Optional composed shared opacity to tie overlay and scrubber together
  overlayOpacitySV?: SharedValue<number>;
  onLike?: () => void;
  onRepost?: () => void;
  onShareInteraction?: () => void; // Callback to track share interaction
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
  overlayOpacitySV,
  onLike,
  onRepost,
  onShareInteraction,
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
  const measuredTabBarHeight = useTabBarHeight();
  const calculatedBottomNavBarHeight = getBottomNavBarHeight(insets);
  // Use measured height if available, otherwise fall back to calculated height
  const baseBottomNavBarHeight = measuredTabBarHeight ?? calculatedBottomNavBarHeight;
  const { nativeTabsEnabled } = useFeedSettings();
  // Add extra height when using native tabs (native tabs are slightly taller)
  const bottomNavBarHeight = nativeTabsEnabled
    ? baseBottomNavBarHeight + 10
    : baseBottomNavBarHeight;
  const { width } = useWindowDimensions();
  const { presentShareSheet } = useGlobalShareSheet();
  const { presentCommentSection } = useGlobalCommentSection();
  const navigation = useRouter();
  const segments = useSegments();
  const hasTabBar = Array.isArray(segments) && segments[0] === '(tabs)';
  const queryClient = useQueryClient();

  // Overlay state
  const [isOverlayCollapsed, setIsOverlayCollapsed] = useState(true);

  // Local UI state for confirmation badge (brief checkmark animation after follow)
  const [showFollowConfirmation, setShowFollowConfirmation] = useState(false);

  // Memoize expensive calculations to prevent rerenders
  const author = useMemo(() => post.author || {}, [post.author]);
  const record = useMemo(() => post.record as PostRecord | undefined, [post.record]);

  // Get profile data to check if author is blocked
  const { data: authorProfile } = useProfile(author.handle);
  const isAuthorBlocked = !!(
    authorProfile?.viewer?.blocking || authorProfile?.viewer?.blockingByList
  );
  const profileColors = getProfileColors(authorProfile);

  const profilePicUrl = useMemo(
    () =>
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
    setShowFollowConfirmation(false);
  }, [post?.uri, record?.text]);

  // Heuristic to detect long text without layout measurement
  const hasLongText = useMemo(
    () => typeof record?.text === 'string' && record.text.length > 140,
    [record?.text]
  );

  // Modal-aware navigation to AuthorProfile (works inside FeedModal or regular screens)
  const navigateToAuthorProfile = useCallback(
    (
      rawHandle?: string | null,
      authorData?: { did?: string; handle?: string; displayName?: string; avatar?: string }
    ) => {
      const cleanHandle = (rawHandle || '').trim();
      if (!cleanHandle) return;

      // Prefetch profile with partial data for instant UI + full data in background
      if (queryClient) {
        prefetchProfile(
          queryClient,
          cleanHandle,
          authorData
            ? {
                did: authorData.did,
                handle: authorData.handle || cleanHandle,
                displayName: authorData.displayName,
                avatar: authorData.avatar,
              }
            : undefined
        );
      }

      navigation.push(`/profile/${cleanHandle}`);
    },
    [navigation, queryClient]
  );

  // Navigation to hashtag feed
  const navigateToHashtagFeed = useCallback(
    (hashtag: string) => {
      navigation.push({
        pathname: '/(modals)/feed',
        params: {
          feedOption: `hashtag:${hashtag}`,
          backgroundColor: '#000000',
          searchQuery: `#${hashtag}`,
        },
      });
    },
    [navigation]
  );

  // Handle author press
  const handleAuthorPress = useCallback(() => {
    const handle = author.handle?.trim();
    if (handle && typeof handle === 'string' && handle.trim() !== '') {
      navigateToAuthorProfile(handle, author);
    }
  }, [author, navigateToAuthorProfile]);

  // Handle repost author press
  const handleRepostAuthorPress = useCallback(() => {
    const handle = post.repostedBy?.handle?.trim();
    if (handle && typeof handle === 'string' && handle.trim() !== '') {
      navigateToAuthorProfile(handle, post.repostedBy);
    }
  }, [post.repostedBy, navigateToAuthorProfile]);

  // Handle share button press
  const handleSharePress = useCallback(() => {
    // Track share interaction
    onShareInteraction?.();

    presentShareSheet({
      postUri: post.uri,
      postCid: post.cid,
      authorDid: post.author?.did || '',
      authorName: post.author?.displayName,
      authorHandle: post.author?.handle,
      feedOption: feedOption,
    });
  }, [post.uri, post.cid, post.author, feedOption, presentShareSheet, onShareInteraction]);

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
      // No ring offset needed since overlay avatars don't use rings by default
      authorAvatarSize: Math.round(Math.max(46, Math.min(64, width * 0.12))),
    };
  }, [width]);

  const { contentPadding, actionIconSize, authorAvatarSize } = uiCalculations;

  // Memoize icon rendering to prevent unnecessary recreations
  const renderLikeIcon = useCallback(
    () => (
      <Animated.View style={likeAnimatedStyle}>
        <HeartFillIcon
          size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize}
          color={isLiked ? Colors.INTERACTIVE.HEART.ACTIVE : Colors.white}
        />
      </Animated.View>
    ),
    [likeAnimatedStyle, isTabletDevice, actionIconSize, isLiked]
  );

  // Repost animation: quick tilt (wiggle) + slight scale pulse
  const repostScale = useSharedValue(1);
  const repostRotate = useSharedValue(0); // radians
  const repostAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    // Ensure rotate is always a string, even when value is 0
    const rotateValue = repostRotate.value;
    const rotateStr = rotateValue === 0 ? '0rad' : `${rotateValue}rad`;
    return {
      transform: [{ rotate: rotateStr }, { scale: repostScale.value }],
    };
  });

  const renderRepostIcon = useCallback(
    () => (
      <Animated.View style={repostAnimatedStyle}>
        <RefreshFillIcon
          size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize}
          color={isReposted ? Colors.INTERACTIVE.REPOST.ACTIVE : Colors.INTERACTIVE.REPOST.INACTIVE}
        />
      </Animated.View>
    ),
    [repostAnimatedStyle, isTabletDevice, actionIconSize, isReposted]
  );

  const commentIcon = useMemo(
    () => (
      <ChatFillIcon
        size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize}
        color={Colors.INTERACTIVE.COMMENT}
      />
    ),
    [isTabletDevice, actionIconSize]
  );

  // Follow state and mutation (lifted: follow state comes from parent, mutation from context)
  const { followMutation, currentUser } = useFollowContext();
  const isCurrentUserProfile = isCurrentUser(post.author?.did, post.author?.handle, currentUser);

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
  const overlayContentStyle = useMemo(
    () => [
      styles.overlayContentContainer,
      { padding: contentPadding },
      isModal
        ? { bottom: 0 }
        : hasTabBar && (isSmallScreenDevice || isTabletDevice)
          ? { bottom: bottomNavBarHeight }
          : {},
    ],
    [contentPadding, isModal, isSmallScreenDevice, isTabletDevice, bottomNavBarHeight, hasTabBar]
  );

  // Explicit worklet directive ensures this runs on UI thread for optimal performance
  // Smoothly fade out overlay when scrubbing, fade in when scrubbing stops
  // Match feed pager fade animation for consistency
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    // Opacity is driven by composed shared value from parent (overlay + item + scrub)
    const opacityValue = overlayOpacitySV ? overlayOpacitySV.value : 1;
    return {
      opacity: withTiming(opacityValue, {
        duration: 150,
        easing: Easing.out(Easing.ease),
      }),
    };
  }, [overlayOpacitySV]);

  // Pointer events based on per-item visibility - only visible item's overlay is interactive
  // This ensures only the centered/visible card's overlay receives touch events
  const overlayPointerEvents = isVisible ? ('box-none' as const) : ('none' as const);

  return (
    <>
      <Animated.View
        style={[styles.overlayContainer, overlayAnimatedStyle]}
        pointerEvents={overlayPointerEvents}
      >
        <View style={overlayContentStyle} pointerEvents="box-none">
          <View style={styles.infoColumn} pointerEvents="box-none">
            {/* Repost indicator - repost icon + name text */}
            {post.repostedBy && (
              <View style={styles.repostIndicatorBox}>
                <Pressable
                  style={styles.repostIndicatorContainer}
                  onPress={handleRepostAuthorPress}
                >
                  <View style={{ opacity: 0.8 }}>
                    <RefreshFillIcon size={isTabletDevice ? 26 : 24} color={Colors.lightGray} />
                  </View>
                  <Text
                    style={[
                      isTabletDevice
                        ? styles.repostIndicatorTextTablet
                        : styles.repostIndicatorText,
                      { opacity: 0.8 },
                    ]}
                  >
                    {`reposted by ${formatHandle(post.repostedBy?.handle || '')}`}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Description container */}
            {record?.text && (
              <View style={styles.descriptionContainer}>
                {hasLongText ? (
                  <Pressable onPress={toggleCollapsed}>
                    <TextWithAuthorLinks
                      text={record.text}
                      style={styles.descriptionText}
                      numberOfLines={isOverlayCollapsed ? 2 : undefined}
                      onAuthorPress={navigateToAuthorProfile}
                      onHashtagPress={navigateToHashtagFeed}
                      facets={record.facets as RichTextFacet[] | undefined}
                    />
                  </Pressable>
                ) : (
                  <TextWithAuthorLinks
                    text={record.text}
                    style={styles.descriptionText}
                    onAuthorPress={navigateToAuthorProfile}
                    onHashtagPress={navigateToHashtagFeed}
                    facets={record.facets as RichTextFacet[] | undefined}
                  />
                )}
              </View>
            )}

            {/* Author info */}
            <Pressable style={styles.authorInfoContainer} onPress={handleAuthorPress}>
              <View style={{ position: 'relative', overflow: 'visible' }}>
                <Avatar
                  uri={profilePicUrl}
                  type="profile"
                  size={authorAvatarSize}
                  style={[isTabletDevice ? styles.profilePictureTablet : styles.profilePicture]}
                  blurRadius={isAuthorBlocked ? 30 : 0}
                  status={authorProfile?.status}
                  profileColors={
                    profileColors
                      ? {
                          backgroundColor: profileColors.backgroundColor,
                          foregroundColor: profileColors.foregroundColor,
                          textColor: profileColors.foregroundColor,
                        }
                      : undefined
                  }
                />
                {/* Follow badge overlay: show + when not following, show check briefly after follow */}
                {hasProfile && !isFollowing && !showFollowConfirmation && !isCurrentUserProfile && (
                  <Pressable
                    onPress={() => {
                      if (!post.author?.handle) return;
                      // Optimistically show checkmark immediately
                      setShowFollowConfirmation(true);
                      // Trigger server follow (mutation updates follow store immediately)
                      followMutation.mutate(
                        { handle: post.author.handle, isFollowing: true },
                        {
                          onError: () => {
                            // Reset confirmation if mutation fails
                            setShowFollowConfirmation(false);
                          },
                        }
                      );
                    }}
                    disabled={followMutation.isPending}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={[
                      styles.followBadge,
                      {
                        right: -offset - hitBoxOffset,
                        top: -offset - hitBoxOffset,
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
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={[
                      styles.baseText,
                      isTabletDevice ? styles.authorNameTablet : styles.authorName,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {formatHandle(author.handle)}
                  </Text>
                  {author.handle && (
                    <VerificationBadge
                      handle={author.handle}
                      textSize={isTabletDevice ? 16 : 14}
                      autoPosition={true}
                      textColor={Colors.white}
                    />
                  )}
                </View>
                {channelSlug ? (
                  <Pressable style={styles.sourceIndicatorContainer} onPress={onChannelPress}>
                    <Text
                      style={[
                        isTabletDevice ? styles.sourceTextTablet : styles.sourceText,
                        {
                          color: Colors.white,
                          opacity: 0.7,
                        },
                      ]}
                    >
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
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
              ]}
              onPress={handleSharePress}
            >
              <View style={styles.iconContainer}>
                <MoreFillIcon
                  size={isTabletDevice ? Math.max(actionIconSize - 6, 24) : actionIconSize - 6}
                  color={Colors.white}
                />
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.baseActionButton,
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
                isRepostPending && styles.actionButtonDisabled,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Different animation than heart: wiggle (tilt) + slight scale
                if (!isReposted) {
                  // eslint-disable-next-line react-hooks/immutability
                  repostScale.value = withSequence(
                    withTiming(1.08, { duration: 120 }),
                    withTiming(1.0, { duration: 120 })
                  );
                  // eslint-disable-next-line react-hooks/immutability
                  repostRotate.value = withSequence(
                    withTiming(0.2, { duration: 90 }), // ~11.5deg
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
              <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>
                {formatNumber(repostCount)}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.baseActionButton,
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
              ]}
              onPress={() => {
                presentCommentSection({
                  post,
                  totalLikes: likeCount,
                  totalComments: post.replyCount || 0,
                  isLiked,
                  postedAt: (post.record?.createdAt || post.indexedAt) as string | undefined,
                  onToggleLike: onLike,
                  isLikePending,
                });
              }}
            >
              {commentIcon}
              <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>
                {formatNumber(post.replyCount || 0)}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.baseActionButton,
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
                isLikePending && styles.actionButtonDisabled,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Animate only on like; if unliking mid-animation, reset scale
                if (!isLiked) {
                  // eslint-disable-next-line react-hooks/immutability
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
              <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>
                {formatNumber(likeCount)}
              </Text>
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
    fontFamily: 'Figtree-SemiBold',
    marginLeft: 6,
    includeFontPadding: false,
    lineHeight: 18,
  },
  repostIndicatorTextTablet: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
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
    fontFamily: 'Figtree-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  showMoreText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
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
    fontFamily: 'Figtree-Medium',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorName: {
    fontSize: 15,
    fontFamily: 'Figtree-SemiBold',
    lineHeight: 21,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameSmallScreen: {
    fontSize: 15,
    fontFamily: 'Figtree-SemiBold',
    lineHeight: 21,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameTablet: {
    fontSize: 15,
    fontFamily: 'Figtree-SemiBold',
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
    fontFamily: 'Figtree-Medium',
  },
  sourceTextSmallScreen: {
    fontSize: 15,
    fontFamily: 'Figtree-Medium',
  },
  sourceTextTablet: {
    fontSize: 15,
    fontFamily: 'Figtree-Medium',
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
    fontFamily: 'Figtree-Bold',
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
    fontFamily: 'Figtree-Bold',
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

  // If all critical props are the same, skip re-render
  return true;
};

export default React.memo(VideoOverlayUI, arePropsEqual);
