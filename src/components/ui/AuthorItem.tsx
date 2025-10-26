import React, { memo, useCallback, useMemo } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from './UI';
import VerificationBadge from '../features/verification/VerificationBadge';
import Icon, { FollowIcon, CheckIcon } from './Icon';
import { hexToRGBA } from '../../utils/formatting/colorUtils';
import { Colors } from './UI';
import UI from './UI';

import { useProfile, useProfileColors, useFollowMutation } from '../../services/cache/ProfileCache';
import { useCurrentUser } from '../../stores/userStore';
 

interface AuthorItemProps {
  handle: string;
  displayName?: string;
  avatar?: string;
  textColor?: string;
  backgroundColor?: string;
  size?: 'small' | 'medium' | 'large';
  showArrow?: boolean;
  onPress?: () => void;
  style?: any;
  showDate?: boolean;
  date?: string;
  showFollowButton?: boolean;
  isFollowing?: boolean;
  onFollowPress?: () => void;
  nameFontWeight?: 'Firma-Regular' | 'Firma-Medium' | 'Firma-SemiBold' | 'Firma-Bold' | 'Firma-Black';
  handleFontWeight?: 'Firma-Regular' | 'Firma-Medium' | 'Firma-SemiBold' | 'Firma-Bold' | 'Firma-Black';
  handleColor?: string;
  hideHandleLine?: boolean;
  hideDisplayName?: boolean;
  noRing?: boolean;
  customFontSize?: number;
  showDeleteButton?: boolean;
  onDeletePress?: () => void;
}

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
  showDate = false,
  date,
  showFollowButton = false,
  isFollowing = false,
  onFollowPress,
  nameFontWeight = 'Firma-Bold',
  handleFontWeight = 'Firma-SemiBold',
  handleColor,
  hideHandleLine,
  hideDisplayName,
  noRing,
  customFontSize,
  showDeleteButton = false,
  onDeletePress,
}) => {
  const navigation = useRouter();
  
  // Size configuration
  const sizeConfig = {
    small: {
      avatarSize: 32,
      textSize: 12,
      badgeTextSize: 12,
      nameFontSize: 13,
      handleFontSize: 10,
    },
    medium: {
      avatarSize: 40,
      textSize: 14,
      badgeTextSize: 14,
      nameFontSize: 15,
      handleFontSize: 12,
    },
    large: {
      avatarSize: 48,
      textSize: 16,
      badgeTextSize: 16,
      nameFontSize: 17,
      handleFontSize: 14,
    },
  };

  const config = sizeConfig[size];
  const actualDisplayName = displayName || handle || 'Unknown';
  const actualAvatar = avatar || undefined;

  // Get following status from ProfileCache using the hook
  const { data: cachedProfile } = useProfile(handle);
  const actualIsFollowing = cachedProfile?.isFollowing ?? isFollowing;

  const followMutation = useFollowMutation();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (handle) {
      const clean = handle.trim();
      if (!clean) return;
      
      // Navigate back first to dismiss any modal/sheet, then navigate to profile
      navigation.back();
      setTimeout(() => {
        navigation.push(`/profile/${clean}`);
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
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: backgroundColor || Colors.darkGray },
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.accountButtonContent}>
        <View style={styles.avatarContainer}>
          <Avatar
            uri={actualAvatar}
            type="profile"
            size={config.avatarSize}
            noRing={noRing}
          />
        </View>
        <View style={styles.accountInfoContainer}>
          <View style={styles.nameRow}>
            {!hideDisplayName && (
              <Text style={[ 
                styles.accountDisplayName,
                { 
                  color: textColor || Colors.white,
                  fontSize: customFontSize || config.nameFontSize,
                  fontFamily: nameFontWeight,
                }
              ]} numberOfLines={1}>
                {actualDisplayName}
              </Text>
            )}
            {handle && !hideDisplayName && (
              <VerificationBadge
                handle={handle}
                textSize={config.badgeTextSize}
                textColor={textColor || Colors.white}
              />
            )}
          </View>
          {!hideHandleLine && (
            <Text style={[ 
              styles.accountHandle,
              { 
                color: handleColor || Colors.lightGray,
                fontSize: config.handleFontSize,
                fontFamily: handleFontWeight,
              }
            ]} numberOfLines={1}>
              {showDate && date ? date : handle}
            </Text>
          )}
        </View>
        {showFollowButton ? (
          <TouchableOpacity
            style={[
              styles.followButton,
              {
                backgroundColor: textColor || Colors.white,
                borderColor: textColor || Colors.white,
              }
            ]}
            onPress={handleFollowPress}
            activeOpacity={0.8}
          >
            {actualIsFollowing ? (
              <CheckIcon size={16} color={Colors.black} strokeWidth={2} />
            ) : (
              <FollowIcon size={16} color={Colors.black} />
            )}
          </TouchableOpacity>
        ) : showDeleteButton ? (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={onDeletePress}
            activeOpacity={0.7}
          >
            <Icon name="delete-2-fill" size={16} color={UI.Colors.STATUS.ERROR} />
          </TouchableOpacity>
        ) : showArrow && (
          <View style={styles.accountArrow}>
            <Icon 
              name="chevron-right" 
              size={20} 
              color={Colors.gray} 
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
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
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
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
    borderWidth: 1,
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
  deleteButton: {
    padding: 8,
    backgroundColor: hexToRGBA(UI.Colors.STATUS.ERROR, 0.1),
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default AuthorItem; 