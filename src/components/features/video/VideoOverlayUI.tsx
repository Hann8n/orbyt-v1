import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../theme';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import {
  useOverlayLayout,
  OVERLAY_LAYOUT_FALLBACK_BOTTOM_NAV,
} from '../../../context/OverlayLayoutContext';
import { HeartFillIcon, ChatFillIcon, RefreshFillIcon, MoreFillIcon } from '../../ui/Icon';
import { isCurrentUser } from '../../../stores/profileInteractionStore';
import { Avatar } from '../../ui/UI';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import { VerificationBadge } from '../badging';
import { useGlobalShareSheet, useGlobalCommentSection } from '../../../hooks/useGlobalModals';
import { useRouter, useSegments } from 'expo-router';
import { useFollowContext } from '../../../context/FollowContext';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchProfile } from '../../../services/data/ProfileService';
import type { ExtendedPostView, PostRecord, StatusView } from '../../../services/api/types';
import type { RichTextFacet } from '../../../utils/types/richText';
import { type ProfileColorScheme, pickLighterHex } from '../../../utils/formatting/colors';
import { useFollowStore } from '../../../stores/followStore';

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
  /** From VideoCard's useProfile (avoids duplicate useProfile in overlay). */
  authorProfileOverlay?: {
    isAuthorBlocked: boolean;
    profileColors: ProfileColorScheme | null | undefined;
    authorDid: string | null | undefined;
    authorProfileStatus: StatusView | null | undefined;
  };
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
  authorProfileOverlay,
}) => {
  const {
    isAuthorBlocked = false,
    profileColors: profileColorsProp,
    authorDid: authorDidProp,
    authorProfileStatus,
  } = authorProfileOverlay ?? {};
  const overlayLayout = useOverlayLayout();
  const deviceLayout = useDeviceLayout();
  const isTabletDevice = overlayLayout?.isTablet ?? deviceLayout.isTablet;
  const isCompactDeviceValue = overlayLayout?.isCompactDevice ?? deviceLayout.isCompact;
  const bottomNavBarHeight =
    overlayLayout?.bottomNavBarHeight ?? OVERLAY_LAYOUT_FALLBACK_BOTTOM_NAV;

  const { screenWidth: width } = deviceLayout;
  const { presentShareSheet } = useGlobalShareSheet();
  const { presentCommentSection } = useGlobalCommentSection();
  const navigation = useRouter();
  const segments = useSegments();
  const hasTabBar = Array.isArray(segments) && segments[0] === '(tabs)';
  const queryClient = useQueryClient();

  // Overlay state
  const [isOverlayCollapsed, setIsOverlayCollapsed] = useState(true);

  // Memoize expensive calculations to prevent rerenders
  const author = useMemo(() => post.author || {}, [post.author]);
  const record = useMemo(() => post.record as PostRecord | undefined, [post.record]);

  // isAuthorBlocked, profileColors, authorDid, authorProfileStatus from VideoCard's single useProfile
  const profileColors = profileColorsProp ?? undefined;
  const ringColor = profileColors
    ? pickLighterHex(profileColors.backgroundColor, profileColors.foregroundColor)
    : undefined;
  const authorDid = authorDidProp ?? author.did;

  const profilePicUrl = useMemo(
    () => (author.avatar && author.avatar.startsWith('http') ? author.avatar : undefined),
    [author.avatar]
  );

  const toggleCollapsed = useCallback(() => {
    setIsOverlayCollapsed(prev => !prev);
  }, []);

  // Reset text state when post changes
  useEffect(() => {
    setIsOverlayCollapsed(true);
  }, [post?.uri, record?.text]);

  // Heuristic to detect long text without layout measurement
  const hasLongText = useMemo(
    () => typeof record?.text === 'string' && record.text.length > 140,
    [record?.text]
  );

  // Modal-aware navigation to AuthorProfile (works inside FeedModal or regular screens)
  const navigateToAuthorProfile = useCallback(
    (
      rawDid?: string | null,
      authorData?: { did?: string; handle?: string; displayName?: string; avatar?: string }
    ) => {
      const cleanDid = (rawDid || authorData?.did || '').trim();
      if (!cleanDid) return;

      // Prefetch profile with partial data for instant UI + full data in background
      if (queryClient) {
        prefetchProfile(
          queryClient,
          cleanDid,
          authorData
            ? {
                did: cleanDid,
                handle: authorData.handle,
                displayName: authorData.displayName,
                avatar: authorData.avatar,
              }
            : undefined
        );
      }

      navigation.navigate({
        pathname: '/profile/[did]',
        params: { did: cleanDid },
      });
    },
    [navigation, queryClient]
  );

  // Navigation to hashtag feed
  const navigateToHashtagFeed = useCallback(
    (hashtag: string) => {
      navigation.navigate({
        pathname: '/(modals)/feed',
        params: {
          feedOption: `hashtag:${hashtag}`,
          backgroundColor: Colors.black,
          searchQuery: `#${hashtag}`,
        },
      });
    },
    [navigation]
  );

  // Consolidated handle extraction helper
  const extractHandle = useCallback(
    (
      handle: string | null | undefined,
      authorData?: { did?: string; handle?: string; displayName?: string; avatar?: string }
    ) => {
      const cleanDid = authorData?.did || handle?.trim();
      if (cleanDid) {
        navigateToAuthorProfile(cleanDid, authorData);
      }
    },
    [navigateToAuthorProfile]
  );

  // Handle author press
  const handleAuthorPress = useCallback(() => {
    extractHandle(author.handle, author);
  }, [author, extractHandle]);

  // Handle repost author press
  const handleRepostAuthorPress = useCallback(() => {
    extractHandle(post.repostedBy?.handle, post.repostedBy);
  }, [post.repostedBy, extractHandle]);

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

  // Memoize icon size calculation (reused multiple times)
  const effectiveIconSize = useMemo(
    () => (isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize),
    [isTabletDevice, actionIconSize]
  );
  const shareIconSize = useMemo(
    () => (isTabletDevice ? Math.max(actionIconSize - 6, 24) : actionIconSize - 6),
    [isTabletDevice, actionIconSize]
  );

  // Memoize formatted values to prevent recalculation
  const formattedAuthorHandle = useMemo(() => formatHandle(author.handle), [author.handle]);
  const formattedRepostHandle = useMemo(
    () => formatHandle(post.repostedBy?.handle || ''),
    [post.repostedBy?.handle]
  );
  const formattedLikeCount = useMemo(() => formatNumber(likeCount), [likeCount]);
  const formattedRepostCount = useMemo(() => formatNumber(repostCount), [repostCount]);
  const formattedCommentCount = useMemo(
    () => formatNumber(post.replyCount || 0),
    [post.replyCount]
  );

  // Memoize icon rendering to prevent unnecessary recreations
  const renderLikeIcon = useCallback(
    () => (
      <Animated.View style={likeAnimatedStyle}>
        <HeartFillIcon
          size={effectiveIconSize}
          color={isLiked ? Colors.coral[500] : Colors.neutral[50]}
        />
      </Animated.View>
    ),
    [likeAnimatedStyle, effectiveIconSize, isLiked]
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

  // Reset Reanimated shared values when cell is recycled (FlashList) so previous item's
  // like/repost press animation does not show on the new post (see FlashList + Reanimated guide)
  useEffect(() => {
    // Reanimated shared values are intentionally mutated for FlashList recycle reset
    // eslint-disable-next-line react-hooks/immutability
    likeScale.value = 1;
    // eslint-disable-next-line react-hooks/immutability
    repostScale.value = 1;
    // eslint-disable-next-line react-hooks/immutability
    repostRotate.value = 0;
  }, [post?.uri, likeScale, repostScale, repostRotate]);

  const renderRepostIcon = useCallback(
    () => (
      <Animated.View style={repostAnimatedStyle}>
        <RefreshFillIcon
          size={effectiveIconSize}
          color={isReposted ? Colors.teal[500] : Colors.neutral[50]}
        />
      </Animated.View>
    ),
    [repostAnimatedStyle, effectiveIconSize, isReposted]
  );

  const commentIcon = useMemo(
    () => <ChatFillIcon size={effectiveIconSize} color={Colors.neutral[50]} />,
    [effectiveIconSize]
  );

  // Follow state and mutation - subscribe directly to follow store for this author
  const { followMutation, currentUser } = useFollowContext();

  // Efficiently subscribe to only this author's isFollowing boolean in the store
  // Selecting just the boolean ensures re-renders only when follow state changes
  const storeIsFollowing = useFollowStore(state =>
    authorDid ? state.follows.get(authorDid)?.isFollowing : undefined
  );

  // Combine prop (fallback) with store state (source of truth)
  const actualIsFollowing = storeIsFollowing ?? isFollowing;

  const isCurrentUserProfile = useMemo(
    () => isCurrentUser(post.author?.did, post.author?.handle, currentUser),
    [post.author?.did, post.author?.handle, currentUser]
  );

  // Extract inline handlers to prevent recreation on every render
  const handleLikePress = useCallback(() => {
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
  }, [isLiked, onLike, likeScale]);

  const handleRepostPress = useCallback(() => {
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
  }, [isReposted, onRepost, repostScale, repostRotate]);

  const handleCommentPress = useCallback(() => {
    presentCommentSection({
      post,
      totalLikes: likeCount,
      totalComments: post.replyCount || 0,
      isLiked,
      postedAt: (post.record?.createdAt || post.indexedAt) as string | undefined,
      onToggleLike: onLike,
      isLikePending,
    });
  }, [post, likeCount, isLiked, onLike, isLikePending, presentCommentSection]);

  const handleFollowPress = useCallback(() => {
    if (!post.author?.handle) return;
    followMutation.mutate(
      { did: post.author?.did, handle: post.author.handle, isFollowing: true },
      {}
    );
  }, [post.author?.handle, post.author?.did, followMutation]);

  const showFollowText = hasProfile && !actualIsFollowing && !isCurrentUserProfile;

  // Memoize dynamic styles to prevent style object recreation to prevent style object recreation
  const overlayContentStyle = useMemo(
    () => [
      styles.overlayContentContainer,
      { padding: contentPadding },
      isModal
        ? { bottom: 0 }
        : hasTabBar && isCompactDeviceValue
          ? { bottom: bottomNavBarHeight }
          : {},
    ],
    [contentPadding, isModal, isCompactDeviceValue, bottomNavBarHeight, hasTabBar]
  );

  // Opacity from composed overlayOpacitySV (itemVisibility + overlayVisibility + scrubbing)
  // No extra withTiming - composed value already animates via itemVisibilitySV in VideoCard
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const opacityValue = overlayOpacitySV ? overlayOpacitySV.value : 1;
    return { opacity: opacityValue };
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
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <View style={styles.repostIconWrapper}>
                    <RefreshFillIcon size={isTabletDevice ? 26 : 24} color={Colors.neutral[200]} />
                  </View>
                  <Text
                    style={[
                      isTabletDevice
                        ? styles.repostIndicatorTextTablet
                        : styles.repostIndicatorText,
                      styles.repostTextOpacity,
                    ]}
                  >
                    {`reposted by ${formattedRepostHandle}`}
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
            <View style={styles.authorInfoContainer}>
              <View style={styles.avatarContainer}>
                <Pressable
                  onPress={handleAuthorPress}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Avatar
                    uri={profilePicUrl}
                    type="profile"
                    size={authorAvatarSize}
                    showRing={!!profileColors}
                    ringColor={ringColor}
                    blurRadius={isAuthorBlocked ? 30 : 0}
                    status={authorProfileStatus ?? undefined}
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
                </Pressable>
              </View>
              <View style={styles.authorTextContainer}>
                <View style={styles.authorNameRow}>
                  <Pressable
                    onPress={handleAuthorPress}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Text
                      style={[
                        styles.baseText,
                        isTabletDevice ? styles.authorNameTablet : styles.authorName,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {formattedAuthorHandle}
                    </Text>
                  </Pressable>
                  {author.handle && (
                    <VerificationBadge
                      handle={author.handle}
                      size={isTabletDevice ? 22 : 20}
                      customMargin={2}
                      textColor={Colors.neutral[50]}
                    />
                  )}
                  {showFollowText && (
                    <>
                      <Text
                        style={[
                          isTabletDevice ? styles.authorNameTablet : styles.authorName,
                          styles.followSeparator,
                        ]}
                      >
                        {' · '}
                      </Text>
                      <Pressable
                        onPress={handleFollowPress}
                        disabled={followMutation.isPending}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 6 }}
                      >
                        <Text
                          style={[
                            styles.baseText,
                            isTabletDevice ? styles.authorNameTablet : styles.authorName,
                            styles.followText,
                          ]}
                        >
                          Follow
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
                {channelSlug ? (
                  <Pressable
                    style={styles.sourceIndicatorContainer}
                    onPress={onChannelPress}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text
                      style={[
                        isTabletDevice ? styles.sourceTextTablet : styles.sourceText,
                        styles.sourceTextOpacity,
                      ]}
                    >
                      <Text style={isTabletDevice ? styles.sourceSlashTablet : styles.sourceSlash}>
                        /
                      </Text>
                      {channelSlug}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionsContainer} pointerEvents="box-none">
            <Pressable
              style={[
                styles.baseActionButton,
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
              ]}
              onPress={handleSharePress}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <View style={styles.iconContainer}>
                <MoreFillIcon size={shareIconSize} color={Colors.neutral[50]} />
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.baseActionButton,
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
                isRepostPending && styles.actionButtonDisabled,
              ]}
              onPress={handleRepostPress}
              disabled={isRepostPending}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              {renderRepostIcon()}
              <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>
                {formattedRepostCount}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.baseActionButton,
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
              ]}
              onPress={handleCommentPress}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              {commentIcon}
              <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>
                {formattedCommentCount}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.baseActionButton,
                isTabletDevice ? styles.actionButtonTablet : styles.actionButton,
                isLikePending && styles.actionButtonDisabled,
              ]}
              onPress={handleLikePress}
              disabled={isLikePending}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              {renderLikeIcon()}
              <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>
                {formattedLikeCount}
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
    zIndex: 12, // Above scrubber (z 10) so overlay hitboxes (avatar, handle, actions) are always tappable
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
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-SemiBold',
    marginLeft: 6,
    includeFontPadding: false,
    lineHeight: 18,
  },
  repostIndicatorTextTablet: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
    marginLeft: 6,
    includeFontPadding: false,
    lineHeight: 20,
  },
  repostIndicatorBox: {
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    marginBottom: 0,
    alignSelf: 'flex-start',
  },
  descriptionContainer: {
    marginBottom: 6,
    paddingRight: 10,
    shadowColor: Colors.neutral[200],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 1.5,
  },
  descriptionText: {
    color: Colors.neutral[50],
    fontSize: 17,
    fontFamily: 'Figtree-Medium',
    lineHeight: 22,
    textShadowColor: Colors.overlay.black50,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  authorInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.neutral[200],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 1.5,
  },
  avatarContainer: {
    position: 'relative',
    overflow: 'visible',
  },
  authorTextContainer: {
    marginLeft: 8,
    flex: 1,
    marginRight: 20,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  followSeparator: {
    marginHorizontal: 4,
    color: Colors.neutral[50],
    opacity: 0.5,
    fontFamily: 'Figtree-Black',
  },
  followText: {
    opacity: 0.9,
  },
  baseText: {
    color: Colors.neutral[50],
    textShadowColor: Colors.overlay.black50,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  authorName: {
    fontSize: 17,
    fontFamily: 'Figtree-Bold',
    lineHeight: 24,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameTablet: {
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
    lineHeight: 24,
    includeFontPadding: false,
    flexShrink: 1,
  },
  sourceIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    paddingHorizontal: 0,
  },
  sourceSlash: {
    fontFamily: 'Figtree-SemiBold',
  },
  sourceSlashTablet: {
    fontFamily: 'Figtree-SemiBold',
  },
  sourceText: {
    fontSize: 16,
    fontFamily: 'Figtree-Bold',
  },
  sourceTextTablet: {
    fontSize: 16,
    fontFamily: 'Figtree-Bold',
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginLeft: 5,
    marginBottom: 0,
    shadowColor: Colors.neutral[200],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 1.5,
  },
  baseActionButton: {
    alignItems: 'center',
    shadowColor: Colors.overlay.black50,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 0,
    width: 36.5,
  },
  actionButton: {
    marginVertical: 4,
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
    color: Colors.neutral[50],
    fontSize: 12.5,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: Colors.overlay.black35,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0.5,
  },
  actionTextTablet: {
    color: Colors.neutral[50],
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
    marginTop: 3,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: Colors.overlay.black35,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0.5,
  },
  actionButtonDisabled: {
    // Removed opacity transparency effect
  },
  repostIconWrapper: {
    opacity: 0.8,
  },
  repostTextOpacity: {
    opacity: 0.8,
  },
  sourceTextOpacity: {
    color: Colors.neutral[50],
    opacity: 0.7,
  },
});

