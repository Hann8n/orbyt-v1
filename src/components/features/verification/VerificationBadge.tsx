import React from 'react';
import { Image, TouchableOpacity, StyleSheet, ImageStyle, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import ProfileCache, { useProfileColors } from '../../../services/cache/ProfileCache';

interface VerificationBadgeProps {
  handle: string;
  size?: number;
  style?: ImageStyle;
  onPress?: () => void;
  textColor?: string;  // New prop for custom text color
}

/**
 * A component that displays a verification badge next to a username
 * when the user is verified by the Bluesky platform
 * 
 * @param textColor - Optional color for the badge. If provided, overrides the profile color.
 * When not provided, uses the profile's text color from ProfileCache.
 */
const VerificationBadge: React.FC<VerificationBadgeProps> = ({ 
  handle, 
  size = 16, 
  style,
  onPress,
  textColor  // New prop that takes priority if provided
}) => {
  // Safety check for handle
  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    return null;
  }
  // Query verification status from ProfileCache
  const { data: isVerified } = useQuery({
    queryKey: ['verification', handle.trim()],
    queryFn: async () => {
      // Using ProfileCache to check verification efficiently
      // Verification data is now included in profile responses
      return await ProfileCache.checkVerification(handle.trim());
    },
    staleTime: 3600000, // Cache for 1 hour
    refetchOnWindowFocus: false
  });
  
  // Get profile colors for the badge (used as fallback)
  const { colors } = useProfileColors(handle.trim());

  // If not verified, don't render anything
  if (!isVerified) return null;

  const badgeComponent = (
    <Image
      source={require('../../../assets/badge-verified_Normal3x.png')}
      style={[
        styles.badge,
        { 
          width: size, 
          height: size, 
          // Use provided textColor if available, otherwise fall back to profile textColor
          tintColor: textColor || colors?.textColor || '#FFFFFF' 
        },
        style
      ]}
      resizeMode="contain"
    />
  );

  // If onPress handler is provided, make it touchable
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {badgeComponent}
      </TouchableOpacity>
    );
  }

  // Otherwise, just render the image
  return badgeComponent;
};

const styles = StyleSheet.create({
  badge: {
    marginLeft: 4,
    alignSelf: 'center',
  }
});

export default VerificationBadge;
