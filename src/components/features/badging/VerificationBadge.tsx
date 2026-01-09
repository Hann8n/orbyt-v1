import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Svg, Path, Defs, Mask } from 'react-native-svg';
import { useProfile } from '../../../services/data/ProfileService';

interface VerificationBadgeProps {
  handle: string;
  size?: number;
  style?: ViewStyle;
  onPress?: () => void;
  textColor?: string; // Text color to match - defaults to white if not provided
  borderColor?: string; // Badge border color - defaults to textColor if not provided
  badgeType?: 'circular' | 'scalloped' | 'auto'; // New prop to determine badge type
  textSize?: number; // New prop to automatically size badge based on text size
  autoPosition?: boolean; // New prop to automatically calculate positioning based on text size
  customMargin?: number; // New prop to override auto-calculated margin
  verification?: {
    verifiedStatus?: 'valid' | 'invalid' | 'none' | string;
    trustedVerifierStatus?: 'valid' | 'invalid' | 'none' | string;
    verifications?: Array<{
      issuer: string;
      uri: string;
      isValid: boolean;
      createdAt?: string;
    }>;
  }; // Optional verification data from profile (VerificationState) - if provided, avoids separate query
}

/**
 * A component that displays verification badges for verified accounts
 * - Circular badge for normal verified accounts
 * - Scalloped badge for trusted verifiers
 *
 * @param textColor - Optional color for the badge icon. If provided, overrides the profile color.
 * @param borderColor - Optional color for the badge border. Defaults to a blue gradient.
 * @param badgeType - Type of badge: 'circular' for normal verified accounts, 'scalloped' for trusted verifiers, 'auto' to determine automatically
 * @param textSize - Optional text size to automatically calculate appropriate badge size
 * @param autoPosition - When true, automatically calculates margin based on text size for consistent positioning
 * @param customMargin - Optional custom margin to override auto-calculated positioning
 * When not provided, uses the profile's text color from ProfileService.
 */