// Custom comparison function to prevent unnecessary re-renders
// Only re-render if critical props change (isFollowing/hasProfile/channelSlug affect follow badge and channel indicator)
const arePropsEqual = (prevProps: VideoOverlayUIProps, nextProps: VideoOverlayUIProps) => {
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.post?.uri !== nextProps.post?.uri) return false;

  // Interaction states
  if (prevProps.isLiked !== nextProps.isLiked) return false;
  if (prevProps.isReposted !== nextProps.isReposted) return false;
  if (prevProps.likeCount !== nextProps.likeCount) return false;
  if (prevProps.repostCount !== nextProps.repostCount) return false;
  if (prevProps.isLikePending !== nextProps.isLikePending) return false;
  if (prevProps.isRepostPending !== nextProps.isRepostPending) return false;

  // Follow badge and channel indicator
  if (prevProps.isFollowing !== nextProps.isFollowing) return false;
  if (prevProps.hasProfile !== nextProps.hasProfile) return false;
  if (prevProps.channelSlug !== nextProps.channelSlug) return false;

  if (prevProps.authorProfileOverlay !== nextProps.authorProfileOverlay) return false;

  if (prevProps.isModal !== nextProps.isModal) return false;
  if (prevProps.feedOption !== nextProps.feedOption) return false;

  return true;
};

export default React.memo(VideoOverlayUI, arePropsEqual);
