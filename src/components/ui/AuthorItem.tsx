import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../utils/constants';
import { StyleSheet, Text, View, StyleProp, ViewStyle, ActivityIndicator } from 'react-native';
import { NativePressable } from './NativePressable';
import { useRouter } from 'expo-router';
import { Avatar } from './UI';
import VerificationBadge from '../features/badging/VerificationBadge';
import BotBadge from '../features/badging/BotBadge';
import Icon, {
  AddSquareCuteFilledIcon,
  CheckboxCuteFilledDuotoneIcon,
  CuteFilledSquareBoxIcon,
} from './Icon';
import { hexToRGBA } from '../../utils/formatting/colors';
import { Colors } from './UI';

import { useProfile, useFollowMutation, prefetchProfile } from '../../services/data/ProfileService';
import { useAvatarProfileRing } from '../../services/colors';
import { formatHandle } from '../../utils/formatting/handles';
import { useQueryClient } from '@tanstack/react-query';
import { itemSizeConfig, sharedItemStyles } from './ItemStyles';
import { useUserStore } from '../../stores/userStore';
import { isCurrentUser } from '../../stores/profileInteractionStore';

interface AuthorItemProps {
  handle: string;
  did?: string;
  displayName?: string;
  avatar?: string;
  textColor?: string;
  backgroundColor?: string;
  size?: 'xsmall' | 'small' | 'medium' | 'large';
  showArrow?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  showDate?: boolean;
  date?: string;
  showFollowButton?: boolean;
  isFollowing?: boolean;
  onFollowPress?: () => void;
  nameFontWeight?:
    | 'Figtree-Regular'
    | 'Figtree-Medium'
    | 'Figtree-SemiBold'
    | 'Figtree-Bold'
    | 'Figtree-Black';
  handleFontWeight?:
    | 'Figtree-Regular'
    | 'Figtree-Medium'
    | 'Figtree-SemiBold'
    | 'Figtree-Bold'
    | 'Figtree-Black';
  handleColor?: string;
  hideHandleLine?: boolean;
  hideDisplayName?: boolean;
  showRing?: boolean;
  customFontSize?: number;
  showDeleteButton?: boolean;
  onDeletePress?: () => void;
  showCheckmark?: boolean;
  showCheckmarkSpinner?: boolean;
  showCheckmarkSkeleton?: boolean;
  /** Render as a non-pressable row and let touches pass to a parent (e.g. chat embed cards). */
  nonInteractive?: boolean;
  /** Mirror avatar/text order (e.g. outgoing message bubbles). */
  reverseRow?: boolean;
}

/** Dim grey for inactive/skeleton state to indicate tappable action. */
const SKELETON_BG = hexToRGBA(Colors.neutral[600], 0.5);

interface StatusIconButtonProps {
  variant?: 'success' | 'error' | 'checkmark' | 'skeleton';
  size?: number;
  padding?: number;
  children?: React.ReactNode;
}

export const StatusIconButton: React.FC<StatusIconButtonProps> = ({
  variant = 'success',
  size = 32,
  padding,
  children,
}) => {
  const backgroundColor =
    variant === 'success'
      ? hexToRGBA(Colors.teal[300], 0.1)
      : variant === 'checkmark'
        ? Colors.teal[300]
        : variant === 'skeleton'
          ? SKELETON_BG
          : hexToRGBA(Colors.coral[500], 0.1);

  const actualPadding = padding ?? (variant === 'checkmark' || variant === 'skeleton' ? 4 : 8);

  return (
    <View
      style={[
        styles.statusIconButton,
        {
          width: size,
          height: size,
          padding: actualPadding,
          backgroundColor,
        },
      ]}
    >
      {children}
    </View>
  );
};

