import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { useProfile } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';

// Certificate badge shapes (24x24 viewBox).
// Scalloped variant matches `cute filled/system/certificate_cute_fi.svg`.
const CERTIFICATE_SCALLOPED_PATH =
  'M11.244 1.482c-.68.178-.987.385-1.909 1.287-.399.39-.777.731-.84.759-.077.033-.49.057-1.255.074-1.06.023-1.163.031-1.465.124a3.072 3.072 0 0 0-2.112 2.322c-.047.23-.063.549-.063 1.256 0 .627-.016 1.002-.049 1.111-.038.131-.197.318-.77.905-.723.742-.942 1.018-1.123 1.414-.346.755-.346 1.777 0 2.532.18.393.396.665 1.122 1.412.572.587.732.776.771.907.032.108.049.476.049 1.08 0 .503.02 1.032.043 1.175a3.056 3.056 0 0 0 2.517 2.517c.143.023.672.043 1.175.043.604 0 .972.017 1.08.049.131.039.32.199.907.771.747.726 1.019.942 1.412 1.122.755.346 1.777.346 2.532 0 .393-.18.665-.396 1.412-1.122.587-.572.776-.732.907-.771.108-.032.476-.049 1.08-.049.503 0 1.032-.02 1.175-.043a3.056 3.056 0 0 0 2.517-2.517c.023-.143.043-.672.043-1.175 0-.604.017-.972.049-1.08.039-.131.199-.32.771-.907.927-.953 1.123-1.245 1.3-1.938a3.39 3.39 0 0 0 0-1.48c-.177-.694-.377-.992-1.301-1.94-.573-.587-.732-.774-.77-.905-.033-.109-.049-.484-.049-1.111 0-1.021-.041-1.35-.221-1.794a3.056 3.056 0 0 0-2.227-1.847c-.23-.047-.549-.063-1.256-.063-.627 0-1.002-.016-1.111-.049-.131-.038-.318-.197-.905-.77-.948-.924-1.246-1.124-1.94-1.301-.419-.107-1.083-.106-1.496.002m4.897 7.225c.428.145.734.623.687 1.073-.043.421-.216.629-.868 1.042-1.662 1.053-3.026 2.417-4.014 4.014-.151.244-.339.506-.418.583-.284.275-.786.344-1.16.157-.168-.083-.289-.202-.623-.61a13.883 13.883 0 0 0-1.797-1.785c-.459-.366-.586-.551-.617-.9-.034-.369.043-.58.307-.843.244-.243.421-.318.75-.318.378 0 .797.29 1.868 1.292l.476.445.104-.137a15.696 15.696 0 0 1 2.524-2.616c.603-.483 1.828-1.315 2.066-1.402.21-.077.481-.075.715.005';

// Circular variant matches the same proportions as other cute-filled 24x24 system icons.
// This is also exported as `cute filled/system/certificate_circle_cute_fi.svg`.
const CERTIFICATE_CIRCLE_PATH =
  'M11.28 2.024c-2.109.185-3.979.926-5.561 2.201-1.675 1.351-2.908 3.28-3.416 5.346-.216.881-.277 1.41-.277 2.429s.061 1.548.277 2.429c.886 3.607 3.839 6.502 7.457 7.311.844.189 1.287.236 2.24.236.953 0 1.396-.047 2.24-.236 3.618-.809 6.571-3.704 7.457-7.311.213-.869.276-1.413.278-2.409.001-.976-.043-1.404-.235-2.26-.458-2.049-1.658-4.025-3.26-5.369-1.824-1.531-3.915-2.321-6.26-2.368a15.89 15.89 0 0 0-.94.001m5.27 6.117c.425.126.725.586.678 1.039-.039.378-.254.67-.639.865-.291.148-1.112.674-1.509.967-1.39 1.026-2.466 2.247-3.433 3.893-.391.666-.597.826-1.068.829-.399.002-.593-.132-1.031-.713-.476-.63-1.468-1.621-2.077-2.073-.558-.416-.679-.584-.704-.978-.02-.313.06-.543.261-.75a.992.992 0 0 1 1.154-.201c.321.161 1.111.8 1.727 1.397.315.305.579.548.586.54l.284-.396A14.46 14.46 0 0 1 14.3 9.11c.713-.487 1.443-.914 1.7-.993.16-.049.331-.041.55.024';

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
  const badgePath =
    actualBadgeType === 'scalloped' ? CERTIFICATE_SCALLOPED_PATH : CERTIFICATE_CIRCLE_PATH;

  const badgeComponent = (
    <Svg width={badgeSize} height={badgeSize} viewBox="0 0 24 24" style={[{ marginLeft }, style]}>
      <Path d={badgePath} fill={fillColor} fillRule="evenodd" />
    </Svg>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{badgeComponent}</Pressable>;
  }

  return badgeComponent;
};

export default React.memo(VerificationBadge);
