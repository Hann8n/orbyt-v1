import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type NativeGesture,
} from 'react-native-gesture-handler';
import Animated, {
  clamp,
  interpolate,
  runOnJS,
  runOnUI,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventListener } from 'expo';
import { type VideoPlayer } from 'expo-video';
import { formatTime } from '../../../utils/helpers';
import { Colors } from '../../ui/UI';
import { useUIStore } from '../../../stores/uiStore';

interface VideoScrubberProps {
  active: boolean;
  player?: VideoPlayer;
  seekingAnimationSV: SharedValue<number>;
  scrollGesture?: NativeGesture;
  children?: React.ReactNode;
}

// Memoize VideoScrubber to prevent unnecessary re-renders when props haven't changed
export const VideoScrubber = React.memo(({
  active,
  player,
  seekingAnimationSV,
  scrollGesture,
  children,
}: VideoScrubberProps) => {
  const { width: screenWidth } = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const setScrubbingState = useUIStore((state) => state.setVisibility);
  const currentTimeSV = useSharedValue(0);
  const durationSV = useSharedValue(0);
  const [currentSeekTime, setCurrentSeekTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const isSeekingSV = useSharedValue(false);
  const seekProgressSV = useSharedValue(0);
  const optimisticTimeSV = useSharedValue(0); // Optimistic seek time (0 means not set)
  const playerRef = useRef(player);

  // Reset optimistic time when player changes or component becomes inactive
  useEffect(() => {
    if (player !== playerRef.current) {
      // Player changed - reset optimistic time
      runOnUI(() => {
        'worklet';
        optimisticTimeSV.set(0);
      })();
      playerRef.current = player;
    }
  }, [player, optimisticTimeSV]);

  // Sync seekingAnimationSV to UI store using same threshold as overlay (0.2)
  useAnimatedReaction(
    () => seekingAnimationSV.value,
    (seekingValue) => {
      'worklet';
      const isScrubbing = seekingValue >= 0.2;
      runOnJS(setScrubbingState)('videoScrubbing', isScrubbing);
    },
  );

  // Reset optimistic time when component becomes inactive
  useEffect(() => {
    if (!active) {
      runOnUI(() => {
        'worklet';
        optimisticTimeSV.set(0);
        isSeekingSV.set(false);
      })();
    }
    // When becoming active, let updateTime handle syncing with actual player time
  }, [active, optimisticTimeSV, isSeekingSV]);

  const updateTime = (currentTime: number, duration: number) => {
    'worklet';
    const isSeeking = isSeekingSV.get();
    const optimisticTime = optimisticTimeSV.get();
    
    if (!isSeeking && optimisticTime > 0) {
      // Check if player time is close to optimistic value (works for both forward and backward)
      const diff = Math.abs(currentTime - optimisticTime);
      if (diff < 0.2) {
        // Player has caught up, use player time and clear optimistic
        currentTimeSV.set(currentTime);
        optimisticTimeSV.set(0);
      }
      // Otherwise keep using optimistic value (don't update currentTimeSV)
    } else {
      // Normal update when not seeking or no optimistic value
      // Always update to ensure progress bar reflects actual player time
      currentTimeSV.set(currentTime);
    }
    
    if (duration !== 0) {
      durationSV.set(duration);
    }
  };

  // Throttle seek time updates to reduce JS thread work
  // Only update when seeking (not during normal playback)
  useAnimatedReaction(
    () => {
      const isSeeking = isSeekingSV.get();
      if (!isSeeking) return -1; // Return sentinel value when not seeking
      return Math.round(seekProgressSV.get());
    },
    (progress, prevProgress) => {
      // Only update if seeking and value changed
      if (progress !== prevProgress && progress >= 0) {
        runOnJS(setCurrentSeekTime)(progress);
      }
    },
  );

  const seekTo = useCallback(
    (time: number) => {
      if (!player) return;
      
      optimisticTimeSV.value = time; // Store optimistic time
      const currentTime = currentTimeSV.value;
      player.seekBy(time - currentTime); // Calculate relative offset

      setTimeout(() => {
        runOnUI(() => {
          'worklet';
          isSeekingSV.set(false);
          seekingAnimationSV.set(withTiming(0, { duration: 500 }));
        })();
      }, 50);
    },
    [player, isSeekingSV, seekingAnimationSV, optimisticTimeSV, currentTimeSV],
  );

  // Memoize gesture to prevent recreation - only recreate when dependencies actually change
  const scrubPanGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-10, 10])
      .onStart(() => {
        'worklet';
        seekProgressSV.set(currentTimeSV.get());
        isSeekingSV.set(true);
        seekingAnimationSV.set(withTiming(1, { duration: 500 }));
      })
      .onUpdate(evt => {
        'worklet';
        const progress = evt.x / screenWidth;
        const duration = durationSV.get();
        // Clamp calculation optimized - avoid multiple get() calls
        seekProgressSV.set(clamp(progress * duration, 0, duration));
      })
      .onEnd(evt => {
        'worklet';
        const progress = evt.x / screenWidth;
        const duration = durationSV.get();
        const newTime = clamp(progress * duration, 0, duration);

        // Optimistically set the progress bar and seek time
        seekProgressSV.set(newTime);
        optimisticTimeSV.set(newTime);

        // Seek to absolute time
        runOnJS(seekTo)(newTime);
      });

    if (scrollGesture) {
      gesture.blocksExternalGesture(scrollGesture);
    }

    return gesture;
  }, [
    scrollGesture,
    seekingAnimationSV,
    screenWidth,
    durationSV,
    isSeekingSV,
    seekProgressSV,
    seekTo,
    optimisticTimeSV,
    currentTimeSV,
  ]);

  // Optimize time style - add worklet directive for better performance
  const timeStyle = useAnimatedStyle(() => {
    'worklet';
    const seekingValue = seekingAnimationSV.get();
    // Fade in faster and fade out slower to avoid clash with overlay
    // Use a threshold so time appears when seeking is active enough
    const threshold = 0.3;
    const opacity = seekingValue < threshold 
      ? 0 
      : (seekingValue - threshold) / (1 - threshold); // Scale from threshold to 1
    return {
      display: seekingValue === 0 ? 'none' : 'flex',
      opacity: opacity,
    };
  });

  // Optimize bar style calculation - cache duration to avoid repeated get() calls
  const barStyle = useAnimatedStyle(() => {
    'worklet';
    const isSeeking = isSeekingSV.get();
    const seekingAnim = seekingAnimationSV.get();
    const duration = durationSV.get();
    
    // Early return for zero duration to avoid division
    if (duration === 0) {
      return {
        height: 3,
        opacity: 0.5,
        width: '0%',
      };
    }
    
    // Use seek progress while actively seeking, otherwise use optimistic time or player time
    const currentTime = isSeeking 
      ? seekProgressSV.get()
      : (optimisticTimeSV.get() || currentTimeSV.get());
    
    const progress = currentTime === 0 ? 0 : currentTime / duration;
    return {
      height: seekingAnim * 5 + 3, // Thicker when seeking (3px base + up to 5px more)
      opacity: interpolate(seekingAnim, [0, 1], [0.5, 0.8]),
      width: `${progress * 100}%`,
    };
  });

  // Optimize track and children styles - add worklet directive
  const trackStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      height: seekingAnimationSV.get() * 5 + 3, // Thicker when seeking
    };
  });

  const childrenStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: 1 - seekingAnimationSV.get(),
    };
  });

  return (
    <>
      {player && active && (
        <PlayerListener
          player={player}
          setDuration={setDuration}
          updateTime={updateTime}
        />
      )}
      <Animated.View
        style={[
          styles.timeContainer,
          {
            left: 0,
            right: 0,
            bottom: insets.bottom + 5, // Moved even lower
          },
          timeStyle,
        ]}
        pointerEvents="none">
        <Text style={styles.timeText}>
          <Text style={styles.timeTextLarge}>
            {formatTime(currentSeekTime)}
          </Text>
          <Text style={styles.timeTextSeparator}>{'  /  '}</Text>
          <Text style={[styles.timeTextLarge, styles.timeTextMuted]}>
            {formatTime(duration)}
          </Text>
        </Text>
      </Animated.View>

      <GestureDetector gesture={scrubPanGesture}>
        <View style={styles.scrubberContainer}>
          <View style={styles.trackContainer}>
            <Animated.View
              style={[
                styles.track,
                { backgroundColor: Colors.white, opacity: 0.2 },
                trackStyle,
              ]}
            />
            <Animated.View
              style={[
                styles.progressBar,
                { backgroundColor: Colors.white },
                barStyle,
              ]}
            />
          </View>
          <Animated.View style={childrenStyle}>
            {children}
          </Animated.View>
        </View>
      </GestureDetector>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if critical props change
  return (
    prevProps.active === nextProps.active &&
    prevProps.player === nextProps.player &&
    prevProps.seekingAnimationSV === nextProps.seekingAnimationSV &&
    prevProps.scrollGesture === nextProps.scrollGesture
  );
});

