import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

// Import all frame images
const frames = [
  require('../../assets/tv-static-no-signal/frame_000_no_bg_oi3g3rcw.png'),
  require('../../assets/tv-static-no-signal/frame_001_no_bg_k3omvr2t.png'),
  require('../../assets/tv-static-no-signal/frame_002_no_bg_ia9n7gi1.png'),
  require('../../assets/tv-static-no-signal/frame_003_no_bg_puoiwils.png'),
  require('../../assets/tv-static-no-signal/frame_004_no_bg_5ow7jorg.png'),
  require('../../assets/tv-static-no-signal/frame_005_no_bg_xhdiekvk.png'),
  require('../../assets/tv-static-no-signal/frame_006_no_bg_jcrwowf7.png'),
  require('../../assets/tv-static-no-signal/frame_007_no_bg_yr7478pe.png'),
  require('../../assets/tv-static-no-signal/frame_008_no_bg_dybh0etj.png'),
  require('../../assets/tv-static-no-signal/frame_009_no_bg_vc1cic96.png'),
  require('../../assets/tv-static-no-signal/frame_010_no_bg_6x3w6x02.png'),
  require('../../assets/tv-static-no-signal/frame_011_no_bg_otm2zv8s.png'),
  require('../../assets/tv-static-no-signal/frame_012_no_bg_2145ydjt.png'),
  require('../../assets/tv-static-no-signal/frame_013_no_bg_8u9711iu.png'),
  require('../../assets/tv-static-no-signal/frame_014_no_bg_stv9i9pc.png'),
  require('../../assets/tv-static-no-signal/frame_015_no_bg_x3a5hqna.png'),
  require('../../assets/tv-static-no-signal/frame_016_no_bg_9093uu57.png'),
  require('../../assets/tv-static-no-signal/frame_017_no_bg_0yhwy1k8.png'),
  require('../../assets/tv-static-no-signal/frame_018_no_bg_p0r2klwb.png'),
  require('../../assets/tv-static-no-signal/frame_019_no_bg_iq28wjqb.png'),
  require('../../assets/tv-static-no-signal/frame_020_no_bg_8q13lzl8.png'),
  require('../../assets/tv-static-no-signal/frame_021_no_bg_6zxremup.png'),
  require('../../assets/tv-static-no-signal/frame_022_no_bg_x1c434ww.png'),
  require('../../assets/tv-static-no-signal/frame_023_no_bg_iy48dxc5.png'),
  require('../../assets/tv-static-no-signal/frame_024_no_bg_m64699io.png'),
];

const TOTAL_FRAMES = frames.length;
const FRAME_DURATION = 40; // milliseconds per frame (~25fps)

interface AnimatedTVStaticProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
}

const AnimatedTVStatic: React.FC<AnimatedTVStaticProps> = ({
  size = 72,
  style,
  autoPlay = true,
}) => {
  const frameIndex = useSharedValue(0);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  useEffect(() => {
    if (!autoPlay) return;

    // Create animation that cycles through frames
    frameIndex.value = withRepeat(
      withSequence(
        ...Array.from({ length: TOTAL_FRAMES }, (_, i) =>
          withTiming(i, {
            duration: FRAME_DURATION,
            easing: Easing.linear,
          })
        )
      ),
      -1, // infinite repeat
      false // don't reverse
    );
  }, [autoPlay, frameIndex]);

  // Sync animated value to React state using useAnimatedReaction
  useAnimatedReaction(
    () => Math.round(frameIndex.value) % TOTAL_FRAMES,
    currentIndex => {
      runOnJS(setCurrentFrameIndex)(currentIndex);
    },
    [frameIndex]
  );

  const currentFrame = frames[currentFrameIndex];

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Animated.View style={[styles.container, { width: size, height: size }]}>
        <Image
          source={currentFrame}
          style={[styles.image, { width: size, height: size }]}
          contentFit="contain"
          cachePolicy="memory-disk"
          priority="low"
          allowDownscaling={true}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default AnimatedTVStatic;
