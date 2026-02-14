import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import Icon from './Icon';

interface CloseButtonProps {
  onPress: () => void;
}

const CloseButton: React.FC<CloseButtonProps> = ({ onPress }) => {
  return (
    <Pressable
      style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      accessibilityHint="Closes the current sheet"
    >
      {({ pressed }) => (
        <Icon
          name="close"
          size={20}
          color={pressed ? Colors.black : Colors.neutral[50]}
          style={styles.closeIcon}
        />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  closeButtonPressed: {
    backgroundColor: Colors.neutral[50],
  },
  closeIcon: {
    margin: 0,
  },
});

export default CloseButton;
