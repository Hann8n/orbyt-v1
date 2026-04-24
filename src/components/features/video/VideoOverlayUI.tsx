import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedChannelDisplayNameFromSlug } from '../../../utils/channels/orbyt';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../theme';
import { Typography, FontFamily } from '@/utils/components/typography';
import { NanoIcon } from '../../ui/NanoIcon';
import { Avatar } from '../../ui/UI';
import { formatNumber } from '../../../utils/formatting/numbers';
import { formatHandle } from '../../../utils/formatting/handles';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import { VerificationBadge, BotBadge } from '../badging';
import { useRecyclingState } from '@shopify/flash-list';
import type { ExtendedPostView, PostRecord, StatusView } from '../../../services/api/types';
import type { RichTextFacet } from '../../../utils/types/richText';
import { type ProfileColorScheme, hexToRGBA } from '../../../utils/formatting/colors';
import { sharedItemStyles } from '@/components/ui/ItemStyles';

const GRADIENT_SHIM = require('../../../assets/embed-video-gradient-shim.png');
const HIT_SLOP_12 = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const HIT_SLOP_6 = { top: 6, bottom: 6, left: 6, right: 6 } as const;
const HIT_SLOP_8_6 = { top: 8, bottom: 8, left: 6, right: 6 } as const;
const HIT_SLOP_8_4_6 = { top: 8, bottom: 8, left: 4, right: 6 } as const;
const HIT_SLOP_6_4 = { top: 6, bottom: 6, left: 4, right: 4 } as const;
const HIT_SLOP_14 = { top: 14, bottom: 14, left: 14, right: 14 } as const;

type Post = ExtendedPostView;
const widthStyleCache = new Map<number, { width: number }>();

const getWidthStyle = (width: number): { width: number } => {
  const normalized = Math.max(0, Math.round(width));
  const cached = widthStyleCache.get(normalized);
  if (cached) return cached;
  const style = { width: normalized };
  widthStyleCache.set(normalized, style);
  return style;
};

export interface VideoOverlayUIProps {
  post: Post;
  sourceFeed?: string;
  // Optional composed shared opacity to tie overlay and scrubber together
  overlayOpacitySV?: SharedValue<number>;
  /** Fires when the description text collapses/expands (collapsed = 1 line). */
  onOverlayCollapsedChange?: (isCollapsed: boolean) => void;
  onLike?: () => void;
  onRepost?: () => void;
  isLiked?: boolean;
  isReposted?: boolean;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  isLikePending?: boolean;
  isRepostPending?: boolean;
  isFollowing?: boolean;
  hasProfile?: boolean;
  isCurrentUserProfile?: boolean;
  channelSlug?: string | null;
  onChannelPress?: () => void;
  /** Callbacks moved from VideoOverlayUI to VideoCard — overlay is now presentational. */
  onAuthorPress?: (
    identifier: string,
    data?: { did?: string; handle?: string; displayName?: string; avatar?: string }
  ) => void;
  onRepostAuthorPress?: () => void;
  onOpenComments?: () => void;
  onSharePress?: () => void;
  onFollowPress?: () => void;
  onHashtagPress?: (hashtag: string) => void;
  /** From VideoCard's useProfile (avoids duplicate useProfile in overlay). */
  authorProfileOverlay?: {
    isAuthorBlocked: boolean;
    profileColors: ProfileColorScheme | null | undefined;
    authorDid: string | null | undefined;
    authorProfileStatus: StatusView | null | undefined;
  };
}

