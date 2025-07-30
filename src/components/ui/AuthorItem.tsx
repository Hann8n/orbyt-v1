import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Avatar } from './UI';
import VerificationBadge from '../features/verification/VerificationBadge';
import Icon from './Icon';
import { hexToRGBA } from '../../utils/formatting/colorUtils';
import { UI } from '../../utils/formatting/Colors';
import { HomeStackParamList } from '../../navigation/types';

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

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (handle) {
      navigation.navigate('AuthorProfile', { handle });
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
            { borderColor: UI.BORDER.PRIMARY },
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
            ]}>
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
              color: hexToRGBA(textColor, 0.67),
              fontSize: config.handleFontSize,
            }
          ]}>
            {showDate && date ? date : `@${handle}`}
          </Text>
        </View>
        {showArrow && (
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    marginRight: 12,
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontFamily: 'Firma-SemiBold',
    marginBottom: 2,
  },
  handle: {
    fontFamily: 'Firma-Regular',
  },
});

export default AuthorItem; 