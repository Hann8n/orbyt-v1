import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Avatar } from './UI';
import VerificationBadge from '../features/verification/VerificationBadge';
import Icon from './Icon';
import { hexToRGBA } from '../../utils/formatting/colorUtils';
import { Colors } from './UI';
import { HomeStackParamList } from '../../navigation/types';
import { useProfile } from '../../services/cache/ProfileCache';
 

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
  const navigation = useNavigation<NavigationProp<HomeStackParamList>>();
  
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
      let rootNav: any = navigation as any;
      while (rootNav?.getParent?.()) {
        rootNav = rootNav.getParent();
      }
      rootNav?.navigate?.('AuthorProfile', { handle: clean });
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: backgroundColor || 'rgba(255, 255, 255, 0.05)' },
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Avatar
          uri={actualAvatar}
          type="profile"
          size={config.avatarSize}
          style={[
            styles.avatar,
            { borderColor: Colors.gray },
          ]}
        />
        <View style={styles.textContainer}>
          <View style={styles.nameRow}>
          <Text style={[ 
            styles.name,
            { 
              color: textColor,
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
                textColor={textColor}
              />
            )}
          </View>
          {!hideHandleLine && (
            <Text style={[ 
              styles.handle,
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
              { borderColor: textColor },
              actualIsFollowing && { backgroundColor: textColor }
            ]}
            onPress={onFollowPress}
          >
            <Text style={[
              styles.followButtonText,
              { color: actualIsFollowing ? '#000' : textColor }
            ]}>
              {actualIsFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        ) : showArrow && (
          <Icon 
            name="chevron-right" 
            size={config.textSize + 4} 
            color={hexToRGBA(textColor, 0.5)} 
          />
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
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginRight: 8,
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
    borderRadius: 50,
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