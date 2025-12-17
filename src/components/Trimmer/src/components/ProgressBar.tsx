import { View, type ViewStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { progressBarStyles } from './styles';
import type { FrameInfo } from '../utils/frameExtractor';

interface ProgressBarProps {
  value: number;
  style?: StyleProp<ViewStyle>;
  tintColor: string | undefined;
  frames?: FrameInfo[];
  duration?: number;
  startPercent?: SharedValue<number>;
  endPercent?: SharedValue<number>;
}

function ProgressBar({ value, style, tintColor, frames = [], duration, startPercent, endPercent }: ProgressBarProps) {
  const hasFrames = frames.length > 0 && duration && duration > 0;

  // Animated styles for overlays using shared values
  const leftOverlayStyle = useAnimatedStyle(() => {
    if (!startPercent) return { width: 0 };
    const percent = startPercent.value;
    return {
      left: 0,
      width: `${Math.max(0, percent)}%`,
    };
  });

  const rightOverlayStyle = useAnimatedStyle(() => {
    if (!endPercent) return { width: 0 };
    const percent = endPercent.value;
    return {
      left: `${Math.min(100, percent)}%`,
      width: `${Math.max(0, 100 - percent)}%`,
    };
  });

  // Combined shadow style using same shared values as overlays
  const shadowStyle = useAnimatedStyle(() => {
    if (!startPercent || !endPercent) return { width: 0, left: 0 };
    const start = startPercent.value;
    const end = endPercent.value;
    return {
      left: `${Math.max(0, start)}%`,
      width: `${Math.max(0, end - start)}%`,
    };
  });

  return (
    <View style={[progressBarStyles.container, style]}>
      {hasFrames ? (
        <View style={progressBarStyles.framesContainer}>
          {frames.map((frame, index) => {
            // Calculate width and position for each frame to fill the entire bar
            const frameWidth = 100 / frames.length;
            const frameLeft = (index / frames.length) * 100;
            
            return (
              <Image
                key={`frame-${index}-${frame.time}`}
                source={{ uri: frame.uri }}
                style={[
                  progressBarStyles.frame,
                  {
                    left: `${frameLeft}%`,
                    width: `${frameWidth}%`,
                  },
                ]}
                contentFit="cover"
              />
            );
          })}
          {/* Shadow - uses same shared values, moves with selection */}
          {startPercent && endPercent && (
            <Animated.View style={[progressBarStyles.shadowWrapper, shadowStyle]} />
          )}
          {/* Left overlay - darkens area before selection */}
          {startPercent && (
            <Animated.View
              style={[
                progressBarStyles.darkOverlay,
                leftOverlayStyle,
              ]}
            />
          )}
          {/* Right overlay - darkens area after selection */}
          {endPercent && (
            <Animated.View
              style={[
                progressBarStyles.darkOverlay,
                rightOverlayStyle,
              ]}
            />
          )}
        </View>
      ) : null}
      <View
        style={[
          progressBarStyles.progress,
          { width: `${Math.ceil(100 * value)}%`, backgroundColor: tintColor },
        ]}
      />
    </View>
  );
}

export default ProgressBar;