function VideoOverlayUI({
  post,
  sourceFeed: _sourceFeed,
  overlayOpacitySV,
  onOverlayCollapsedChange,
  onLike,
  onRepost,
  isLiked = false,
  isReposted = false,
  likeCount = 0,
  commentCount = 0,
  repostCount = 0,
  isLikePending = false,
  isRepostPending = false,
  isFollowing = false,
  hasProfile = false,
  isCurrentUserProfile = false,
  channelSlug,
  onChannelPress,
  onAuthorPress,
  onRepostAuthorPress,
  onOpenComments,
  onSharePress,
  onFollowPress,
  onHashtagPress,
  authorProfileOverlay,
}: VideoOverlayUIProps) {
  const { t } = useTranslation();
  const {
    isAuthorBlocked = false,
    profileColors: profileColorsProp,
    authorProfileStatus,
  } = authorProfileOverlay ?? {};
  const { width } = useWindowDimensions();

  const [isOverlayCollapsed, setIsOverlayCollapsed] = useRecyclingState(true, [
    post?.uri,
    post?.record,
  ]);
  const [captionMeasureWidth, setCaptionMeasureWidth] = useState(0);
  const [descriptionOverflows, setDescriptionOverflows] = useRecyclingState<boolean | null>(null, [
    post?.uri,
    post?.record,
    width,
  ]);

  // Memoize expensive calculations to prevent rerenders
  const author = useMemo(() => post.author || {}, [post.author]);
  const record = useMemo(() => post.record as PostRecord | undefined, [post.record]);
  const hasDescription = Boolean(record?.text?.trim());

  // isAuthorBlocked, profileColors, authorProfileStatus from VideoCard's single useProfile
  const profileColors = profileColorsProp ?? undefined;
  const ringColor = profileColors?.textColor;

  const profilePicUrl = useMemo(
    () => (author.avatar && author.avatar.startsWith('http') ? author.avatar : undefined),
    [author.avatar]
  );

  const toggleCollapsed = useCallback(() => {
    setIsOverlayCollapsed(prev => !prev);
  }, [setIsOverlayCollapsed]);

  const onCaptionHostLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setCaptionMeasureWidth(prev => (w > 0 && w !== prev ? w : prev));
  }, []);

  const onDescriptionOverflowMeasure = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const nextOverflows = e.nativeEvent.lines.length > 1;
      setDescriptionOverflows(prev => (prev === nextOverflows ? prev : nextOverflows));
    },
    [setDescriptionOverflows]
  );

  useEffect(() => {
    if (!hasDescription || descriptionOverflows === null) {
      onOverlayCollapsedChange?.(true);
      return;
    }
    if (!descriptionOverflows) {
      onOverlayCollapsedChange?.(true);
      return;
    }
    onOverlayCollapsedChange?.(isOverlayCollapsed);
  }, [hasDescription, descriptionOverflows, isOverlayCollapsed, onOverlayCollapsedChange]);

  // Memoize UI calculations to prevent recalculation on every render
  const likeScale = useSharedValue(1);
  const likeAnimatedStyle = useAnimatedStyle(() => {
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
  const moreMenuIconSize = Math.max(Math.round(actionIconSize * 0.68), 18);
  const captionMeasureWidthStyle = useMemo(
    () => getWidthStyle(captionMeasureWidth),
    [captionMeasureWidth]
  );
  const repostIndicatorTextStyle = useMemo(
    () => StyleSheet.compose(styles.repostIndicatorText, styles.repostTextOpacity),
    []
  );
  const descriptionMeasureLayerStyle = useMemo(
    () => StyleSheet.compose(styles.descriptionMeasureLayer, captionMeasureWidthStyle),
    [captionMeasureWidthStyle]
  );
  const descriptionMeasureTextStyle = useMemo(
    () => StyleSheet.compose(styles.descriptionText, captionMeasureWidthStyle),
    [captionMeasureWidthStyle]
  );
  const descriptionCollapsedTextStyle = useMemo(
    () => StyleSheet.compose(styles.descriptionText, styles.descriptionTextFlexible),
    []
  );
  const descriptionToggleStyle = useMemo(
    () => StyleSheet.compose(styles.descriptionToggleSurface, styles.descriptionTogglePressable),
    []
  );
  const avatarContainerStyle = useMemo(
    () => StyleSheet.compose(styles.avatarContainer, sharedItemStyles.avatarContainer),
    []
  );
  const authorTextContainerStyle = useMemo(
    () => StyleSheet.compose(styles.authorTextContainer, sharedItemStyles.accountInfoContainer),
    []
  );
  const authorNameTextStyle = useMemo(
    () => StyleSheet.compose(styles.baseText, styles.authorName),
    []
  );
  const followSeparatorStyle = useMemo(
    () => StyleSheet.compose(styles.authorName, styles.followSeparator),
    []
  );
  const followTextStyle = useMemo(
    () =>
      StyleSheet.compose(StyleSheet.compose(styles.baseText, styles.authorName), styles.followText),
    []
  );
  const sourceTextStyle = useMemo(
    () => StyleSheet.compose(styles.sourceText, styles.sourceTextOpacity),
    []
  );
  const avatarProfileColors = useMemo(
    () =>
      profileColors
        ? {
            backgroundColor: profileColors.backgroundColor,
            foregroundColor: profileColors.foregroundColor,
            textColor: profileColors.textColor,
          }
        : undefined,
    [profileColors]
  );

  // Simple formatting helpers are cheap; keep values as plain derived constants.
  const formattedAuthorHandle = formatHandle(author.handle);
  const formattedRepostHandle = formatHandle(post.repostedBy?.handle || '');
  const formattedLikeCount = formatNumber(likeCount);
  const formattedRepostCount = formatNumber(repostCount);
  const formattedCommentCount = formatNumber(commentCount);

  // Repost animation: quick tilt (wiggle) + slight scale pulse
  const repostScale = useSharedValue(1);
  const repostRotate = useSharedValue(0); // radians
  const repostAnimatedStyle = useAnimatedStyle(() => {
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

  const commentIcon = (
    <NanoIcon name="chat-fill" size={actionIconSize} color={Colors.neutral[50]} />
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
    onOpenComments?.();
  }, [onOpenComments]);

  const handleFollowPress = useCallback(() => {
    onFollowPress?.();
  }, [onFollowPress]);

  const showFollowText = hasProfile && !isFollowing && !isCurrentUserProfile;

  // Memoize dynamic styles to prevent style object recreation to prevent style object recreation
  // Pin to the bottom of the video card only. Feed list height already excludes the tab bar
  // (see ListFeedView maxViewportAboveTabBar); do not inset by bottomNavBarHeight or the overlay floats.
  const overlayContentStyle = useMemo(
    () => [
      styles.overlayContentContainer,
      {
        paddingHorizontal: contentPadding,
        paddingTop: contentPadding,
        paddingBottom: contentPadding,
      },
    ],
    [contentPadding]
  );

  // Stable adapters so optional callbacks satisfy TextWithAuthorLinks' required prop types.
  const handleAvatarAndNamePress = useCallback(() => {
    onAuthorPress?.(author.did ?? author.handle ?? '', author);
  }, [onAuthorPress, author]);

  const authorLinkPressHandler = useCallback(
    (identifier: string, data?: { did?: string }) => {
      onAuthorPress?.(identifier, data);
    },
    [onAuthorPress]
  );

  // Opacity from composed overlayOpacitySV (scroll overlap × scrubbing) in VideoCard
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const opacityValue = overlayOpacitySV ? overlayOpacitySV.value : 1;
    return { opacity: opacityValue };
  });
  const overlayContainerStyle = useMemo(
    () => StyleSheet.compose(styles.overlayContainer, overlayAnimatedStyle),
    [overlayAnimatedStyle]
  );

  return (
    <>
      <Animated.View style={overlayContainerStyle} pointerEvents="box-none">
        <Image
          source={GRADIENT_SHIM}
          style={styles.gradientShimTop}
          contentFit="cover"
          pointerEvents="none"
          accessible={false}
        />
        <Image
          source={GRADIENT_SHIM}
          style={styles.gradientShim}
          contentFit="cover"
          pointerEvents="none"
          accessible={false}
        />
        <View style={overlayContentStyle} pointerEvents="box-none">
          <View style={styles.infoColumn} pointerEvents="box-none">
            {/* Repost indicator - repost icon + name text */}
            {post.repostedBy && (
              <View style={styles.repostIndicatorBox}>
                <NativePressable
                  style={styles.repostIndicatorContainer}
                  onPress={onRepostAuthorPress}
                  hitSlop={HIT_SLOP_12}
                >
                  <View style={styles.repostIconWrapper}>
                    <NanoIcon name="refresh-fill" size={24} color={Colors.neutral[200]} />
                  </View>
                  <Text style={repostIndicatorTextStyle}>
                    {t('feed.repostedBy', { handle: formattedRepostHandle })}
                  </Text>
                </NativePressable>
              </View>
            )}

            {hasDescription && (
              <View style={styles.descriptionContainer}>
                <View style={styles.descriptionMeasureHost} onLayout={onCaptionHostLayout}>
                  {descriptionOverflows === null && captionMeasureWidth > 0 ? (
                    <View
                      pointerEvents="none"
                      style={descriptionMeasureLayerStyle}
                      collapsable={false}
                    >
                      <TextWithAuthorLinks
                        text={record?.text ?? ''}
                        style={descriptionMeasureTextStyle}
                        onTextLayout={onDescriptionOverflowMeasure}
                        onAuthorPress={authorLinkPressHandler}
                        onHashtagPress={onHashtagPress}
                        facets={record?.facets as RichTextFacet[] | undefined}
                      />
                    </View>
                  ) : null}

                  <View style={styles.descriptionCaptionColumn}>
                    {descriptionOverflows === true && isOverlayCollapsed ? (
                      <View style={styles.descriptionInlineToggleRow}>
                        <TextWithAuthorLinks
                          text={record?.text ?? ''}
                          style={descriptionCollapsedTextStyle}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          onAuthorPress={authorLinkPressHandler}
                          onHashtagPress={onHashtagPress}
                          facets={record?.facets as RichTextFacet[] | undefined}
                        />
                        <SquircleNativePressable
                          onPress={toggleCollapsed}
                          hitSlop={HIT_SLOP_6_4}
                          accessibilityRole="button"
                          accessibilityLabel={t('feed.showMore')}
                          style={descriptionToggleStyle}
                        >
                          <Text style={styles.descriptionToggleButtonLabel}>
                            {t('feed.showMore')}
                          </Text>
                        </SquircleNativePressable>
                      </View>
                    ) : descriptionOverflows === true && !isOverlayCollapsed ? (
                      <View style={styles.descriptionExpandedWithToggle}>
                        <TextWithAuthorLinks
                          text={record?.text ?? ''}
                          style={styles.descriptionText}
                          onAuthorPress={authorLinkPressHandler}
                          onHashtagPress={onHashtagPress}
                          facets={record?.facets as RichTextFacet[] | undefined}
                        />
                        <View style={styles.descriptionInlineToggleRow}>
                          <View style={styles.descriptionTextFlexible} />
                          <SquircleNativePressable
                            onPress={toggleCollapsed}
                            hitSlop={HIT_SLOP_6_4}
                            accessibilityRole="button"
                            accessibilityLabel={t('feed.showLess')}
                            style={descriptionToggleStyle}
                          >
                            <Text style={styles.descriptionToggleButtonLabel}>
                              {t('feed.showLess')}
                            </Text>
                          </SquircleNativePressable>
                        </View>
                      </View>
                    ) : (
                      <TextWithAuthorLinks
                        text={record?.text ?? ''}
                        style={styles.descriptionText}
                        numberOfLines={descriptionOverflows === null ? 1 : undefined}
                        ellipsizeMode={descriptionOverflows === null ? 'tail' : undefined}
                        onAuthorPress={authorLinkPressHandler}
                        onHashtagPress={onHashtagPress}
                        facets={record?.facets as RichTextFacet[] | undefined}
                      />
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* Author info */}
            <View style={styles.authorInfoContainer}>
              <View style={avatarContainerStyle}>
                <NativePressable onPress={handleAvatarAndNamePress} hitSlop={HIT_SLOP_6}>
                  <Avatar
                    uri={profilePicUrl}
                    type="profile"
                    size={authorAvatarSize}
                    showRing={!!profileColors}
                    ringColor={ringColor}
                    blurRadius={isAuthorBlocked ? 30 : 0}
                    status={authorProfileStatus ?? undefined}
                    profileColors={avatarProfileColors}
                  />
                </NativePressable>
              </View>
              <View style={authorTextContainerStyle}>
                <View style={styles.authorNameRow}>
                  <NativePressable
                    style={styles.authorNamePressable}
                    onPress={handleAvatarAndNamePress}
                    hitSlop={HIT_SLOP_8_6}
                  >
                    <Text style={authorNameTextStyle} numberOfLines={1} ellipsizeMode="tail">
                      {formattedAuthorHandle}
                    </Text>
                  </NativePressable>
                  {author.handle && (
                    <View style={styles.authorBadgeWrapper}>
                      <VerificationBadge
                        handle={author.handle}
                        size={20}
                        customMargin={2}
                        textColor={Colors.neutral[50]}
                      />
                      <BotBadge
                        handle={author.handle}
                        did={author.did}
                        labels={author.labels}
                        size={20}
                        customMargin={2}
                        textColor={Colors.neutral[50]}
                      />
                    </View>
                  )}
                  {showFollowText && (
                    <>
                      <Text style={followSeparatorStyle}>{' · '}</Text>
                      <View style={styles.followButtonWrapper}>
                        <NativePressable onPress={handleFollowPress} hitSlop={HIT_SLOP_8_4_6}>
                          <Text style={followTextStyle}>{t('profile.follow')}</Text>
                        </NativePressable>
                      </View>
                    </>
                  )}
                </View>
                {channelSlug ? (
                  <NativePressable
                    style={styles.sourceIndicatorContainer}
                    onPress={onChannelPress}
                    hitSlop={HIT_SLOP_12}
                  >
                    <Text style={sourceTextStyle}>
                      <Text style={styles.sourceSlash}>/</Text>
                      {getLocalizedChannelDisplayNameFromSlug(channelSlug, channelSlug)}
                    </Text>
                  </NativePressable>
                ) : null}
              </View>
            </View>
          </View>

          {/* Action buttons — Pressable (no NativePressable dim); like/repost use Animated feedback inside */}
          <View style={styles.actionsContainer} pointerEvents="box-none">
            <Pressable style={styles.baseActionButton} onPress={onSharePress} hitSlop={HIT_SLOP_14}>
              <View style={styles.moreMenuIconContainer}>
                <NanoIcon name="more-fill" size={moreMenuIconSize} color={Colors.neutral[50]} />
              </View>
            </Pressable>

            <Pressable
              style={styles.baseActionButton}
              onPress={handleRepostPress}
              disabled={isRepostPending}
              hitSlop={HIT_SLOP_14}
            >
              <Animated.View style={repostAnimatedStyle}>
                <NanoIcon
                  name="refresh-fill"
                  size={actionIconSize}
                  color={isReposted ? Colors.teal[500] : Colors.neutral[50]}
                />
              </Animated.View>
              <Text style={styles.actionText}>{formattedRepostCount}</Text>
            </Pressable>

            <Pressable
              style={styles.baseActionButton}
              onPress={handleCommentPress}
              hitSlop={HIT_SLOP_14}
            >
              {commentIcon}
              <Text style={styles.actionText}>{formattedCommentCount}</Text>
            </Pressable>

            <Pressable
              style={styles.baseActionButton}
              onPress={handleLikePress}
              disabled={isLikePending}
              hitSlop={HIT_SLOP_14}
            >
              <Animated.View style={likeAnimatedStyle}>
                <NanoIcon
                  name="heart-fill"
                  size={actionIconSize}
                  color={isLiked ? Colors.coral[500] : Colors.neutral[50]}
                />
              </Animated.View>
              <Text style={styles.actionText}>{formattedLikeCount}</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </>
  );
}

// Styles
const styles = StyleSheet.create({
  gradientShimTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 220,
    opacity: 0.5,
  },
  gradientShim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
    transform: [{ scaleY: -1 }],
    opacity: 0.92,
  },
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
    padding: 14,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  infoColumn: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    gap: 6,
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
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.semibold,
    marginLeft: 6,
    includeFontPadding: false,
    lineHeight: Typography.lineHeights.bodySmall,
  },
  repostIndicatorBox: {
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    marginBottom: 0,
    alignSelf: 'flex-start',
  },
  descriptionContainer: {
    paddingRight: 10,
  },
  descriptionMeasureHost: {
    width: '100%',
    position: 'relative',
  },
  descriptionMeasureLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0,
    zIndex: -1,
  },
  descriptionCaptionColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  descriptionExpandedWithToggle: {
    width: '100%',
    flexDirection: 'column',
    gap: 6,
  },
  descriptionInlineToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 6,
  },
  descriptionTextFlexible: {
    flex: 1,
    minWidth: 0,
  },
  descriptionToggleSurface: {
    backgroundColor: hexToRGBA(Colors.neutral[50], 0.12),
    borderRadius: BORDER_RADIUS.SMALL,
    paddingVertical: 3,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  descriptionTogglePressable: {
    flexShrink: 0,
  },
  descriptionToggleButtonLabel: {
    color: Colors.overlay.white80,
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
    lineHeight: Typography.lineHeights.caption,
    includeFontPadding: false,
  },
  descriptionText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.medium,
    lineHeight: Typography.lineHeights.body,
    textShadowColor: Colors.transparent,
    textShadowRadius: 0,
  },
  authorInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    overflow: 'visible',
  },
  authorTextContainer: {
    marginRight: 20,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  authorNamePressable: {
    flexShrink: 1,
    minWidth: 0,
  },
  authorBadgeWrapper: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  followSeparator: {
    marginHorizontal: 4,
    color: Colors.neutral[50],
    opacity: 0.5,
    fontFamily: FontFamily.black,
    flexShrink: 0,
  },
  followButtonWrapper: {
    flexShrink: 0,
  },
  followText: {
    opacity: 0.9,
    flexShrink: 0,
  },
  baseText: {
    color: Colors.neutral[50],
    textShadowColor: Colors.transparent,
    textShadowRadius: 0,
  },
  authorName: {
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.bold,
    lineHeight: Typography.lineHeights.subtitle,
    includeFontPadding: false,
    flexShrink: 1,
    textShadowColor: Colors.transparent,
    textShadowRadius: 0,
  },
  sourceIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    paddingHorizontal: 0,
  },
  sourceSlash: {
    fontFamily: FontFamily.semibold,
  },
  sourceText: {
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.bold,
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 12,
    marginLeft: 5,
  },
  baseActionButton: {
    alignItems: 'center',
    width: 36.5,
  },
  moreMenuIconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.semibold,
    marginTop: 1,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: Colors.transparent,
    textShadowRadius: 0,
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

