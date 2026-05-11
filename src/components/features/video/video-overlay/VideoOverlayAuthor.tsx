import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { NativePressable } from '@/components/ui/NativePressable';
import { BlurView } from '@/components/ui/BlurView';
import { sharedItemStyles } from '@/components/ui/ItemStyles';
import { Avatar } from '../../../ui/UI';
import { VerificationBadge, BotBadge } from '../../badging';
import { Colors } from '../../../../theme';
import { FontFamily, Typography } from '@/utils/components/typography';
import { formatHandle } from '../../../../utils/formatting/handles';
import { getLocalizedChannelDisplayNameFromSlug } from '../../../../utils/channels/orbyt';
import { BORDER_RADIUS } from '../../../../utils/constants';
import type { ProfileColorScheme } from '../../../../utils/formatting/colors';
import type {
  ExtendedPostView,
  ProfileViewWithOrbyt,
  StatusView,
} from '../../../../services/api/types';

const HIT_SLOP_12 = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const HIT_SLOP_8_6 = { top: 8, bottom: 8, left: 6, right: 6 } as const;
const HIT_SLOP_8_4_6 = { top: 8, bottom: 8, left: 4, right: 6 } as const;
const HIT_SLOP_6 = { top: 6, bottom: 6, left: 6, right: 6 } as const;

export interface VideoOverlayAuthorProps {
  post: ExtendedPostView;
  isFollowing: boolean;
  hasProfile: boolean;
  isCurrentUserProfile: boolean;
  channelSlug?: string | null;
  authorAvatarSize: number;
  isAuthorBlocked: boolean;
  authorProfileStatus?: StatusView | null;
  profileColors: ProfileColorScheme | null | undefined;
  /** Verification slice from the by-DID profile cache. Passed inline to
   *  VerificationBadge so it skips its own per-card `useProfile(handle)` query. */
  verification?: ProfileViewWithOrbyt['verification'];
  onAuthorPress?: (
    identifier: string,
    data?: { did?: string; handle?: string; displayName?: string; avatar?: string }
  ) => void;
  onRepostAuthorPress?: () => void;
  onChannelPress?: () => void;
  onFollowPress?: () => void;
}

/**
 * Author block: avatar (with optional ring + status), display handle, badges,
 * follow CTA, channel chip, and the "reposted by" banner. Memoized so that an
 * unrelated like / count change in the actions rail does not re-render this
 * subtree.
 */
