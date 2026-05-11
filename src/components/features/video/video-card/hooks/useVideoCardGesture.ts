import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Max ms between two taps to count as double-tap (like). Single-tap plays/pauses after this window. */
const VIDEO_DOUBLE_TAP_WINDOW_MS = 260;

export interface UseVideoCardGestureArgs {
  postUri: string;
  cardHeight: number;
  /** Called when a single tap is confirmed (i.e. no second tap within the window). */
  onSingleTap: () => void;
  /** Called when a double-tap is confirmed (used for like + heart animation). */
  onDoubleTap: () => void | Promise<void>;
  /** Called when a long-press is confirmed (used to open comments). */
  onLongPress: () => void;
}

export interface UseVideoCardGestureResult {
  /** Composite RNGH gesture: race(longPress, singleTap). */
  gesture: ReturnType<typeof Gesture.Race>;
  /** Animated style for the floating heart that appears on double-tap. */
  heartAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
}

/**
 * Owns the per-card video gesture: tap demux (single→play/pause, double→like)
 * and the long-press → comments path. Heart animation shared values live here
 * so they don't survive recycle into the next card.
 */
export function useVideoCardGesture({
  postUri,
  cardHeight,
  onSingleTap,
  onDoubleTap,
  onLongPress,
}: UseVideoCardGestureArgs): UseVideoCardGestureResult {
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const heartPositionX = useSharedValue(0);
  const heartPositionY = useSharedValue(0);

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    left: heartPositionX.value - 50,
    top: heartPositionY.value - 50,
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));

  // LegendList recycle: cancel in-flight heart animation so SVs don't leak to the next post.
  useEffect(() => {
    cancelAnimation(heartScale);
    cancelAnimation(heartOpacity);
    cancelAnimation(heartPositionX);
    cancelAnimation(heartPositionY);
    heartScale.value = 0;
    heartOpacity.value = 0;
    heartPositionX.value = 0;
    heartPositionY.value = 0;
  }, [postUri, heartScale, heartOpacity, heartPositionX, heartPositionY]);

  // Heartbeat pattern: quick beat, slight dip, second beat, then fade out.
  const animateHeart = useCallback(
    (x: number, y: number) => {
      heartScale.value = 0;
      heartOpacity.value = 0;
      heartPositionX.value = x;
      heartPositionY.value = y;

      heartOpacity.value = 1;
      heartScale.value = withSequence(
        withTiming(1.3, { duration: 100, easing: Easing.out(Easing.ease) }),
        withTiming(0.95, { duration: 80, easing: Easing.in(Easing.ease) }),
        withTiming(1.15, { duration: 100, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 120, easing: Easing.inOut(Easing.ease) })
      );

      heartOpacity.value = withDelay(
        400,
        withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }, () => {
          heartScale.value = 0;
        })
      );
    },
    [heartScale, heartOpacity, heartPositionX, heartPositionY]
  );

  // Single timer shared between single/double-tap detection (bridge target for runOnJS).
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSingleTapTimer = useCallback(() => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  }, []);

  const handleTap = useCallback(
    (x: number, y: number) => {
      if (singleTapTimerRef.current != null) {
        clearSingleTapTimer();
        animateHeart(x, y);
        void onDoubleTap();
        return;
      }
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        onSingleTap();
      }, VIDEO_DOUBLE_TAP_WINDOW_MS);
    },
    [animateHeart, clearSingleTapTimer, onDoubleTap, onSingleTap]
  );

  const handleLongPress = useCallback(() => {
    clearSingleTapTimer();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress();
  }, [clearSingleTapTimer, onLongPress]);

  // RNGH gesture: race long-press vs tap. Recognition runs on the UI thread; runOnJS bridges
  // to JS only when a gesture is confirmed (no overhead during idle scroll). The worklet
  // closures below capture JS callbacks to bridge — that's the Reanimated/RNGH pattern, not
  // a render-time access, so the React Hooks lint rule is suppressed locally.
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDuration(250)
      .numberOfTaps(1)
      // eslint-disable-next-line react-hooks/refs
      .onEnd((event, success) => {
        'worklet';
        if (!success) return;
        const x = event.x ?? 0;
        const y = event.y ?? cardHeight / 2;
        runOnJS(handleTap)(x, y);
      });

    const longPress = Gesture.LongPress()
      .minDuration(400)
      // eslint-disable-next-line react-hooks/refs
      .onEnd((_event, success) => {
        'worklet';
        if (!success) return;
        runOnJS(handleLongPress)();
      });

    return Gesture.Race(longPress, tap);
  }, [handleTap, handleLongPress, cardHeight]);

  useEffect(() => {
    clearSingleTapTimer();
    return () => clearSingleTapTimer();
  }, [postUri, clearSingleTapTimer]);

  return { gesture, heartAnimatedStyle };
}
