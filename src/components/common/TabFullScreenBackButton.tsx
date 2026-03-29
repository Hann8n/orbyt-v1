import React from 'react';
import { StyleSheet } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { BackArrowIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import type { EdgeInsets } from 'react-native-safe-area-context';

export interface TabFullScreenBackButtonProps {
  onPress: () => void;
  insets: EdgeInsets;
  accessibilityLabel?: string;
  color?: string;
  size?: number;
}

/**
 * Shared back button component for full-screen tab stack screens.
 * Handles safe area insets and consistent positioning/styling.
 */
export const TabFullScreenBackButton: React.FC<TabFullScreenBackButtonProps> = ({
  onPress,
  insets,
  accessibilityLabel = 'Back',
  color = Colors.neutral[50],
  size = 30,
}) => {
  return (
    <NativePressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.backButton, { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 }]}
    >
      <BackArrowIcon size={size} color={color} />
    </NativePressable>
  );
};

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
    padding: 8,
  },
});
