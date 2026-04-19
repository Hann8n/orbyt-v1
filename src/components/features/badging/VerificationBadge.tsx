import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { useProfile } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';
import { NanoIcon } from '../../ui/NanoIcon';

interface VerificationBadgeProps {
  handle: string;
  size?: number;
  textSize?: number; // If provided, badge size scales with text
  customMargin?: number; // Override the auto-scaled margin
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  textColor?: string;
  borderColor?: string;
  badgeType?: 'circular' | 'scalloped' | 'auto';
  verification?: {
    verifiedStatus?: 'valid' | 'invalid' | 'none' | string;
    trustedVerifierStatus?: 'valid' | 'invalid' | 'none' | string;
  };
}

// Calculate badge size from text size (roughly 1:1 ratio with slight adjustment)
const getBadgeSizeFromText = (textSize: number): number => {
  return Math.round(textSize * 1.1);
};

const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  handle,
  size,
  textSize,
  customMargin,
  style,
  onPress,
  textColor = Colors.neutral[50],
  borderColor,
  badgeType = 'auto',
  verification,
}) => {
  // Calculate final size: explicit size > textSize-based > default 20
  const badgeSize = size ?? (textSize ? getBadgeSizeFromText(textSize) : 20);
  // Use customMargin if provided, otherwise scale with badge size (~20%)
  const marginLeft = customMargin ?? Math.round(badgeSize * 0.2);
  const { data: profile } = useProfile(verification ? null : handle);

  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    return null;
  }

  const verificationData = verification || profile?.verification;
  const isVerified = verificationData?.verifiedStatus === 'valid';
  const isTrustedVerifier = verificationData?.trustedVerifierStatus === 'valid';

  if (!isVerified && !isTrustedVerifier) return null;

  const actualBadgeType =
    badgeType === 'auto' ? (isTrustedVerifier ? 'scalloped' : 'circular') : badgeType;
  const fillColor = borderColor || textColor;
  const badgeComponent = (
    <NanoIcon
      name={actualBadgeType === 'scalloped' ? 'certificate-scalloped' : 'certificate-circular'}
      size={badgeSize}
      color={fillColor}
      style={StyleSheet.flatten([{ marginLeft }, style])}
      accessible={!onPress}
      accessibilityRole={onPress ? undefined : 'image'}
    />
  );

  if (onPress) {
    return <NativePressable onPress={onPress}>{badgeComponent}</NativePressable>;
  }

  return badgeComponent;
};

export default React.memo(VerificationBadge);
