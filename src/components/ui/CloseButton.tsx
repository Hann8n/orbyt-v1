import React from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import Icon from './Icon';
import { SquircleNativePressable } from './Squircle';

interface CloseButtonProps {
  onPress: () => void;
}

const CloseButton: React.FC<CloseButtonProps> = ({ onPress }) => {
  const { t } = useTranslation();
  return (
    <SquircleNativePressable
      style={styles.closeButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      accessibilityHint={t('common.closesSheet')}
    >
      <Icon name="close" size={34} color={Colors.neutral[200]} style={styles.closeIcon} />
    </SquircleNativePressable>
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
  closeIcon: {
    margin: 0,
  },
});

export default CloseButton;
