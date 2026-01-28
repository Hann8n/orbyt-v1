import React, { useCallback } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { Pressable, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from './UI';
import VerificationBadge from '../features/badging/VerificationBadge';
import Icon, { FollowIcon, CheckIcon, Loading3FillIcon, MutualHeartIcon } from './Icon';
import { hexToRGBA } from '../../utils/formatting/colors';
import { Colors } from './UI';
import UI from './UI';

import { useProfile, useFollowMutation, prefetchProfile } from '../../services/data/ProfileService';
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
  size?: 'small' | 'medium' | 'large';
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
}

interface StatusIconButtonProps {
  variant?: 'success' | 'error';
  size?: number;
  children: React.ReactNode;
}

export const StatusIconButton: React.FC<StatusIconButtonProps> = ({
  variant = 'success',
  size = 32,
  children,
}) => {
  const backgroundColor =
    variant === 'success'
      ? hexToRGBA(Colors.lightGreen, 0.1)
      : hexToRGBA(UI.Colors.STATUS.ERROR, 0.1);

  return (
    <View
      style={[
        styles.statusIconButton,
        {
          width: size,
          height: size,
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
  textColor = '#FFFFFF',
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
}) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useUserStore(state => state.currentUser);

  const config = itemSizeConfig[size];
  const actualDisplayName = formatHandle(handle) || 'Unknown';
  const actualAvatar = avatar || undefined;

  // Get following & block status from ProfileService using the hook
  const { data: cachedProfile } = useProfile(handle);
  const actualIsFollowing = cachedProfile?.viewer?.following ? true : isFollowing;
  const isFollowedBy = !!cachedProfile?.viewer?.followedBy;
  const isMutual = actualIsFollowing && isFollowedBy;
  const isBlocked = !!(cachedProfile?.viewer?.blocking || cachedProfile?.viewer?.blockingByList);

  // Automatically hide follow button for current user
  const isCurrentUserProfile = isCurrentUser(did, handle, currentUser);
  const shouldShowFollowButton = showFollowButton && !isCurrentUserProfile;

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

      // Navigate back first to dismiss any modal/sheet, then navigate to profile
      router.back();
      setTimeout(() => {
        router.push({
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
      followMutation.mutate({ handle, isFollowing: !actualIsFollowing });
    }
  }, [onFollowPress, handle, followMutation, actualIsFollowing]);

  return (
    <Pressable
      style={[styles.container, { backgroundColor: backgroundColor || Colors.darkGray }, style]}
      onPress={handlePress}
    >
      <View style={styles.accountButtonContent}>
        <View style={styles.avatarContainer}>
          <Avatar
            uri={actualAvatar}
            type="profile"
            size={config.avatarSize}
            showRing={showRing}
            blurRadius={isBlocked ? 30 : 0}
            status={cachedProfile?.status}
          />
        </View>
        <View style={styles.accountInfoContainer}>
          <View style={styles.nameRow}>
            {!hideDisplayName && (
              <Text
                style={[
                  styles.accountDisplayName,
                  {
                    color: textColor || Colors.white,
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
                textColor={textColor || Colors.white}
                verification={cachedProfile?.verification}
              />
            )}
          </View>
        </View>
        {shouldShowFollowButton ? (
          <Pressable
            style={({ pressed }) => [styles.followButton, pressed && { opacity: 0.8 }]}
            onPress={handleFollowPress}
          >
            {isMutual ? (
              <MutualHeartIcon size={16} color={Colors.black} />
            ) : actualIsFollowing ? (
              <CheckIcon size={16} color={Colors.black} strokeWidth={2} />
            ) : (
              <FollowIcon size={16} color={Colors.black} />
            )}
          </Pressable>
        ) : showDeleteButton ? (
          <Pressable onPress={onDeletePress}>
            <StatusIconButton variant="error">
              <Icon name="delete-2-fill" size={16} color={UI.Colors.STATUS.ERROR} />
            </StatusIconButton>
          </Pressable>
        ) : showCheckmarkSpinner ? (
          <StatusIconButton variant="success">
            <Loading3FillIcon size={20} color={Colors.lightGreen} />
          </StatusIconButton>
        ) : showCheckmark ? (
          <StatusIconButton variant="success">
            <CheckIcon size={16} color={Colors.lightGreen} strokeWidth={2} />
          </StatusIconButton>
        ) : (
          showArrow && (
            <View style={styles.accountArrow}>
              <Icon name="chevron-right" size={20} color={Colors.gray} />
            </View>
          )
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: sharedItemStyles.container,
  accountButtonContent: sharedItemStyles.accountButtonContent,
  avatarContainer: sharedItemStyles.avatarContainer,
  accountInfoContainer: sharedItemStyles.accountInfoContainer,
  accountDisplayName: sharedItemStyles.accountDisplayName,
  accountArrow: sharedItemStyles.accountArrow,
  nameRow: sharedItemStyles.nameRow,
  followButton: sharedItemStyles.followButton,
  statusIconButton: {
    padding: 8,
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default AuthorItem;