const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  handle,
  size, // Made optional since we can calculate from textSize
  style,
  onPress,
  textColor = '#FFFFFF', // Default to white if not provided
  borderColor, // Will default to textColor if not provided
  badgeType = 'auto', // Default to auto to determine based on verification status
  textSize, // New prop to automatically size badge based on text size
  autoPosition = true, // Default to true for consistent positioning
  customMargin, // New prop to override auto-calculated margin
  verification, // Optional verification data from profile - if provided, avoids separate query
}) => {
  // Calculate badge size based on text size if provided, otherwise use default
  const calculateBadgeSize = () => {
    if (size) return size;
    if (textSize) {
      // More proportional badge sizing that scales better with text
      // Use textSize * 1.3 as base for better proportions
      let badgeSize = Math.round(textSize * 1.35);

      // Ensure minimum and maximum sizes for consistency
      badgeSize = Math.max(14, Math.min(28, badgeSize));

      // Fine-tune for specific ranges to ensure optimal proportions
      if (textSize <= 12) badgeSize = 16;
      else if (textSize <= 14) badgeSize = 20;
      else if (textSize <= 16) badgeSize = 22;
      else if (textSize <= 18) badgeSize = 24;
      else if (textSize <= 20) badgeSize = 26;
      else badgeSize = 28;

      return badgeSize;
    }
    return 20; // Default size for better visibility
  };

  // Calculate automatic positioning based on text size
  const calculateAutoPosition = () => {
    if (!autoPosition || !textSize) return {};

    // Use custom margin if provided, otherwise calculate automatically
    if (customMargin !== undefined) {
      return { marginLeft: customMargin, marginTop: 0 };
    }

    // Horizontal spacing tuned to keep the badge visually attached to text
    let marginLeft = Math.max(1, Math.min(4, Math.round(textSize * 0.12)));
    if (textSize <= 12) marginLeft = 1;
    else if (textSize <= 14) marginLeft = 1;
    else if (textSize <= 16) marginLeft = 2;
    else if (textSize <= 18) marginLeft = 2;
    else if (textSize <= 20) marginLeft = 3;
    else marginLeft = 4;

    // Keep vertical offset neutral to avoid affecting line height
    return { marginLeft, marginTop: 0 };
  };

  const badgeSize = calculateBadgeSize();
  const center = badgeSize / 2;
  const radius = (badgeSize - 4) / 2; // Leave some padding

  // Get profile data using useProfile hook (uses same cache as other components)
  // Always call the hook unconditionally, but pass null if verification data is provided
  // Must call hook before any early returns to satisfy React Hooks rules
  const { data: profile } = useProfile(verification ? null : handle);

  // Safety check for handle
  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    return null;
  }

  // Use provided verification data or get from profile
  const verificationData = verification || profile?.verification;

  // Check verification status using actual API types from VerificationState
  const isVerified = verificationData?.verifiedStatus === 'valid';
  const isTrustedVerifier = verificationData?.trustedVerifierStatus === 'valid';

  // If not verified (neither verifiedStatus nor trustedVerifierStatus is valid), don't render
  if (!isVerified && !isTrustedVerifier) return null;

  // Determine badge type
  const actualBadgeType =
    badgeType === 'auto' ? (isTrustedVerifier ? 'scalloped' : 'circular') : badgeType;
  // Use provided borderColor or default to textColor for consistency
  const badgeBorderColor = borderColor || textColor;

  // Create badge path with optional scalloping
  const createBadgePath = (isScalloped: boolean = false) => {
    const numScallops = 6;
    const scallopRadius = radius * 0.325;
    const mainRadius = radius - scallopRadius;

    if (!isScalloped) {
      // Use full radius for circular badge to make it look better
      const fullRadius = radius - 2; // Slight padding for stroke
      return `M ${center + fullRadius} ${center} A ${fullRadius} ${fullRadius} 0 1 1 ${center - fullRadius} ${center} A ${fullRadius} ${fullRadius} 0 1 1 ${center + fullRadius} ${center} Z`;
    }

    // Scalloped path
    let path = `M ${center + mainRadius} ${center}`;

    for (let i = 0; i < numScallops; i++) {
      const angle = (i * 2 * Math.PI) / numScallops;
      const nextAngle = ((i + 1) * 2 * Math.PI) / numScallops;

      const x1 = center + mainRadius * Math.cos(angle);
      const y1 = center + mainRadius * Math.sin(angle);
      const x2 = center + mainRadius * Math.cos(nextAngle);
      const y2 = center + mainRadius * Math.sin(nextAngle);

      const scallopX = center + (mainRadius + scallopRadius) * Math.cos((angle + nextAngle) / 2);
      const scallopY = center + (mainRadius + scallopRadius) * Math.sin((angle + nextAngle) / 2);

      path += ` L ${x1} ${y1}`;
      path += ` Q ${scallopX} ${scallopY} ${x2} ${y2}`;
    }

    path += ' Z';
    return path;
  };

  // Create checkmark path with thicker stroke for better cutout effect
  const createCheckmark = () => {
    const checkSize = radius * 0.9;
    const startX = center - checkSize * 0.3;
    const startY = center;
    const midX = center - checkSize * 0.1;
    const midY = center + checkSize * 0.3;
    const endX = center + checkSize * 0.4;
    const endY = center - checkSize * 0.2;

    return `M ${startX} ${startY} L ${midX} ${midY} L ${endX} ${endY}`;
  };

  // Combine auto positioning with custom style
  const combinedStyle = [styles.badge, autoPosition && calculateAutoPosition(), style];

  const badgeComponent = (
    <Svg width={badgeSize} height={badgeSize} style={combinedStyle}>
      <Defs>
        {/* Create a mask where white areas are visible and black areas are cut out */}
        <Mask id={`checkmarkMask-${handle}`}>
          {/* White background makes everything visible */}
          <Path d={createBadgePath(actualBadgeType === 'scalloped')} fill="white" />
          {/* Black checkmark creates the cutout */}
          <Path
            d={createCheckmark()}
            stroke="black"
            strokeWidth={Math.max(1, badgeSize * 0.08)} // Reduced stroke width for thinner checkmark
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Mask>
      </Defs>

      {/* Background shape with mask applied to create checkmark cutout */}
      <Path
        d={createBadgePath(actualBadgeType === 'scalloped')}
        fill={badgeBorderColor}
        stroke={badgeBorderColor}
        strokeWidth={Math.max(1, badgeSize * 0.08)}
        mask={`url(#checkmarkMask-${handle})`}
      />
    </Svg>
  );

  // If onPress handler is provided, make it touchable
  if (onPress) {
    return <Pressable onPress={onPress}>{badgeComponent}</Pressable>;
  }

  // Otherwise, just render the SVG
  return badgeComponent;
};

const styles = StyleSheet.create({
  badge: {
    marginTop: 0,
    marginBottom: 0,
    alignSelf: 'center',
  },
});

export default React.memo(VerificationBadge);