const arePropsEqual = (prevProps: VideoOverlayUIProps, nextProps: VideoOverlayUIProps) => {
  if (prevProps.post?.uri !== nextProps.post?.uri) return false;

  if (prevProps.isLiked !== nextProps.isLiked) return false;
  if (prevProps.isReposted !== nextProps.isReposted) return false;
  if (prevProps.likeCount !== nextProps.likeCount) return false;
  if (prevProps.commentCount !== nextProps.commentCount) return false;
  if (prevProps.repostCount !== nextProps.repostCount) return false;
  if (prevProps.isLikePending !== nextProps.isLikePending) return false;
  if (prevProps.isRepostPending !== nextProps.isRepostPending) return false;

  if (prevProps.isFollowing !== nextProps.isFollowing) return false;
  if (prevProps.hasProfile !== nextProps.hasProfile) return false;
  if (prevProps.channelSlug !== nextProps.channelSlug) return false;

  if (prevProps.sourceFeed !== nextProps.sourceFeed) return false;
  if (prevProps.overlayOpacitySV !== nextProps.overlayOpacitySV) return false;

  if (prevProps.onLike !== nextProps.onLike) return false;
  if (prevProps.onRepost !== nextProps.onRepost) return false;
  if (prevProps.onOverlayCollapsedChange !== nextProps.onOverlayCollapsedChange) return false;
  if (prevProps.onChannelPress !== nextProps.onChannelPress) return false;
  if (prevProps.onAuthorPress !== nextProps.onAuthorPress) return false;
  if (prevProps.onRepostAuthorPress !== nextProps.onRepostAuthorPress) return false;
  if (prevProps.onOpenComments !== nextProps.onOpenComments) return false;
  if (prevProps.onSharePress !== nextProps.onSharePress) return false;
  if (prevProps.onHashtagPress !== nextProps.onHashtagPress) return false;
  if (prevProps.isCurrentUserProfile !== nextProps.isCurrentUserProfile) return false;

  // Object identity changes are common; compare the fields this component actually reads.
  const prevOverlay = prevProps.authorProfileOverlay;
  const nextOverlay = nextProps.authorProfileOverlay;
  if ((prevOverlay?.isAuthorBlocked ?? false) !== (nextOverlay?.isAuthorBlocked ?? false))
    return false;
  if ((prevOverlay?.authorDid ?? null) !== (nextOverlay?.authorDid ?? null)) return false;
  if (prevOverlay?.authorProfileStatus !== nextOverlay?.authorProfileStatus) return false;
  if (prevOverlay?.profileColors !== nextOverlay?.profileColors) return false;

  return true;
};

export default memo(VideoOverlayUI, arePropsEqual);
