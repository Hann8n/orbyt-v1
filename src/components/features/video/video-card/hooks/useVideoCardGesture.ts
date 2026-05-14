import { useCallback, useEffect, useMemo } from 'react';
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


export interface UseVideoCardGestureArgs {
  postUri: string;
  /** Called when a single tap is confirmed. */
  onSingleTap: () => void;
  /** Called when a double-tap is confirmed (used for like + heart animation). */
  onDoubleTap: () => void | Promise<void>;
  /** Called when a long-press is confirmed (used to open comments). */
  onLongPress: () => void;
}

export interface UseVideoCardGestureResult {
  /** Composite RNGH gesture: race(doubleTap, singleTap, longPress). */
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
  onSingleTap,
  onDoubleTap,
  onLongPress,
}: UseVideoCardGestureArgs): UseVideoCardGestureResult {
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));

  // FlashList recycle: cancel in-flight heart animation so SVs don't leak to the next post.
  useEffect(() => {
    cancelAnimation(heartScale);
    cancelAnimation(heartOpacity);
    heartScale.value = 0;
    heartOpacity.value = 0;
  }, [postUri, heartScale, heartOpacity]);

  // Heartbeat pattern: quick beat, slight dip, second beat, then fade out.
  const animateHeart = useCallback(() => {
    heartScale.value = 0;
    heartOpacity.value = 0;

    heartOpacity.value = 1;
    heartScale.value = withSequence(
      withTiming(1.5, { duration: 120, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(1.0, { duration: 100, easing: Easing.bezier(0.42, 0, 0.58, 1) }),
      withTiming(1.3, { duration: 120, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(1.0, { duration: 150, easing: Easing.inOut(Easing.ease) })
    );

    heartOpacity.value = withDelay(
      490,
      withTiming(0, { duration: 350, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }, () => {
        heartScale.value = 0;
      })
    );
  }, [heartScale, heartOpacity]);

  // RNGH gesture: exclusive between double-tap and single-tap (double-tap takes priority),
  // then race with long-press. Recognition runs on the UI thread; runOnJS bridges to JS
  // only when a gesture is confirmed (no overhead during idle scroll).
  const gesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((_event, success) => {
        'worklet';
        if (!success) return;
        runOnJS(animateHeart)();
        runOnJS(onDoubleTap)();
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd((_event, success) => {
        'worklet';
        if (!success) return;
        runOnJS(onSingleTap)();
      });

    const longPress = Gesture.LongPress()
      .minDuration(400)
      .onEnd((_event, success) => {
        'worklet';
        if (!success) return;
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        runOnJS(onLongPress)();
      });

    return Gesture.Race(Gesture.Exclusive(doubleTap, singleTap), longPress);
  }, [animateHeart, onDoubleTap, onSingleTap, onLongPress]);

  return { gesture, heartAnimatedStyle };
}
