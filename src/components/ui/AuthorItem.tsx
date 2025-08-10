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
import { navigateToUserProfile } from '../../navigation/profileNavigation';

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
}) => {
  const navigation = useNavigation<NavigationProp<HomeStackParamList>>();
  
  // Size configuration
  const sizeConfig = {
    small: {
      avatarSize: 32,
      textSize: 12,
      badgeTextSize: 12,
      nameFontSize: 12,
      handleFontSize: 10,
    },
    medium: {
      avatarSize: 40,
      textSize: 14,
      badgeTextSize: 14,
      nameFontSize: 14,
      handleFontSize: 12,
    },
    large: {
      avatarSize: 48,
      textSize: 16,
      badgeTextSize: 16,
      nameFontSize: 16,
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
      navigateToUserProfile(navigation, { handle });
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
          <Text style={[
            styles.handle,
            { 
              color: Colors.lightGray,
              fontSize: config.handleFontSize,
            }
          ]} numberOfLines={1}>
            {showDate && date ? date : `@${handle}`}
          </Text>
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
            size={config.textSize} 
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
    fontFamily: 'Firma-SemiBold',
    marginBottom: 1,
  },
  handle: {
    fontFamily: 'Firma-Medium',
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