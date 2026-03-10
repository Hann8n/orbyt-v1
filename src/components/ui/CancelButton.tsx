import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import { hexToRGBA } from '../../utils/formatting/colors';

interface CancelButtonProps {
  onPress: () => void;
  text?: string;
  variant?: 'default' | 'primary';
}

const CancelButton: React.FC<CancelButtonProps> = ({
  onPress,
  text = 'Cancel',
  variant = 'default',
}) => {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.cancelButton,
        isPrimary && styles.primaryButton,
        pressed && (isPrimary ? styles.primaryButtonPressed : styles.cancelButtonPressed),
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
    >
      {({ pressed }) => (
        <Text
          style={[
            styles.cancelButtonText,
            isPrimary && styles.primaryButtonText,
            pressed &&
              (isPrimary ? styles.primaryButtonTextPressed : styles.cancelButtonTextPressed),
          ]}
        >
          {text}
        </Text>
      )}
    </Pressable>
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
  cancelButtonPressed: {
    backgroundColor: Colors.neutral[700],
  },
  cancelButtonText: {
    color: Colors.neutral[50],
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    fontFamily: 'Figtree-Medium',
  },
  cancelButtonTextPressed: {
    color: Colors.neutral[50],
  },
  primaryButton: {
    backgroundColor: Colors.neutral[50],
  },
  primaryButtonPressed: {
    backgroundColor: hexToRGBA(Colors.neutral[200], 0.8),
  },
  primaryButtonText: {
    color: Colors.black,
  },
  primaryButtonTextPressed: {
    color: Colors.neutral[900],
  },
});

export default CancelButton;