function VideoOverlayAuthorComponent({
  post,
  isFollowing,
  hasProfile,
  isCurrentUserProfile,
  channelSlug,
  authorAvatarSize,
  isAuthorBlocked,
  authorProfileStatus,
  profileColors,
  verification,
  onAuthorPress,
  onRepostAuthorPress,
  onChannelPress,
  onFollowPress,
}: VideoOverlayAuthorProps) {
  const { t } = useTranslation();
  const author = post.author;
  const profilePicUrl = author?.avatar?.startsWith('http') ? author.avatar : undefined;
  const repostAvatarUrl = post.repostedBy?.avatar?.startsWith('http')
    ? post.repostedBy.avatar
    : undefined;
  const ringColor = profileColors?.textColor;
  const formattedAuthorHandle = formatHandle(author?.handle);
  const formattedRepostHandle = formatHandle(post.repostedBy?.handle ?? '');
  const showFollowText = hasProfile && !isFollowing && !isCurrentUserProfile;

  const handleAvatarAndNamePress = () => {
    onAuthorPress?.(author?.did ?? author?.handle ?? '', author);
  };

  const avatarProfileColors = profileColors
    ? {
        backgroundColor: profileColors.backgroundColor,
        foregroundColor: profileColors.foregroundColor,
        textColor: profileColors.textColor,
      }
    : undefined;

  return (
    <>
      {post.repostedBy ? (
        <BlurView intensity={30} tint="dark" style={styles.repostIndicatorBox}>
          <NativePressable
            style={styles.repostIndicatorContainer}
            onPress={onRepostAuthorPress}
            hitSlop={HIT_SLOP_12}
          >
            <View style={styles.repostAvatarWrapper}>
              <Avatar uri={repostAvatarUrl} type="profile" size={22} />
            </View>
            <Text style={styles.repostIndicatorText} numberOfLines={1}>
              <Text style={styles.repostHandleText}>{formattedRepostHandle}</Text>
              <Text style={styles.repostSuffixText}>{' reposted'}</Text>
            </Text>
          </NativePressable>
        </BlurView>
      ) : null}

      <View style={styles.authorInfoContainer}>
        <View style={composed.avatarContainer}>
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
        <View style={composed.authorTextContainer}>
          <View style={styles.authorNameRow}>
            <NativePressable
              style={styles.authorNamePressable}
              onPress={handleAvatarAndNamePress}
              hitSlop={HIT_SLOP_8_6}
            >
              <Text style={composed.authorNameText} numberOfLines={1} ellipsizeMode="tail">
                {formattedAuthorHandle}
              </Text>
            </NativePressable>
            {author?.handle ? (
              <View style={styles.authorBadgeWrapper}>
                <VerificationBadge
                  handle={author.handle}
                  verification={verification ?? undefined}
                  textSize={Typography.sizes.subtitle}
                  textColor={Colors.neutral[50]}
                />
                <BotBadge
                  handle={author.handle}
                  did={author.did}
                  labels={author.labels}
                  textSize={Typography.sizes.subtitle}
                  textColor={Colors.neutral[50]}
                />
              </View>
            ) : null}
            {showFollowText ? (
              <>
                <Text style={composed.followSeparator}>{' · '}</Text>
                <View style={styles.followButtonWrapper}>
                  <NativePressable onPress={onFollowPress} hitSlop={HIT_SLOP_8_4_6}>
                    <Text style={composed.followText}>{t('profile.follow')}</Text>
                  </NativePressable>
                </View>
              </>
            ) : null}
          </View>
          {channelSlug ? (
            <NativePressable
              style={styles.sourceIndicatorContainer}
              onPress={onChannelPress}
              hitSlop={HIT_SLOP_12}
            >
              <Text style={styles.sourceText}>
                <Text style={styles.sourceSlash}>/</Text>
                {getLocalizedChannelDisplayNameFromSlug(channelSlug, channelSlug)}
              </Text>
            </NativePressable>
          ) : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
  },
  sourceSlash: {
    fontFamily: FontFamily.semibold,
  },
  sourceText: {
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.bold,
    color: Colors.neutral[50],
    opacity: 0.7,
  },
  repostIndicatorBox: {
    borderRadius: BORDER_RADIUS.FULL,
    marginBottom: 2,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.16)',
  },
  repostIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 10,
  },
  repostAvatarWrapper: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  repostIndicatorText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.semibold,
    includeFontPadding: false,
    lineHeight: Typography.lineHeights.bodySmall,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  repostHandleText: {
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.semibold,
    color: Colors.neutral[50],
  },
  repostSuffixText: {
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.medium,
    color: Colors.neutral[50],
    opacity: 0.9,
  },
});

// Stable module-level composed styles — no per-render allocation.
const composed = {
  avatarContainer: StyleSheet.compose(styles.avatarContainer, sharedItemStyles.avatarContainer),
  authorTextContainer: StyleSheet.compose(
    styles.authorTextContainer,
    sharedItemStyles.accountInfoContainer
  ),
  authorNameText: StyleSheet.compose(styles.baseText, styles.authorName),
  followSeparator: StyleSheet.compose(styles.authorName, styles.followSeparator),
  followText: StyleSheet.compose(
    StyleSheet.compose(styles.baseText, styles.authorName),
    styles.followText
  ),
};

export const VideoOverlayAuthor = memo(VideoOverlayAuthorComponent);
VideoOverlayAuthorComponent.displayName = 'VideoOverlayAuthor';
