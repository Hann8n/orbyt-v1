import React from 'react';
import { Pressable, ViewStyle } from 'react-native';
import { Svg, Path, Defs, Mask, G } from 'react-native-svg';
import { useProfile } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';

// Badge paths (designed for 24x24 viewBox)
const SCALLOPED_BADGE_PATH =
  'M21.007 8.27C22.194 9.125 23 10.45 23 12s-.806 2.876-1.993 3.73c.24 1.442-.134 2.958-1.227 4.05c-1.095 1.095-2.61 1.459-4.046 1.225C14.883 22.196 13.546 23 12 23c-1.55 0-2.878-.807-3.731-1.996c-1.438.235-2.954-.128-4.05-1.224c-1.095-1.095-1.459-2.611-1.217-4.05C1.816 14.877 1 13.551 1 12s.816-2.878 2.002-3.73c-.242-1.439.122-2.955 1.218-4.05c1.093-1.094 2.61-1.467 4.057-1.227C9.125 1.804 10.453 1 12 1c1.545 0 2.88.803 3.732 1.993c1.442-.24 2.956.135 4.048 1.227s1.468 2.608 1.227 4.05z';

const CIRCULAR_BADGE_PATH =
  'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z';

const CHECKMARK_PATH = 'M9.3 12 L11.1 14.7 L15.6 10.2';

interface VerificationBadgeProps {
  handle: string;
  size?: number;
  textSize?: number; // If provided, badge size scales with text
  customMargin?: number; // Override the auto-scaled margin
  style?: ViewStyle;
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
  const badgePath = actualBadgeType === 'scalloped' ? SCALLOPED_BADGE_PATH : CIRCULAR_BADGE_PATH;

  const badgeComponent = (
    <Svg width={badgeSize} height={badgeSize} viewBox="0 0 24 24" style={[{ marginLeft }, style]}>
      <Defs>
        <Mask id={`checkmarkMask-${handle}`}>
          <G transform="translate(12, 12) scale(0.96) translate(-12, -12)">
            <Path d={badgePath} fill="white" />
          </G>
          <G transform="translate(12, 12) scale(1.2) translate(-12, -12)">
            <Path
              d={CHECKMARK_PATH}
              stroke="black"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </G>
        </Mask>
      </Defs>
      <G transform="translate(12, 12) scale(0.96) translate(-12, -12)">
        <Path d={badgePath} fill={fillColor} mask={`url(#checkmarkMask-${handle})`} />
      </G>
    </Svg>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{badgeComponent}</Pressable>;
  }

  return badgeComponent;
};

export default React.memo(VerificationBadge);
