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
  progressSec: SharedValue<number>;
}

export function useRecordingProgress(recorder: SegmentRecorder): Result {
  const progressSec = useSharedValue(0);
  const { isRecording, baseDurationRef } = recorder;
  // Set to true in the recording cleanup so we freeze the bar while waiting
  // for the just-finished segment to land in the store.
  const pendingCommitRef = useRef(false);

  const committedTotal = useCreateSegmentsStore(s => s.totalDuration());
  const maxDuration = useCreateSegmentsStore(s => s.maxDuration);

  // Recording: linear withTiming from base → maxDuration, entirely on UI thread.
  useEffect(() => {
    if (!isRecording) return;

    pendingCommitRef.current = false;
    const base = baseDurationRef.current;
    const remaining = maxDuration - base;
    if (remaining <= 0) return;

    progressSec.value = base;
    progressSec.value = withTiming(maxDuration, {
      duration: remaining * 1000,
      easing: Easing.linear,
    });

    return () => {
      cancelAnimation(progressSec);
      // Mark that we're waiting for the segment commit — only set here so we
      // don't accidentally block delete animations during normal idle state.
      pendingCommitRef.current = true;
    };
  }, [isRecording, maxDuration, progressSec, baseDurationRef]);

  // Idle: track the store's committed total.
  useEffect(() => {
    if (isRecording) return;

    if (pendingCommitRef.current) {
      // Post-stop grace: hold position until the committed segment arrives.
      if (committedTotal >= progressSec.value) {
        pendingCommitRef.current = false;
        progressSec.value = committedTotal;
      }
      return;
    }

    // Segment deleted → animate the bar down. Segment added → snap up instantly.
    if (committedTotal < progressSec.value) {
      progressSec.value = withTiming(committedTotal, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });
    } else {
      progressSec.value = committedTotal;
    }
  }, [committedTotal, isRecording, progressSec]);

  return { progressSec };
}
