import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '../../../theme';

const ICON_VISUAL_SIZE = 88;
const ICON_VIEWBOX = 24;

const PATH_PLAY =
  'M11.28 2.024c-2.109.185-3.979.926-5.561 2.201-1.675 1.351-2.908 3.28-3.416 5.346-.216.881-.277 1.41-.277 2.429s.061 1.548.277 2.429c.886 3.607 3.839 6.502 7.457 7.311.844.189 1.287.236 2.24.236.953 0 1.396-.047 2.24-.236 3.618-.809 6.571-3.704 7.457-7.311.213-.869.276-1.413.278-2.409.001-.976-.043-1.404-.235-2.26-.458-2.049-1.658-4.025-3.26-5.369-1.824-1.531-3.915-2.321-6.26-2.368a15.89 15.89 0 0 0-.94.001m-.216 5.656c.648.164 3.19 1.553 4.376 2.392.775.549 1.121 1.096 1.12 1.777-.002.784-.366 1.323-1.325 1.959-1.439.955-3.556 2.102-4.166 2.258-.921.234-1.814-.16-2.193-.966-.266-.566-.325-1.157-.324-3.26.002-2.497.099-3.063.628-3.632.504-.543 1.13-.718 1.884-.528';

const PATH_PAUSE =
  'M11.28 2.024c-2.109.185-3.979.926-5.561 2.201-1.675 1.351-2.908 3.28-3.416 5.346-.216.881-.277 1.41-.277 2.429s.061 1.548.277 2.429c.886 3.607 3.839 6.502 7.457 7.311.844.189 1.287.236 2.24.236.953 0 1.396-.047 2.24-.236 3.618-.809 6.571-3.704 7.457-7.311.213-.869.276-1.413.278-2.409.001-.976-.043-1.404-.235-2.26-.458-2.049-1.658-4.025-3.26-5.369-1.824-1.531-3.915-2.321-6.26-2.368a15.89 15.89 0 0 0-.94.001m-.94 6.042c.115.039.263.135.361.233.312.311.299.157.299 3.701 0 3.546.013 3.389-.3 3.702a.987.987 0 0 1-1.169.172 1.06 1.06 0 0 1-.491-.593c-.028-.105-.038-1.216-.031-3.369L9.02 8.7l.111-.189a.987.987 0 0 1 1.209-.445m4 0c.115.039.263.135.361.233.312.311.299.157.299 3.701 0 3.546.013 3.389-.3 3.702a.987.987 0 0 1-1.169.172 1.06 1.06 0 0 1-.491-.593c-.028-.105-.038-1.216-.031-3.369L13.02 8.7l.111-.189a.987.987 0 0 1 1.209-.445';

const ICON_FILL = Colors.neutral[50];

export interface VideoPlayPauseIndicatorProps {
  iconVariantSV: SharedValue<number>;
  scaleSV: SharedValue<number>;
  opacitySV: SharedValue<number>;
  screenWidth: number;
  cardHeight: number;
}

export const VideoPlayPauseIndicator = memo(function VideoPlayPauseIndicator({
  iconVariantSV,
  scaleSV,
  opacitySV,
  screenWidth,
  cardHeight,
}: VideoPlayPauseIndicatorProps) {
  const rootStyle = useAnimatedStyle(() => ({
    opacity: opacitySV.value,
    transform: [{ scale: scaleSV.value }],
  }));

  const playGlyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(iconVariantSV.value, [0, 1], [1, 0]),
  }));

  const pauseGlyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(iconVariantSV.value, [0, 1], [0, 1]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.centered,
        {
          left: (screenWidth - ICON_VISUAL_SIZE) / 2,
          top: (cardHeight - ICON_VISUAL_SIZE) / 2,
        },
        rootStyle,
      ]}
    >
      <Animated.View style={[styles.glyphLayer, playGlyphStyle]}>
        <Svg
          width={ICON_VISUAL_SIZE}
          height={ICON_VISUAL_SIZE}
          viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
        >
          <Path d={PATH_PLAY} fill={ICON_FILL} fillRule="evenodd" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.glyphLayer, pauseGlyphStyle]}>
        <Svg
          width={ICON_VISUAL_SIZE}
          height={ICON_VISUAL_SIZE}
          viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
        >
          <Path d={PATH_PAUSE} fill={ICON_FILL} fillRule="evenodd" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  centered: {
    position: 'absolute',
    width: ICON_VISUAL_SIZE,
    height: ICON_VISUAL_SIZE,
    zIndex: 14,
  },
  glyphLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
