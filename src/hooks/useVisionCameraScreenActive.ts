import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function useVisionCameraScreenActive(options: {
  disposeBeforeInactive: () => Promise<void>;
  onFocusEnter?: () => void;
  onInactiveAfterDispose?: () => void;
}): boolean {
  const { disposeBeforeInactive } = options;
  const [sessionActive, setSessionActive] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);
  const epochRef = useRef(0);

  const onFocusEnterRef = useRef(options.onFocusEnter);
  const onInactiveAfterDisposeRef = useRef(options.onInactiveAfterDispose);

  useEffect(() => {
    onFocusEnterRef.current = options.onFocusEnter;
    onInactiveAfterDisposeRef.current = options.onInactiveAfterDispose;
  }, [options.onFocusEnter, options.onInactiveAfterDispose]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => setAppState(next));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const epoch = ++epochRef.current;
      setSessionActive(true);
      onFocusEnterRef.current?.();
      return () => {
        const captured = epoch;
        void (async () => {
          await disposeBeforeInactive();
          if (captured !== epochRef.current) return;
          onInactiveAfterDisposeRef.current?.();
          setSessionActive(false);
        })();
      };
    }, [disposeBeforeInactive])
  );

  return sessionActive && appState === 'active';
}