const AuthorItem: React.FC<AuthorItemProps> = ({
  handle,
  did,
  displayName,
  avatar,
  textColor = Colors.neutral[50],
  backgroundColor,
  size = 'medium',
  showArrow = true,
  onPress,
  style,
  showFollowButton = false,
  isFollowing = false,
  onFollowPress,
  nameFontWeight = 'Figtree-Black',
  hideDisplayName,
  showRing,
  customFontSize,
  showDeleteButton = false,
  onDeletePress,
  showCheckmark = false,
  showCheckmarkSpinner = false,
  showCheckmarkSkeleton = false,
  nonInteractive = false,
  reverseRow = false,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useUserStore(state => state.currentUser);

  const config = itemSizeConfig[size];
  const actualDisplayName = formatHandle(handle) || t('feed.unknownUser');
  const actualAvatar = avatar || undefined;

  // Get following & block status from ProfileService using the hook
  const { data: cachedProfile } = useProfile(handle);
  const ringProps = useAvatarProfileRing(did ?? null);
  const actualIsFollowing = cachedProfile?.viewer?.following ? true : isFollowing;
  const isBlocked = !!(cachedProfile?.viewer?.blocking || cachedProfile?.viewer?.blockingByList);

  // Automatically hide follow button for current user
  const isCurrentUserProfile = isCurrentUser(did, handle, currentUser);
  const shouldShowFollowButton = showFollowButton && !isCurrentUserProfile && !actualIsFollowing;

  const followMutation = useFollowMutation();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (did) {
      const cleanDid = did.trim();
      if (!cleanDid) return;

      // Prefetch profile with partial data for instant UI + full data in background
      if (queryClient) {
        prefetchProfile(queryClient, cleanDid, {
          did: cleanDid,
          handle,
          displayName,
          avatar,
        });
      }

      // Dismiss modal/sheet first, then navigate to profile
      router.dismiss();
      setTimeout(() => {
        router.navigate({
          pathname: '/profile/[did]',
          params: { did: cleanDid },
        });
      }, 100);
    }
  };

  const handleFollowPress = useCallback(() => {
    if (onFollowPress) {
      onFollowPress();
    } else if (handle) {
      followMutation.mutate({ did, handle, isFollowing: !actualIsFollowing });
    }
  }, [onFollowPress, handle, followMutation, actualIsFollowing, did]);

  const rowContent = (
    <View
      style={[
        styles.accountButtonContent,
        reverseRow && styles.accountButtonContentReverse,
        nonInteractive && styles.accountButtonContentEmbed,
      ]}
    >
      <View style={[styles.avatarContainer, nonInteractive && styles.avatarContainerEmbed]}>
        <Avatar
          uri={actualAvatar}
          type="profile"
          size={config.avatarSize}
          showRing={showRing ?? ringProps.showRing}
          ringColor={ringProps.ringColor}
          profileColors={ringProps.profileColors}
          blurRadius={isBlocked ? 30 : 0}
          status={cachedProfile?.status}
        />
      </View>
      <View
        style={[styles.accountInfoContainer, nonInteractive && styles.accountInfoContainerEmbed]}
      >
        <View style={styles.nameRow}>
          {!hideDisplayName && (
            <Text
              style={[
                styles.accountDisplayName,
                {
                  color: textColor || Colors.neutral[50],
                  fontSize: customFontSize || config.nameFontSize,
                  fontFamily: nameFontWeight,
                },
              ]}
              numberOfLines={1}
            >
              {actualDisplayName}
            </Text>
          )}
          {handle && !hideDisplayName && (
            <VerificationBadge
              handle={handle}
              textSize={config.badgeTextSize}
              textColor={textColor || Colors.neutral[50]}
              verification={cachedProfile?.verification}
            />
          )}
          {handle && !hideDisplayName && (
            <BotBadge
              handle={handle}
              did={did}
              labels={cachedProfile?.labels}
              textSize={config.badgeTextSize}
              textColor={textColor || Colors.neutral[50]}
            />
          )}
        </View>
      </View>
      {shouldShowFollowButton ? (
        <NativePressable
          style={[styles.followButton, !actualIsFollowing && styles.followButtonInactive]}
          onPress={handleFollowPress}
          androidRippleBorderless
        >
          <AddSquareCuteFilledIcon size={32} color={Colors.neutral[400]} />
        </NativePressable>
      ) : showDeleteButton ? (
        <NativePressable onPress={onDeletePress} androidRippleBorderless>
          <StatusIconButton variant="error">
            <Icon name="delete_2" size={16} color={Colors.coral[500]} />
          </StatusIconButton>
        </NativePressable>
      ) : showCheckmarkSpinner ? (
        <View style={styles.checkmarkIconContainer}>
          <CuteFilledSquareBoxIcon size={34} color={Colors.teal[800]} />
          <ActivityIndicator
            style={styles.checkmarkSpinner}
            size="small"
            color={Colors.teal[300]}
          />
        </View>
      ) : showCheckmark ? (
        <View style={styles.checkmarkIconContainer}>
          <CheckboxCuteFilledDuotoneIcon
            size={34}
            boxColor={Colors.teal[300]}
            checkColor={Colors.teal[800]}
            checkOpacity={0.9}
          />
        </View>
      ) : showCheckmarkSkeleton ? (
        <StatusIconButton variant="skeleton" size={28} />
      ) : (
        showArrow && (
          <View style={styles.accountArrow}>
            <Icon name="right_small" size={20} color={Colors.neutral[500]} />
          </View>
        )
      )}
    </View>
  );

  const rootStyle = [
    styles.container,
    { backgroundColor: backgroundColor || Colors.neutral[900] },
    style,
  ];

  if (nonInteractive) {
    return (
      <View style={rootStyle} pointerEvents="none">
        {rowContent}
      </View>
    );
  }

  return (
    <NativePressable style={rootStyle} onPress={handlePress}>
      {rowContent}
    </NativePressable>
  );
};

const styles = StyleSheet.create({
  container: sharedItemStyles.container,
  accountButtonContent: sharedItemStyles.accountButtonContent,
  accountButtonContentReverse: { flexDirection: 'row-reverse' },
  /** Tight row for embeds (avoid space-between with no trailing arrow). */
  accountButtonContentEmbed: {
    justifyContent: 'flex-start',
    /** Single gap between avatar and text — avatar margin + info padding are cleared below. */
    gap: 6,
  },
  avatarContainer: sharedItemStyles.avatarContainer,
  /** Embed: sharedItemStyles.avatarContainer marginRight stacks with row gap — omit margin. */
  avatarContainerEmbed: {
    marginRight: 0,
  },
  accountInfoContainer: sharedItemStyles.accountInfoContainer,
  /** Embed: omit paddingLeft so spacing is only `accountButtonContentEmbed` gap. */
  accountInfoContainerEmbed: {
    paddingLeft: 0,
  },
  accountDisplayName: sharedItemStyles.accountDisplayName,
  accountArrow: sharedItemStyles.accountArrow,
  nameRow: sharedItemStyles.nameRow,
  followButton: sharedItemStyles.followButton,
  followButtonInactive: {
    backgroundColor: Colors.transparent,
  },
  statusIconButton: {
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  checkmarkIconContainer: {
    width: 34,
    height: 34,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkSpinner: {
    position: 'absolute',
    transform: [{ scale: 0.95 }],
  },
});

export default AuthorItem;
