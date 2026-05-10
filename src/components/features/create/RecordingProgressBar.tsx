import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Colors } from '@/theme';

interface Props {
  totalDuration: number;
  lastSegDuration: number | null;
  activeProgressSec: SharedValue<number>;
  maxDuration: number;
  height: number;
  fillColor?: string;
  isDeletePreviewActive: boolean;
}

const RecordingProgressBar: React.FC<Props> = ({
  totalDuration,
  lastSegDuration,
  activeProgressSec,
  maxDuration,
  height,
  fillColor = Colors.purple[500],
  isDeletePreviewActive,
}) => {
  const safeMax = Math.max(maxDuration, 1);

  const activeStyle = useAnimatedStyle(() => {
    const pct = (Math.min(Math.max(activeProgressSec.value, 0), safeMax) / safeMax) * 100;
    return { width: `${pct}%` };
  }, [safeMax]);

  const prevDuration = totalDuration - (lastSegDuration ?? 0);

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.track}>
        {isDeletePreviewActive && lastSegDuration != null ? (
          <>
            <View
              style={[
                styles.segment,
                { backgroundColor: fillColor, width: `${(prevDuration / safeMax) * 100}%` },
              ]}
            />
            <View
              style={[
                styles.segment,
                {
                  backgroundColor: Colors.coral[500],
                  width: `${(lastSegDuration / safeMax) * 100}%`,
                },
              ]}
            />
          </>
        ) : (
          <Animated.View style={[styles.segment, { backgroundColor: fillColor }, activeStyle]} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  track: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  segment: {
    height: '100%',
  },
});

export default React.memo(RecordingProgressBar);
