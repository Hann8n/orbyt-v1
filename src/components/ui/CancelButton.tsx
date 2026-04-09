import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, type StyleProp, type ViewStyle } from 'react-native';
import { SquircleNativePressable } from './Squircle';
import {
  sheetFooterPrimaryContainer,
  sheetFooterPrimaryLabel,
  sheetFooterSecondaryContainer,
  sheetFooterSecondaryLabel,
} from './buttonPresets';

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
      style={[isPrimary ? sheetFooterPrimaryContainer : sheetFooterSecondaryContainer, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={displayText}
    >
      <Text style={isPrimary ? sheetFooterPrimaryLabel : sheetFooterSecondaryLabel}>
        {displayText}
      </Text>
    </SquircleNativePressable>
  );
};

export default CancelButton;
