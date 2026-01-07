import React, { useCallback } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { Pressable, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from './UI';
import VerificationBadge from '../features/badging/VerificationBadge';
import Icon, { FollowIcon, CheckIcon, Loading3FillIcon } from './Icon';
import { hexToRGBA } from '../../utils/formatting/colors';
import { Colors } from './UI';
import UI from './UI';

import { useProfile, useFollowMutation, prefetchProfile } from '../../services/data/ProfileService';
import { formatHandle } from '../../utils/formatting/handles';
import { useQueryClient } from '@tanstack/react-query';

interface AuthorItemProps {
  handle: string;
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
    | 'Firma-Regular'
    | 'Firma-Medium'
    | 'Firma-SemiBold'
    | 'Firma-Bold'
    | 'Firma-Black';
  handleFontWeight?:
    | 'Firma-Regular'
    | 'Firma-Medium'
    | 'Firma-SemiBold'
    | 'Firma-Bold'
    | 'Firma-Black';
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
  nameFontWeight = 'Firma-Black',
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

  // Size configuration
  const sizeConfig = {
    small: {
      avatarSize: 32,
      textSize: 12,
      badgeTextSize: 12,
      nameFontSize: 14,
      handleFontSize: 11,
    },
    medium: {
      avatarSize: 40,
      textSize: 14,
      badgeTextSize: 14,
      nameFontSize: 16,
      handleFontSize: 13,
    },
    large: {
      avatarSize: 48,
      textSize: 16,
      badgeTextSize: 16,
      nameFontSize: 18,
      handleFontSize: 15,
    },
  };

  const config = sizeConfig[size];
  const actualDisplayName = formatHandle(handle) || 'Unknown';
  const actualAvatar = avatar || undefined;

  // Get following status from ProfileService using the hook
  const { data: cachedProfile } = useProfile(handle);
  const actualIsFollowing = cachedProfile?.isFollowing ?? isFollowing;
  const isBlocked = cachedProfile?.isBlocked ?? false;

  const followMutation = useFollowMutation();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (handle) {
      const clean = handle.trim();
      if (!clean) return;

      // Prefetch profile with partial data for instant UI + full data in background
      if (queryClient) {
        prefetchProfile(queryClient, clean, {
          handle: clean,
          displayName,
          avatar,
        });
      }

      // Navigate back first to dismiss any modal/sheet, then navigate to profile
      router.back();
      setTimeout(() => {
        router.push(`/profile/${clean}`);
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
        {showFollowButton ? (
          <Pressable
            style={[
              styles.followButton,
              {
                backgroundColor: textColor || Colors.white,
                borderWidth: 0,
                borderColor: 'transparent',
              },
            ]}
            onPress={handleFollowPress}
          >
            {actualIsFollowing ? (
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
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.LARGE,
    marginBottom: 12,
  },
  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    marginRight: 8,
  },
  accountInfoContainer: {
    flex: 1,
    paddingLeft: 4,
  },
  accountDisplayName: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginBottom: 2,
  },
  accountHandle: {
    color: Colors.mutedGray,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  accountArrow: {
    marginLeft: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    marginBottom: 1,
  },
  handle: {
    // Font family is now controlled via props
    fontWeight: '600',
  },
  followButton: {
    borderWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.FULL,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  followButtonText: {
    fontSize: 15,
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },
  statusIconButton: {
    padding: 8,
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default AuthorItem;
