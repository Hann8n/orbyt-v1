import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Colors } from '@/theme';
import { hexToRGBA } from '@/utils/formatting/colors';

interface Props {
  isRecording: boolean;
  isLoading: boolean;
  disabled: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}

const RecordButton: React.FC<Props> = ({ isRecording, isLoading, disabled, onPressIn, onPressOut }) => {
  const scale = useSharedValue(1);
  const isDisabled = useSharedValue(disabled);

  useEffect(() => {
    isDisabled.value = disabled;
  }, [disabled, isDisabled]);

  const onPressInRef = useRef(onPressIn);
  const onPressOutRef = useRef(onPressOut);
  useEffect(() => {
    onPressInRef.current = onPressIn;
    onPressOutRef.current = onPressOut;
  });

  const fireDown = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressInRef.current();
  }, []);

  const fireUp = useCallback(() => {
    onPressOutRef.current();
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          if (isDisabled.value) return;
          scale.value = withTiming(0.93, { duration: 60 });
          fireDown();
        })
        .onFinalize(() => {
          scale.value = withTiming(1, { duration: 120 });
          fireUp();
        }),
    [fireDown, fireUp, isDisabled, scale],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isRecording || disabled ? 0.5 : 1, { duration: 100 }),
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.button, animatedStyle]}>
        {isLoading ? (
          <ActivityIndicator size="large" color="white" />
        ) : (
          <View style={styles.inner} />
        )}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 5,
    borderColor: Colors.neutral[50],
    backgroundColor: Colors.transparent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: hexToRGBA(Colors.neutral[500], 0.4),
  },
});

export default React.memo(RecordButton);
