import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { BlurView } from '../../ui/BlurView';
import { BORDER_RADIUS } from '../../../utils/constants';
import { Colors } from '../../../theme';
import { hexToRGBA } from '../../../utils/formatting/colors';

/** Total hit area; icon centered on a frosted blur chip (`BlurView` / expo-blur). `GlassView` is not used here — it often does not composite visibly over native video. */
const CONTAINER_SIZE = 72;
const ICON_VISUAL_SIZE = 48;
const ICON_VIEWBOX = 24;

// MGC Icon System Pro — cute filled media (play_cute_fi.svg / pause_cute_fi.svg)
const PATH_PLAY =
  'M7.662 3.444c-.813.11-1.742.639-2.26 1.286-.254.316-.571.949-.697 1.391-.227.795-.29 1.506-.351 3.928-.05 2.028-.005 5.269.087 6.251.152 1.616.473 2.461 1.215 3.204.707.706 1.533 1.056 2.492 1.056 1.077-.001 2.036-.36 4.332-1.62 2.482-1.363 5.041-2.905 5.955-3.59.467-.35 1.027-.882 1.273-1.209a3.598 3.598 0 0 0 .693-2.488c-.131-1.394-.879-2.346-2.856-3.633-1.724-1.122-5.744-3.406-6.958-3.953-1.191-.536-2.116-.733-2.925-.623';

const PATH_PAUSE =
  'M7.58 3.047c-.733.14-1.4.821-1.537 1.57-.061.334-.061 14.432 0 14.766.147.802.829 1.456 1.652 1.584 1.051.163 2.073-.553 2.262-1.584.061-.334.061-14.432 0-14.766-.141-.768-.806-1.433-1.574-1.574a2.106 2.106 0 0 0-.803.004m8 0c-.733.14-1.4.821-1.537 1.57-.061.334-.061 14.432 0 14.766.147.802.829 1.456 1.652 1.584 1.051.163 2.073-.553 2.262-1.584.061-.334.061-14.432 0-14.766-.141-.768-.806-1.433-1.574-1.574a2.106 2.106 0 0 0-.803.004';

const ICON_FILL = hexToRGBA(Colors.neutral[50], 0.9);

export interface VideoPlayPauseIndicatorProps {
  iconVariantSV: SharedValue<number>;
  scaleSV: SharedValue<number>;
  opacitySV: SharedValue<number>;
}

export const VideoPlayPauseIndicator = memo(function VideoPlayPauseIndicator({
  iconVariantSV,
  scaleSV,
  opacitySV,
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
    <Animated.View pointerEvents="none" style={[styles.centerInVideo, rootStyle]}>
      <View style={styles.indicatorBox} pointerEvents="none">
        <View style={styles.backdropShell} pointerEvents="none">
          <BlurView intensity={72} tint="dark" style={styles.backdropBlur} />
        </View>
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
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  /** Fills the video layer so the chip is centered in the actual card, not window width. */
  centerInVideo: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 14,
  },
  indicatorBox: {
    width: CONTAINER_SIZE,
    height: CONTAINER_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropShell: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
    shadowColor: Colors.overlay.black50,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  backdropBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
    overflow: 'hidden',
  },
  glyphLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
