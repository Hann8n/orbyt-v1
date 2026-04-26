import { useEffect } from 'react';
import {
  cancelAnimation,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

import { useCreateSegmentsStore } from '@/stores/createSegmentsStore';
import type { SegmentRecorder } from './useSegmentRecorder';

interface Result {
  activeProgressSec: SharedValue<number>;
}

export function useRecordingProgress(recorder: SegmentRecorder): Result {
  const activeProgressSec = useSharedValue(0);
  const { isRecording, baseDurationRef } = recorder;
  const maxDuration = useCreateSegmentsStore(s => s.maxDuration);

  useEffect(() => {
    if (!isRecording) {
      cancelAnimation(activeProgressSec);
      activeProgressSec.value = 0;
      return;
    }
    const remaining = maxDuration - baseDurationRef.current;
    if (remaining <= 0) return;
    activeProgressSec.value = 0;
    activeProgressSec.value = withTiming(remaining, {
      duration: remaining * 1000,
      easing: Easing.linear,
    });
  }, [isRecording, maxDuration, activeProgressSec, baseDurationRef]);

  return { activeProgressSec };
}
