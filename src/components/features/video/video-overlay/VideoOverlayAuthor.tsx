import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { NativePressable } from '@/components/ui/NativePressable';
import { sharedItemStyles } from '@/components/ui/ItemStyles';
import { Avatar } from '../../../ui/UI';
import { NanoIcon } from '../../../ui/NanoIcon';
import { VerificationBadge, BotBadge } from '../../badging';
import { Colors } from '../../../../theme';
import { FontFamily, Typography } from '@/utils/components/typography';
import { formatHandle } from '../../../../utils/formatting/handles';
import { getLocalizedChannelDisplayNameFromSlug } from '../../../../utils/channels/orbyt';
import { BORDER_RADIUS } from '../../../../utils/constants';
import type { ProfileColorScheme } from '../../../../utils/formatting/colors';
import type { ExtendedPostView, StatusView } from '../../../../services/api/types';

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
  onAuthorPress,
  onRepostAuthorPress,
  onChannelPress,
  onFollowPress,
}: VideoOverlayAuthorProps) {
  const { t } = useTranslation();
  const author = useMemo(() => post.author ?? {}, [post.author]);
  const profilePicUrl =
    author.avatar && author.avatar.startsWith('http') ? author.avatar : undefined;
  const ringColor = profileColors?.textColor;

  const formattedAuthorHandle = formatHandle(author.handle);
  const formattedRepostHandle = formatHandle(post.repostedBy?.handle || '');
  const showFollowText = hasProfile && !isFollowing && !isCurrentUserProfile;

  const handleAvatarAndNamePress = useCallback(() => {
    onAuthorPress?.(author.did ?? author.handle ?? '', author);
  }, [onAuthorPress, author]);

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
  const repostIndicatorTextStyle = useMemo(
    () => StyleSheet.compose(styles.repostIndicatorText, styles.repostTextOpacity),
    []
  );

  return (
    <>
      {post.repostedBy ? (
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
      ) : null}

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
            {author.handle ? (
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
            ) : null}
            {showFollowText ? (
              <>
                <Text style={followSeparatorStyle}>{' · '}</Text>
                <View style={styles.followButtonWrapper}>
                  <NativePressable onPress={onFollowPress} hitSlop={HIT_SLOP_8_4_6}>
                    <Text style={followTextStyle}>{t('profile.follow')}</Text>
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
              <Text style={sourceTextStyle}>
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
  sourceTextOpacity: {
    color: Colors.neutral[50],
    opacity: 0.7,
  },
  repostIndicatorBox: {
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    marginBottom: 0,
    alignSelf: 'flex-start',
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
  repostIconWrapper: {
    opacity: 0.8,
  },
  repostTextOpacity: {
    opacity: 0.8,
  },
});

export const VideoOverlayAuthor = memo(VideoOverlayAuthorComponent);
VideoOverlayAuthorComponent.displayName = 'VideoOverlayAuthor';
