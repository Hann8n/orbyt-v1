import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Colors } from '@/theme';

interface Props {
  progressSec: SharedValue<number>;
  maxDuration: number;
  height: number;
  fillColor?: string;
  pendingDelete?: { startSec: number; endSec: number } | null;
}

const RecordingProgressBar: React.FC<Props> = ({
  progressSec,
  maxDuration,
  height,
  fillColor = Colors.purple[500],
  pendingDelete,
}) => {
  const safeMax = Math.max(maxDuration, 1);

  const animatedFillStyle = useAnimatedStyle(() => {
    const clamped = Math.min(Math.max(progressSec.value, 0), safeMax);
    return { width: `${(clamped / safeMax) * 100}%` };
  }, [safeMax]);

  const pendingStyle = useMemo(() => {
    if (!pendingDelete) return null;
    const startPct = (Math.min(Math.max(pendingDelete.startSec, 0), safeMax) / safeMax) * 100;
    const endPct = (Math.min(Math.max(pendingDelete.endSec, 0), safeMax) / safeMax) * 100;
    return {
      left: `${startPct}%` as const,
      width: `${Math.max(endPct - startPct, 0)}%` as const,
    };
  }, [pendingDelete, safeMax]);

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: fillColor }, animatedFillStyle]} />
        {pendingStyle && <View style={[styles.pendingDelete, pendingStyle]} />}
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
    backgroundColor: Colors.transparent,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    minHeight: 4,
  },
  pendingDelete: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Colors.coral[500],
    minHeight: 4,
  },
});

export default React.memo(RecordingProgressBar);
