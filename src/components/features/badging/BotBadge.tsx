import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NativePressable } from '@/components/ui/NativePressable';
import type { Label } from '@atproto/api/dist/client/types/com/atproto/label/defs';
import { useProfile } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';
import { profileHasBotSelfLabel } from '@/utils/atproto/profileLabels';
import { NanoIcon } from '../../ui/NanoIcon';

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
    <NanoIcon
      name="robot-cute-filled"
      size={badgeSize}
      color={fillColor}
      style={[{ marginLeft }, style]}
      accessible={!onPress}
      accessibilityLabel={onPress ? undefined : a11yLabel}
      accessibilityRole={onPress ? undefined : 'image'}
    />
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
