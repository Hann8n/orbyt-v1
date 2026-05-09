import { useEffect, useRef } from 'react';
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
  const totalDuration = useCreateSegmentsStore(s =>
    s.segments.reduce((sum, seg) => sum + seg.duration, 0)
  );
  const wasRecordingRef = useRef(false);

  useEffect(() => {
    const wasRecording = wasRecordingRef.current;
    wasRecordingRef.current = isRecording;

    if (isRecording) {
      const remaining = maxDuration - baseDurationRef.current;
      if (remaining <= 0) return;
      // Animate from current bar position to max. No explicit pre-assignment —
      // the bar is already at the right spot after the previous sync, and
      // snapping to baseDurationRef.current before the animation starts causes
      // a visible jump when the segment commit races ahead of the next press.
      activeProgressSec.value = withTiming(maxDuration, {
        duration: remaining * 1000,
        easing: Easing.linear,
      });
      return;
    }

    cancelAnimation(activeProgressSec);
    if (!wasRecording) {
      activeProgressSec.value = totalDuration;
    }
  }, [isRecording, maxDuration, totalDuration, activeProgressSec, baseDurationRef]);

  return { activeProgressSec };
}
