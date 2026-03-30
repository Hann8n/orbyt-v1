import React from 'react';
import { StyleSheet } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { BackArrowIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getEffectiveTopInset } from '@/utils/device/screen';
import { LAYOUT_INSETS } from '@/utils/constants';
import { PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET } from '@/components/layout/detail/ProfileChannelFeedLayout';

export interface TabFullScreenBackButtonProps {
  onPress: () => void;
  insets: EdgeInsets;
  accessibilityLabel?: string;
  color?: string;
  size?: number;
}

/**
 * Shared back button for full-screen tab stack screens (e.g. feed modal).
 * Matches `DetailScreenOverlay` on profile/channel: effective top inset, row offset, 16px leading, 40×40 target.
 */
export const TabFullScreenBackButton: React.FC<TabFullScreenBackButtonProps> = ({
  onPress,
  insets,
  accessibilityLabel = 'Back',
  color = Colors.neutral[50],
  size = 30,
}) => {
  const hookTop = typeof insets?.top === 'number' ? insets.top : 0;
  const top = getEffectiveTopInset(hookTop) + PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET;

  return (
    <NativePressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.backButton, { top }]}
    >
      <BackArrowIcon size={size} color={color} />
    </NativePressable>
  );
};

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: LAYOUT_INSETS.DETAIL_OVERLAY_HORIZONTAL,
    zIndex: 100,
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
});
