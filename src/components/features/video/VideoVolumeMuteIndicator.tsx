import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '../../../theme';

const ICON_VISUAL_SIZE = 88;
const ICON_VIEWBOX = 24;

/** MGC Icon System Pro — cute filled `volume_cute_fi` (viewBox 0 0 24 24). */
const PATH_VOLUME =
  'M12.1 2.866c-.556.118-1.322.561-2.32 1.341-.242.189-1.151.913-2.02 1.608-1.987 1.59-2.042 1.62-3.18 1.702-.806.058-1.288.21-1.876.591a3.759 3.759 0 0 0-1.346 1.547c-.321.684-.335.784-.335 2.345 0 1.561.014 1.661.335 2.345.295.631.77 1.175 1.354 1.553.587.379 1.056.526 1.868.585.633.046.929.111 1.292.283.17.081.838.587 2.06 1.563 2.136 1.704 2.287 1.821 2.817 2.168 1.161.76 1.998.888 2.857.437.388-.204.719-.568.937-1.032.335-.715.446-1.403.635-3.942a54.53 54.53 0 0 0 0-7.9c-.185-2.534-.299-3.245-.635-3.962-.463-.986-1.393-1.455-2.443-1.232m6.673 3.69c-.209.054-.472.23-.583.391-.203.295-.239.725-.086 1.021.036.07.231.299.432.51.726.759 1.085 1.404 1.335 2.4.095.377.106.497.106 1.122 0 .628-.011.744-.108 1.131-.25.995-.694 1.772-1.41 2.469a2.006 2.006 0 0 0-.363.46c-.403.848.509 1.726 1.348 1.298.483-.246 1.355-1.317 1.806-2.218a7.03 7.03 0 0 0-.385-6.954c-.41-.636-1.088-1.374-1.412-1.539-.187-.096-.497-.137-.68-.091m-2.1 2.265c-.414.132-.713.614-.66 1.064.031.257.105.389.408.719.609.663.743 1.48.374 2.264a2.618 2.618 0 0 1-.374.528c-.316.344-.384.472-.411.77-.064.712.621 1.243 1.311 1.014.402-.134.95-.772 1.303-1.517.261-.553.35-.966.353-1.643.003-.814-.154-1.407-.547-2.06-.578-.96-1.152-1.333-1.757-1.139';

/** MGC Icon System Pro — cute filled `volume_mute_cute_fi` (viewBox 0 0 24 24). */
const PATH_VOLUME_MUTE =
  'M12.053 2.876a4.036 4.036 0 0 0-.625.233c-.646.31-1.149.684-4.094 3.038-1.54 1.232-1.657 1.291-2.754 1.37-.812.059-1.281.206-1.868.585a3.787 3.787 0 0 0-1.35 1.541c-.322.673-.339.793-.339 2.357 0 1.561.014 1.661.335 2.345a3.76 3.76 0 0 0 2.382 2.019c.155.043.53.097.84.119.308.022.668.068.8.101.512.13.728.28 2.78 1.919 1.089.87 2.205 1.733 2.48 1.918 1.242.833 2.08.979 2.966.513.388-.204.719-.568.937-1.032.336-.717.45-1.428.635-3.962a54.53 54.53 0 0 0 0-7.9c-.189-2.539-.3-3.227-.635-3.942-.47-1-1.445-1.478-2.49-1.222m4.497 6.059a1.004 1.004 0 0 0-.609 1.27c.063.192.154.299.853 1.006l.783.791-.745.749c-.467.47-.778.816-.834.929-.187.372-.093.865.217 1.152a.932.932 0 0 0 .705.262c.353-.003.505-.109 1.33-.928l.751-.744.749.745c.471.468.817.779.93.835.372.187.865.093 1.152-.217a.932.932 0 0 0 .262-.705c-.003-.353-.109-.505-.927-1.33l-.743-.749.782-.791c.699-.706.79-.813.853-1.005a.99.99 0 0 0-1.044-1.313 1.192 1.192 0 0 0-.34.089c-.074.038-.481.412-.905.832l-.77.764-.77-.764c-.424-.42-.832-.795-.908-.834-.184-.093-.581-.116-.772-.044';

const ICON_FILL = Colors.neutral[50];

export interface VideoVolumeMuteIndicatorProps {
  /** 0 = "sound on" glyph, 1 = "muted" glyph (crossfade between the two paths). */
  iconVariantSV: SharedValue<number>;
  scaleSV: SharedValue<number>;
  opacitySV: SharedValue<number>;
  screenWidth: number;
  cardHeight: number;
}

/**
 * Flash feedback for tap-to-mute (per {@link VideoCard} / per {@link useVideoPlayer} instance).
 * Static SVG paths, opacity + scale animated on the UI thread.
 */
export const VideoVolumeMuteIndicator = memo(function VideoVolumeMuteIndicator({
  iconVariantSV,
  scaleSV,
  opacitySV,
  screenWidth,
  cardHeight,
}: VideoVolumeMuteIndicatorProps) {
  const rootStyle = useAnimatedStyle(() => ({
    opacity: opacitySV.value,
    transform: [{ scale: scaleSV.value }],
  }));

  const volumeGlyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(iconVariantSV.value, [0, 1], [1, 0]),
  }));

  const muteGlyphStyle = useAnimatedStyle(() => ({
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
      <Animated.View style={[styles.glyphLayer, volumeGlyphStyle]}>
        <Svg
          width={ICON_VISUAL_SIZE}
          height={ICON_VISUAL_SIZE}
          viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
        >
          <Path d={PATH_VOLUME} fill={ICON_FILL} fillRule="evenodd" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.glyphLayer, muteGlyphStyle]}>
        <Svg
          width={ICON_VISUAL_SIZE}
          height={ICON_VISUAL_SIZE}
          viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
        >
          <Path d={PATH_VOLUME_MUTE} fill={ICON_FILL} fillRule="evenodd" />
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
