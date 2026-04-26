import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Colors } from '@/theme';

interface Props {
  progressSec: SharedValue<number>;
  maxDuration: number;
  height: number;
  fillColor?: string;
  pendingDeleteStartSec?: number | null;
}

const RecordingProgressBar: React.FC<Props> = ({
  progressSec,
  maxDuration,
  height,
  fillColor = Colors.purple[500],
  pendingDeleteStartSec,
}) => {
  const safeMax = Math.max(maxDuration, 1);

  const fillStyle = useAnimatedStyle(() => {
    const pct = (Math.min(Math.max(progressSec.value, 0), safeMax) / safeMax) * 100;
    return { width: `${pct}%` };
  }, [safeMax]);

  const deleteStyle = useAnimatedStyle(() => {
    if (pendingDeleteStartSec == null) return { width: 0 };
    const startPct = (Math.min(Math.max(pendingDeleteStartSec, 0), safeMax) / safeMax) * 100;
    const endPct = (Math.min(Math.max(progressSec.value, 0), safeMax) / safeMax) * 100;
    return {
      left: `${startPct}%`,
      width: `${Math.max(endPct - startPct, 0)}%`,
    };
  }, [safeMax, pendingDeleteStartSec]);

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: fillColor }, fillStyle]} />
        <Animated.View style={[styles.deleteOverlay, deleteStyle]} />
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
  },
  fill: {
    height: '100%',
  },
  deleteOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Colors.coral[500],
  },
});

export default React.memo(RecordingProgressBar);
