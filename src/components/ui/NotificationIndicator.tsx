import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from './UI';

interface NotificationIndicatorProps {
  hasUnread?: boolean;
  size?: 'small' | 'medium';
  position?: 'top-right' | 'top-left';
}

export const NotificationIndicator: React.FC<NotificationIndicatorProps> = ({
  hasUnread = false,
  size = 'small',
  position = 'top-right',
}) => {
  if (!hasUnread) return null;

  const indicatorSize = size === 'small' ? 12 : 16;

  return (
    <View
      style={[
        styles.indicator,
        {
          width: indicatorSize,
          height: indicatorSize,
          borderRadius: indicatorSize / 2,
        },
        position === 'top-right' ? styles.topRight : styles.topLeft,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: Colors.green,
    borderWidth: 2,
    borderColor: Colors.black,
    position: 'absolute',
    zIndex: 10,
  },
  topRight: {
    top: -4,
    right: -4,
  },
  topLeft: {
    top: -4,
    left: -4,
  },
});
