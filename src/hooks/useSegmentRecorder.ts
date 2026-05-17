import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  type CameraVideoOutput,
  type Recorder,
  useMicrophonePermission,
} from 'react-native-vision-camera';

import { logger } from '@/utils/logger';
import { useCreateSegmentsStore } from '@/stores/createSegmentsStore';

const toFileUri = (path: string): string => (path.startsWith('file://') ? path : `file://${path}`);

interface ActiveRecording {
  recorder: Recorder;
  epoch: number;
  budgetSec: number;
  autoStopTimeout: ReturnType<typeof setTimeout> | null;
  done: Promise<void>;
  /** Captured before stopRecording — recordedDuration returns 0 once stopped. */
  capturedDuration: number;
}

export interface SegmentRecorder {
  isRecording: boolean;
  recorderRef: React.RefObject<Recorder | null>;
  baseDurationRef: React.RefObject<number>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  stopFireAndForget: () => void;
  cancel: () => Promise<void>;
}

interface Options {
  videoOutput: CameraVideoOutput;
  onSegmentCommitted?: () => void;
  onAutoStopReached?: () => void;
}

export function useSegmentRecorder({
  videoOutput,
  onSegmentCommitted,
  onAutoStopReached,
}: Options): SegmentRecorder {
  const { t } = useTranslation();
  const microphonePermission = useMicrophonePermission();
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef = useRef<Recorder | null>(null);
  const activeRef = useRef<ActiveRecording | null>(null);
  const baseDurationRef = useRef(0);
  const epochRef = useRef(0);

  const onSegmentCommittedRef = useRef(onSegmentCommitted);
  const onAutoStopReachedRef = useRef(onAutoStopReached);
  useEffect(() => {
    onSegmentCommittedRef.current = onSegmentCommitted;
    onAutoStopReachedRef.current = onAutoStopReached;
  });

  const clearAutoStop = useCallback((active: ActiveRecording | null) => {
    if (!active?.autoStopTimeout) return;
    clearTimeout(active.autoStopTimeout);
    active.autoStopTimeout = null;
  }, []);

  const finalizeIdleState = useCallback(() => {
    recorderRef.current = null;
    activeRef.current = null;
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;

    const segStore = useCreateSegmentsStore.getState();
    const budgetSec = segStore.availableTime();
    if (budgetSec <= 0) return;

    if (!microphonePermission.hasPermission) {
      const granted = await microphonePermission.requestPermission();
      if (!granted) {
        Alert.alert(t('video.microphonePermission'), t('video.microphonePermissionMessage'));
        return;
      }
    }

    const epoch = epochRef.current;

    let recorder: Recorder;
    try {
      recorder = await videoOutput.createRecorder({});
    } catch (error) {
      const err = error as Error;
      logger.error('[Camera] createRecorder failed', {
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
      });
      return;
    }

    if (epoch !== epochRef.current) {
      try {
        await recorder.cancelRecording();
      } catch {
        // recorder may have already been cancelled
      }
      return;
    }

    baseDurationRef.current = segStore.totalDuration();

    let resolveDone!: () => void;
    const done = new Promise<void>(r => {
      resolveDone = r;
    });

    const active: ActiveRecording = {
      recorder,
      epoch,
      budgetSec,
      autoStopTimeout: null,
      done,
      capturedDuration: 0,
    };

    const finish = (filePath: string | null, error?: Error) => {
      clearAutoStop(active);
      const stale = epochRef.current !== epoch;

      if (error) {
        logger.error('[Camera] recording error', { message: error.message });
      } else if (filePath && !stale) {
        const clamped = Math.min(
          active.capturedDuration,
          useCreateSegmentsStore.getState().availableTime()
        );
        if (clamped > 0) {
          const ok = useCreateSegmentsStore.getState().addSegment({
            duration: clamped,
            video: { uri: toFileUri(filePath) },
            sourceType: 'camera',
          });
          if (ok) onSegmentCommittedRef.current?.();
        }
      }

      finalizeIdleState();
      resolveDone();
    };

    try {
      await recorder.startRecording(
        path => finish(path),
        err => finish(null, err)
      );
    } catch (error) {
      logger.error('[Camera] startRecording failed', { error });
      finalizeIdleState();
      resolveDone();
      return;
    }

    recorderRef.current = recorder;
    activeRef.current = active;
    setIsRecording(true);

    active.autoStopTimeout = setTimeout(() => {
      void (async () => {
        const a = activeRef.current;
        if (!a || a.epoch !== epoch) return;
        a.capturedDuration = a.budgetSec;
        try {
          await a.recorder.stopRecording();
        } catch {
          // recorder may have already stopped
        }
        await a.done;
        if (epochRef.current === epoch) onAutoStopReachedRef.current?.();
      })();
    }, budgetSec * 1000);
  }, [clearAutoStop, finalizeIdleState, microphonePermission, t, videoOutput]);

  const stop = useCallback(async () => {
    const active = activeRef.current;
    if (!active) return;
    clearAutoStop(active);
    active.capturedDuration = active.recorder.recordedDuration;
    try {
      await active.recorder.stopRecording();
    } catch {
      // recorder may have already stopped
    }
    await active.done;
  }, [clearAutoStop]);

  const stopFireAndForget = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    clearAutoStop(active);
    active.capturedDuration = active.recorder.recordedDuration;
    active.recorder.stopRecording().catch(() => {});
  }, [clearAutoStop]);

  const cancel = useCallback(async () => {
    const active = activeRef.current;
    epochRef.current += 1;
    if (!active) return;
    clearAutoStop(active);
    try {
      await active.recorder.cancelRecording();
    } catch {
      try {
        await active.recorder.stopRecording();
      } catch {
        // ignore: both cancel and stop failed
      }
    }
    finalizeIdleState();
  }, [clearAutoStop, finalizeIdleState]);

  useEffect(
    () => () => {
      epochRef.current += 1;
    },
    []
  );

  return {
    isRecording,
    recorderRef,
    baseDurationRef,
    start,
    stop,
    stopFireAndForget,
    cancel,
  };
}
