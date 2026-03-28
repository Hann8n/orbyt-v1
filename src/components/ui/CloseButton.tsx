import React from 'react';
import { StyleSheet } from 'react-native';
import { NativePressable } from './NativePressable';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import Icon from './Icon';

interface CloseButtonProps {
  onPress: () => void;
}

const CloseButton: React.FC<CloseButtonProps> = ({ onPress }) => {
  const { t } = useTranslation();
  return (
    <NativePressable
      style={styles.closeButton}
      onPress={onPress}
      androidRippleBorderless
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      accessibilityHint={t('common.closesSheet')}
    >
      <Icon name="close" size={34} color={Colors.neutral[200]} style={styles.closeIcon} />
    </NativePressable>
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
