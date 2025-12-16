import { Text, View, StyleSheet, type ViewStyle } from 'react-native';
import { Slider as RNSlider } from '@miblanchard/react-native-slider';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import ProgressBar from './ProgressBar';
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
  const selectedDuration = parseFloat((thumbs[1] - thumbs[0]).toFixed(1));
  
  return (
    <View style={[sliderStyles.container, style]}>
      <Text style={sliderStyles.text}>
        {selectedDuration}s
      </Text>
      <View style={sliderStyles.sliderWrapper}>
        {/* Frames background - spans entire track */}
        {frames && frames.length > 0 && (
          <View style={sliderStyles.framesBackground}>
            <ProgressBar
              value={0}
              tintColor={tintColor}
              frames={frames}
              duration={duration}
              startPercent={startPercent}
              endPercent={endPercent}
            />
          </View>
        )}
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
          renderMinimumTrackComponent={() => (
            <ProgressBar
              value={(playbackTime - thumbs[0]) / (thumbs[1] - thumbs[0])}
              tintColor={tintColor}
              frames={[]}
              duration={duration}
            />
          )}
          onSlidingComplete={onSlidingComplete}
          onValueChange={onValueChange}
          renderThumbComponent={() => (
            <View style={sliderStyles.thumbStyle}>
              <Text style={sliderStyles.thumbTextStyle}>|</Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

export default Slider;
