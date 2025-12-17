import React, { useRef } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Slider as RNSlider } from '@miblanchard/react-native-slider';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import ProgressBar from './ProgressBar';
import { StartThumb, EndThumb } from './Thumb';
import { sliderStyles } from './styles';
import type { FrameInfo } from '../utils/frameExtractor';

interface SliderProps {
  style?: ViewStyle;
  duration: number;
  thumbs: [number, number];
  playbackTime: number;
  tintColor?: string;
  onSlidingComplete: (segment: number[], value: number) => void;
  onValueChange?: (value: number[]) => void;
  maxDuration?: number;
  frames?: FrameInfo[];
  startPercent: SharedValue<number>;
  endPercent: SharedValue<number>;
}

function Slider({
  style,
  duration,
  thumbs,
  playbackTime,
  onSlidingComplete,
  onValueChange,
  tintColor,
  maxDuration,
  frames,
  startPercent,
  endPercent,
}: SliderProps) {
  const thumbIndexRef = useRef(0);
  const thumbColor = 'white';
  
  return (
    <View style={[sliderStyles.container, style]}>
      <View style={sliderStyles.sliderWrapper}>
        {/* Frames background - spans entire track, positioned to match track */}
        {/* Always render background for black background even when frames haven't loaded */}
        <View style={sliderStyles.framesBackground}>
          {frames && frames.length > 0 && (
            <ProgressBar
              value={0}
              tintColor={tintColor}
              frames={frames}
              duration={duration}
              startPercent={startPercent}
              endPercent={endPercent}
            />
          )}
        </View>
        <View style={sliderStyles.sliderContainer}>
          <RNSlider
            animateTransitions
            animationType="spring"
            maximumValue={duration}
            minimumValue={0}
            step={0.1}
            value={thumbs}
            trackStyle={StyleSheet.flatten([
              sliderStyles.trackStyle,
              { backgroundColor: 'transparent' },
            ])}
            minimumTrackTintColor="transparent"
            maximumTrackTintColor="transparent"
            onSlidingComplete={onSlidingComplete}
            onValueChange={onValueChange}
            renderThumbComponent={() => {
              const isStart = thumbIndexRef.current === 0;
              thumbIndexRef.current = (thumbIndexRef.current + 1) % 2;
              return isStart ? (
                <StartThumb color={thumbColor} />
              ) : (
                <EndThumb color={thumbColor} />
              );
            }}
          />
        </View>
      </View>
    </View>
  );
}

export default Slider;
