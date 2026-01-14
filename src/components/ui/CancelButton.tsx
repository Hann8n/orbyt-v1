import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';

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
    backgroundColor: Colors.darkGray,
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
    backgroundColor: Colors.lightGray,
  },
  cancelButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Figtree-SemiBold',
  },
  cancelButtonTextPressed: {
    color: Colors.darkGray,
  },
  primaryButton: {
    backgroundColor: Colors.white,
  },
  primaryButtonPressed: {
    backgroundColor: Colors.lightGray,
  },
  primaryButtonText: {
    color: Colors.black,
  },
  primaryButtonTextPressed: {
    color: Colors.darkGray,
  },
});

export default CancelButton;
