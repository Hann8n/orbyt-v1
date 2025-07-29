import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Svg, Path, Circle, Defs, Mask } from 'react-native-svg';
import ProfileCache, { useProfileColors } from '../../../services/cache/ProfileCache';

interface VerificationBadgeProps {
  handle: string;
  size?: number;
  style?: ViewStyle;
  onPress?: () => void;
  textColor?: string;  // Text color to match - defaults to white if not provided
  borderColor?: string; // Badge border color - defaults to textColor if not provided
  badgeType?: 'circular' | 'scalloped' | 'auto'; // New prop to determine badge type
  textSize?: number; // New prop to automatically size badge based on text size
  autoPosition?: boolean; // New prop to automatically calculate positioning based on text size
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
 * When not provided, uses the profile's text color from ProfileCache.
 */
const VerificationBadge: React.FC<VerificationBadgeProps> = ({ 
  handle, 
  size, // Made optional since we can calculate from textSize
  style,
  onPress,
  textColor = '#FFFFFF',  // Default to white if not provided
  borderColor, // Will default to textColor if not provided
  badgeType = 'auto', // Default to auto to determine based on verification status
  textSize, // New prop to automatically size badge based on text size
  autoPosition = true // Default to true for consistent positioning
}) => {
  // Calculate badge size based on text size if provided, otherwise use default
  const calculateBadgeSize = () => {
    if (size) return size;
    if (textSize) {
      // Consistent sizing based on common author name text sizes throughout the app
      // VideoOverlay: 16px (normal), 15px (small), 19px (tablet)
      // CommentSection: 14px
      // ChannelHeader: 14px
      // MembersListView: 14px
      // NotificationScreen: 16px
      // VideoPostScreen: 16px
      // ExploreScreen: 16px
      // UniversalHeader: 24px (profile titles)
      
      // Scale badge size to be proportional to text size
      // For text sizes 10-12px (grid feed), use badge size 16-18px
      // For text sizes 13-15px (comments, channels), use badge size 18-20px
      // For text sizes 16-18px (video overlays, notifications), use badge size 20-22px
      // For text sizes 19-21px (tablet), use badge size 22-24px
      // For text sizes 22px+ (headers), use badge size 24-26px
      if (textSize <= 12) return Math.max(16, textSize + 6);
      if (textSize <= 15) return Math.max(18, textSize + 5);
      if (textSize <= 18) return Math.max(20, textSize + 4);
      if (textSize <= 21) return Math.max(22, textSize + 3);
      return Math.max(24, textSize + 2);
    }
    return 22; // Default size for better visibility
  };

  // Calculate automatic positioning based on text size
  const calculateAutoPosition = () => {
    if (!autoPosition || !textSize) return {};
    
    // Standardized margin calculation based on text size
    // For smaller text (10-12px): 3px margin
    // For medium text (13-15px): 4px margin (most common)
    // For larger text (16-18px): 5px margin
    // For tablet text (19-21px): 6px margin
    // For header text (22px+): 7px margin
    let marginLeft = 4; // Default
    
    if (textSize <= 12) marginLeft = 3;
    else if (textSize <= 15) marginLeft = 4;
    else if (textSize <= 18) marginLeft = 5;
    else if (textSize <= 21) marginLeft = 6;
    else marginLeft = 7;
    
    return { marginLeft, marginTop: 0 };
  };

  const badgeSize = calculateBadgeSize();
  const center = badgeSize / 2;
  const radius = (badgeSize - 4) / 2; // Leave some padding
  
  // Safety check for handle
  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    return null;
  }

  // Get profile data to determine verification status and type
  const { data: profile } = useQuery({
    queryKey: ['profile', handle.trim()],
    queryFn: async () => {
      return await ProfileCache.getProfile(handle.trim());
    },
    staleTime: 3600000, // Cache for 1 hour
    refetchOnWindowFocus: false
  });

  // Get profile colors for the badge
  const { colors } = useProfileColors(handle.trim());

  // Determine verification status and type
  const isVerified = profile?.verification?.isVerified || false;
  const isTrustedVerifier = profile?.verification?.trustedVerifierStatus === 'valid' || 
                           profile?.verification?.trustedVerifierStatus === 'active';

  // If not verified, don't render anything
  if (!isVerified) return null;

  // Determine badge type
  const actualBadgeType = badgeType === 'auto' 
    ? (isTrustedVerifier ? 'scalloped' : 'circular')
    : badgeType;

  // Use provided textColor, default to white
  const iconColor = textColor;
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
    const checkSize = radius * .9;
    const startX = center - checkSize * 0.3;
    const startY = center;
    const midX = center - checkSize * 0.1;
    const midY = center + checkSize * 0.3;
    const endX = center + checkSize * 0.4;
    const endY = center - checkSize * 0.2;
    
    return `M ${startX} ${startY} L ${midX} ${midY} L ${endX} ${endY}`;
  };

  // Combine auto positioning with custom style
  const combinedStyle = [
    styles.badge,
    autoPosition && calculateAutoPosition(),
    style
  ];

  const badgeComponent = (
    <Svg width={badgeSize} height={badgeSize} style={combinedStyle}>
      <Defs>
        {/* Create a mask where white areas are visible and black areas are cut out */}
        <Mask id={`checkmarkMask-${handle}`}>
          {/* White background makes everything visible */}
          <Path
            d={createBadgePath(actualBadgeType === 'scalloped')}
            fill="white"
          />
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
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {badgeComponent}
      </TouchableOpacity>
    );
  }

  // Otherwise, just render the SVG
  return badgeComponent;
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    // Ensure consistent vertical alignment with text
    marginTop: 0,
  }
});

export default VerificationBadge;