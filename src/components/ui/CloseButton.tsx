import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../utils/constants';
import { hexToRGBA } from '../../utils/formatting/colors';
import { Colors } from './UI';
import Icon from './Icon';

interface CloseButtonProps {
  onPress: () => void;
}

const CloseButton: React.FC<CloseButtonProps> = ({ onPress }) => {
  const { t } = useTranslation();
  return (
    <Pressable
      style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      accessibilityHint={t('common.closesSheet')}
    >
      <Icon name="close" size={34} color={Colors.neutral[50]} style={styles.closeIcon} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.transparent,
  },
  closeButtonPressed: {
    backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
  },
  closeIcon: {
    margin: 0,
  },
});

export default CloseButton;
