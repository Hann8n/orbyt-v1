import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NativePressable } from '@/components/ui/NativePressable';
import { Svg, Path } from 'react-native-svg';
import type { Label } from '@atproto/api/dist/client/types/com/atproto/label/defs';
import { useProfile } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';
import { profileHasBotSelfLabel } from '@/utils/atproto/profileLabels';

/** 24×24 viewBox — `MGC Icon System Pro` cute filled `development/robot_cute_fi.svg` */
const ROBOT_CUTE_FILLED_PATH =
  'M11.562 1.547c-.565.119-1.125.581-1.378 1.135-.378.827-.106 1.893.613 2.398.178.125.199.156.201.29l.002.15H9.97c-1.872 0-2.534.115-3.493.605-1.396.712-2.501 2.117-2.795 3.553l-.07.338-.276.085c-1.305.403-2.036 1.632-1.756 2.954.176.834.859 1.569 1.699 1.827l.221.068.031.295c.12 1.12.244 1.6.59 2.274.729 1.419 2.146 2.521 3.619 2.816.627.125 1.207.145 4.26.145s3.633-.02 4.26-.145c1.494-.299 2.925-1.428 3.656-2.887.322-.642.394-.934.553-2.241l.031-.252.291-.098a2.552 2.552 0 0 0 1.629-1.755c.085-.336.077-.864-.019-1.238-.114-.445-.295-.758-.641-1.106a2.433 2.433 0 0 0-1.096-.658l-.276-.084-.07-.338c-.297-1.45-1.433-2.875-2.858-3.588-.911-.455-1.6-.57-3.43-.57H13l.002-.15c.002-.134.023-.165.201-.29.558-.392.874-1.16.765-1.86-.113-.727-.553-1.284-1.248-1.579-.175-.075-.305-.096-.64-.104a4.101 4.101 0 0 0-.518.01M9.34 11.066c.115.039.263.135.361.233.281.28.299.385.299 1.701 0 1.317-.018 1.42-.3 1.702a1 1 0 0 1-1.489-.096c-.204-.268-.216-.374-.203-1.698L8.02 11.7l.111-.189a.987.987 0 0 1 1.209-.445m6 0c.253.087.507.341.594.594.098.288.098 2.392 0 2.68-.246.722-1.256.878-1.723.266-.204-.268-.216-.374-.203-1.698l.012-1.208.111-.189a.987.987 0 0 1 1.209-.445';

interface BotBadgeProps {
  handle: string;
  /** When set with `labels`, skips profile fetch */
  did?: string | null;
  labels?: Label[] | null;
  size?: number;
  textSize?: number;
  customMargin?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  textColor?: string;
  borderColor?: string;
}

const getBadgeSizeFromText = (textSize: number): number => {
  return Math.round(textSize * 1.1);
};

const BotBadge: React.FC<BotBadgeProps> = ({
  handle,
  did: didProp,
  labels: labelsProp,
  size,
  textSize,
  customMargin,
  style,
  onPress,
  textColor = Colors.neutral[50],
  borderColor,
}) => {
  const { t } = useTranslation();
  const badgeSize = size ?? (textSize ? getBadgeSizeFromText(textSize) : 20);
  const marginLeft = customMargin ?? Math.round(badgeSize * 0.2);

  const hasInlineLabels = labelsProp !== undefined && didProp != null && String(didProp).length > 0;
  const { data: profile } = useProfile(hasInlineLabels ? null : handle);

  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    return null;
  }

  const did = (hasInlineLabels ? didProp : profile?.did) ?? null;
  const labels = hasInlineLabels ? labelsProp : profile?.labels;

  if (!profileHasBotSelfLabel(did, labels)) return null;

  const fillColor = borderColor || textColor;
  const a11yLabel = t('profile.botAccountA11y');
  const badgeSvg = (
    <Svg
      width={badgeSize}
      height={badgeSize}
      viewBox="0 0 24 24"
      style={[{ marginLeft }, style]}
      accessibilityLabel={onPress ? undefined : a11yLabel}
      accessibilityRole={onPress ? undefined : 'image'}
    >
      <Path d={ROBOT_CUTE_FILLED_PATH} fill={fillColor} fillRule="evenodd" />
    </Svg>
  );

  if (onPress) {
    return (
      <NativePressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11yLabel}>
        {badgeSvg}
      </NativePressable>
    );
  }

  return badgeSvg;
};

export default React.memo(BotBadge);
