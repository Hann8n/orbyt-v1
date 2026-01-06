import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';

interface CancelButtonProps {
  onPress: () => void;
  text?: string;
}

const CancelButton: React.FC<CancelButtonProps> = ({ onPress, text = 'Cancel' }) => {
  return (
    <Pressable
      style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Text style={[styles.cancelButtonText, pressed && styles.cancelButtonTextPressed]}>
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
    borderColor: 'transparent',
  },
  cancelButtonPressed: {
    backgroundColor: Colors.lightGray,
  },
  cancelButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  cancelButtonTextPressed: {
    color: Colors.darkGray,
  },
});

export default CancelButton;
