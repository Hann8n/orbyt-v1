import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import { hexToRGBA } from '../../utils/formatting/colors';
import { FontFamily, Typography } from '../../utils/components/typography';
import { SquircleNativePressable } from './Squircle';

interface CancelButtonProps {
  onPress: () => void;
  text?: string;
  variant?: 'default' | 'primary';
  style?: StyleProp<ViewStyle>;
}

const CancelButton: React.FC<CancelButtonProps> = ({
  onPress,
  text,
  variant = 'default',
  style,
}) => {
  const { t } = useTranslation();
  const displayText = text ?? t('common.cancel');
  const isPrimary = variant === 'primary';
  return (
    <SquircleNativePressable
      style={[styles.cancelButton, isPrimary && styles.primaryButton, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={displayText}
    >
      <Text style={[styles.cancelButtonText, isPrimary && styles.primaryButtonText]}>
        {displayText}
      </Text>
    </SquircleNativePressable>
  );
};

const styles = StyleSheet.create({
  cancelButton: {
    backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 44,
    borderWidth: 0,
    borderColor: Colors.transparent,
  },
  cancelButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    textAlign: 'center',
    fontFamily: FontFamily.medium,
  },
  primaryButton: {
    backgroundColor: Colors.neutral[50],
  },
  primaryButtonText: {
    color: Colors.black,
  },
});

export default CancelButton;
