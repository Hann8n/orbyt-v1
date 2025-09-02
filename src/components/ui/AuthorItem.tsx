import React, { memo, useCallback, useMemo } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from './UI';
import VerificationBadge from '../features/verification/VerificationBadge';
import Icon from './Icon';
import { extractColorsFromImage } from '../../utils/formatting/colorUtils';
import { Colors } from './UI';

import { useProfile, useProfileColors } from '../../services/cache/ProfileCache';
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
  nameFontWeight = 'Firma-SemiBold',
  handleFontWeight = 'Firma-SemiBold',
  handleColor,
  hideHandleLine,
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

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (handle) {
      const clean = handle.trim();
      if (!clean) return;
      navigation.push(`/profile/${clean}`);
    }
  };

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
          />
        </View>
        <View style={styles.accountInfoContainer}>
          <View style={styles.nameRow}>
            <Text style={[ 
              styles.accountDisplayName,
              { 
                color: textColor || Colors.white,
                fontSize: config.nameFontSize,
                fontFamily: nameFontWeight,
              }
            ]} numberOfLines={1}>
              {actualDisplayName}
            </Text>
            {handle && (
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
              { borderColor: textColor || Colors.white },
              actualIsFollowing && { backgroundColor: textColor || Colors.white }
            ]}
            onPress={onFollowPress}
          >
            <Text style={[
              styles.followButtonText,
              { color: actualIsFollowing ? '#000' : (textColor || Colors.white) }
            ]}>
              {actualIsFollowing ? 'Following' : 'Follow'}
            </Text>
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
    marginRight: 12,
  },
  accountInfoContainer: {
    flex: 1,
    paddingLeft: 8,
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
});

export default AuthorItem; 