// Memoized PlayerListener to prevent recreation on every render
const PlayerListener = React.memo(({
  player,
  setDuration,
  updateTime,
}: {
  player: VideoPlayer;
  setDuration: (duration: number) => void;
  updateTime: (currentTime: number, duration: number) => void;
}) => {
  // Throttle duration updates to reduce JS thread work
  const lastDurationRef = useRef(0);
  
  useEventListener(player, 'timeUpdate', evt => {
    const duration = player.duration;
    // Only update duration if it changed significantly (avoid unnecessary setState calls)
    if (duration !== 0 && Math.abs(duration - lastDurationRef.current) > 0.5) {
      lastDurationRef.current = duration;
      setDuration(Math.round(duration));
    }
    // Always update time (runs on UI thread, so it's fast)
    runOnUI(updateTime)(evt.currentTime, duration);
  });

  return null;
});

const styles = StyleSheet.create({
  timeContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    textAlign: 'center',
    fontWeight: '600',
    color: Colors.white,
    fontFamily: 'Firma-SemiBold',
  },
  timeTextLarge: {
    fontSize: 36,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Firma-SemiBold',
  },
  timeTextSeparator: {
    fontSize: 18,
    opacity: 0.8,
    fontFamily: 'Firma-Regular',
  },
  timeTextMuted: {
    opacity: 0.8,
  },
  scrubberContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 10,
  },
  trackContainer: {
    width: '100%',
    position: 'relative',
    paddingTop: 32, // Much larger touchable area above the bar for easier grabbing
    paddingBottom: 0, // No padding below - bar at absolute bottom
    height: 34, // Total height: 32px padding + 2px bar
  },
  track: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 3, // Slightly thicker for better visibility and easier grabbing
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3, // Slightly thicker for better visibility and easier grabbing
    zIndex: 2, // Ensure progress bar is above track
  },
});

