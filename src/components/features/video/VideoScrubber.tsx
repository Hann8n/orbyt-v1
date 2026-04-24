import { useCallback, useEffect, memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnUI, scheduleOnRN } from 'react-native-worklets';
import { type VideoPlayer } from 'expo-video';
import { Canvas, Rect } from '@shopify/react-native-skia';
import { formatTime } from '../../../utils/formatting/time';
import { Colors } from '../../../theme';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useUIStore } from '../../../stores/uiStore';
import { FontFamily, Typography } from '../../../utils/components/typography';

interface VideoScrubberProps {
  active: boolean;
  player?: VideoPlayer;
  seekingAnimationSV: SharedValue<number>;
  scrollGesture?: NativeGesture;
  children?: ReactNode;
  /** Composed opacity from VideoCard (scroll overlap × scrubbing). */
  overlayOpacitySV: SharedValue<number>;
}

const SCRUBBER_TIME_UPDATE_INTERVAL_SECONDS = 0.1;
const SCRUBBER_INTERPOLATION_DURATION_MS = 100;
const SCRUBBER_BAR_HEIGHT = 3;
const SCRUBBER_TOUCH_AREA_HEIGHT = 32;
const SCRUBBER_TOTAL_HEIGHT = SCRUBBER_TOUCH_AREA_HEIGHT + SCRUBBER_BAR_HEIGHT;

function VideoScrubberActive({
  active,
  player,
  seekingAnimationSV,
  scrollGesture,
  children,
  overlayOpacitySV,
}: VideoScrubberProps) {
  const deviceLayout = useDeviceLayout();
  const screenWidth = deviceLayout.screenWidth;

  const setScrubbingState = useUIStore(state => state.setVisibility);
  const currentTimeSV = useSharedValue(0);
  const durationSV = useSharedValue(0);
  const [currentSeekTime, setCurrentSeekTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const isSeekingSV = useSharedValue(false);
  const seekProgressSV = useSharedValue(0);
  const playerRef = useRef(player);
  const activeRef = useRef(active);

  // Track active state for visibility reset
  activeRef.current = active;

  // Reset local UI state only - never affects player or playback
  useEffect(() => {
    if (!active) {
      // Only reset local UI state - never touches player
      scheduleOnUI(() => {
        'worklet';
        isSeekingSV.set(false);
        currentTimeSV.set(0);
        seekProgressSV.set(0);
        seekingAnimationSV.set(0);
      });
    } else if (active && player) {
      // Read-only sync - never affects playback
      try {
        const currentTime = player.currentTime;
        if (currentTime > 0) {
          scheduleOnUI(() => {
            'worklet';
            currentTimeSV.set(currentTime);
          });
        }
      } catch (_error) {
        // Silently ignore - scrubber never blocks
      }
    }
  }, [active, player, isSeekingSV, currentTimeSV, seekProgressSV, seekingAnimationSV]);

  // Reset local UI state when player changes - never affects player
  useEffect(() => {
    if (player !== playerRef.current) {
      // Only reset local UI state - never touches player
      scheduleOnUI(() => {
        'worklet';
        currentTimeSV.set(0);
        seekProgressSV.set(0);
      });
      playerRef.current = player;
    }
  }, [player, currentTimeSV, seekProgressSV]);

  // Sync duration when player becomes ready — HLS duration isn't known until manifest loads
  useEffect(() => {
    if (!player || !active) return;

    const syncDuration = (d: number) => {
      if (d > 0 && d !== duration) {
        setDuration(Math.round(d));
        scheduleOnUI(() => {
          'worklet';
          durationSV.set(d);
        });
      }
    };

    // Check immediately (may already be ready)
    syncDuration(player.duration);

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') syncDuration(player.duration);
    });

    return () => sub.remove();
  }, [player, active, duration, durationSV]);

  // Enable timeUpdate events only while the scrubber is active to avoid bridge traffic on all
  // feed players. VideoCard initialises timeUpdateEventInterval=0; we set it here when needed.
  useEffect(() => {
    if (!player) return;
    player.timeUpdateEventInterval = active ? SCRUBBER_TIME_UPDATE_INTERVAL_SECONDS : 0;
  }, [player, active]);

  // Sync playback position via native timeUpdate events (fired at 4fps when scrubber active).
  // Animate between ticks with withTiming so the Skia bar moves smoothly at display frame rate.
  useEffect(() => {
    if (!player || !active) return;

    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!isSeekingSV.get()) {
        scheduleOnUI(() => {
          'worklet';
          currentTimeSV.set(
            withTiming(currentTime, {
              duration: SCRUBBER_INTERPOLATION_DURATION_MS,
              easing: Easing.linear,
            })
          );
        });
      }
    });

    return () => sub.remove();
  }, [player, active, isSeekingSV, currentTimeSV]);

  // Sync seekingAnimationSV to UI store using same threshold as overlay (0.2)
  useAnimatedReaction(
    () => seekingAnimationSV.get() >= 0.2,
    (isScrubbing, prevIsScrubbing) => {
      if (prevIsScrubbing === null || isScrubbing !== prevIsScrubbing) {
        scheduleOnRN(setScrubbingState, 'videoScrubbing', isScrubbing);
      }
    }
  );

  // Update current time display from shared value (for both seeking and normal playback).
  // Only call setCurrentSeekTime when scrubber is visible (seekingAnimationSV >= 0.2) to avoid
  // rerenders during normal playback while scrolling—the time label is hidden when scrubber is hidden.
  useAnimatedReaction(
    () => {
      const isSeeking = isSeekingSV.get();
      const time = isSeeking ? Math.round(seekProgressSV.get()) : Math.round(currentTimeSV.get());
      const seekingAnim = seekingAnimationSV.get();
      return [time, seekingAnim] as const;
    },
    ([time, seekingAnim], prev) => {
      const prevTime = prev?.[0];
      if (time !== prevTime && time >= 0 && seekingAnim >= 0.2) {
        scheduleOnRN(setCurrentSeekTime, time);
      }
    }
  );

  // Enable scrubbing mode for faster seeking during user interaction
  const enableScrubbingMode = useCallback(() => {
    if (!player) return;
    try {
      player.scrubbingModeOptions = { scrubbingModeEnabled: true };
    } catch (_error) {
      // Silently ignore - scrubber never blocks
    }
  }, [player]);

  // Disable scrubbing mode after user interaction ends
  const disableScrubbingMode = useCallback(() => {
    if (!player) return;
    try {
      player.scrubbingModeOptions = { scrubbingModeEnabled: false };
    } catch (_error) {
      // Silently ignore - scrubber never blocks
    }
  }, [player]);

  // Non-blocking seek - never interferes with playback state
  // expo-video's currentTime setter is already non-blocking
  const seekTo = useCallback(
    (time: number) => {
      if (!player) return;

      try {
        // expo-video's currentTime setter handles seeking internally with seekTolerance
        player.currentTime = time;

        // Update local UI state immediately (non-blocking)
        scheduleOnUI(() => {
          'worklet';
          currentTimeSV.set(time);
        });

        // Clear seeking state after brief delay (non-blocking)
        setTimeout(() => {
          scheduleOnUI(() => {
            'worklet';
            isSeekingSV.set(false);
            seekingAnimationSV.set(withTiming(0, { duration: 500 }));
          });
        }, 50);
      } catch (_error) {
        // Silently ignore - scrubber never blocks or interferes with playback
      }
    },
    [player, isSeekingSV, seekingAnimationSV, currentTimeSV]
  );

  // Lightweight gesture handler - purely UI, never blocks or interferes with playback
  const scrubPanGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .onStart(() => {
        'worklet';
        // Enable scrubbing mode for faster seeking during gesture
        scheduleOnRN(enableScrubbingMode);
        // Only update local UI state - never affects playback
        seekProgressSV.set(currentTimeSV.get());
        isSeekingSV.set(true);
        seekingAnimationSV.set(withTiming(1, { duration: 500 }));
      })
      .onUpdate(evt => {
        'worklet';
        // Pure UI calculation - never touches player
        const progress = evt.x / screenWidth;
        const duration = durationSV.get();
        seekProgressSV.set(clamp(progress * duration, 0, duration));
      })
      .onEnd(evt => {
        'worklet';
        // Calculate final position (UI only)
        const progress = evt.x / screenWidth;
        const duration = durationSV.get();
        const newTime = clamp(progress * duration, 0, duration);

        // Update local UI state immediately
        seekProgressSV.set(newTime);
        currentTimeSV.set(newTime);

        // Disable scrubbing mode before seeking (per plan: disable in onEnd, then seek)
        scheduleOnRN(disableScrubbingMode);
        // Non-blocking seek - fire and forget, never blocks playback
        scheduleOnRN(seekTo, newTime);
      });

    // Don't block scroll - scrubber is non-primary
    if (scrollGesture) {
      gesture.blocksExternalGesture(scrollGesture);
    }

    return gesture.enabled(active);
  }, [
    active,
    scrollGesture,
    seekingAnimationSV,
    screenWidth,
    durationSV,
    isSeekingSV,
    seekProgressSV,
    seekTo,
    currentTimeSV,
    enableScrubbingMode,
    disableScrubbingMode,
  ]);

  const timeStyle = useAnimatedStyle(() => {
    const seekingValue = seekingAnimationSV.get();
    const threshold = 0.3;
    const opacity = seekingValue < threshold ? 0 : (seekingValue - threshold) / (1 - threshold);
    return {
      position: 'absolute' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 20,
      left: 0,
      right: 0,
      bottom: SCRUBBER_TOTAL_HEIGHT + 5,
      display: seekingValue === 0 ? ('none' as const) : ('flex' as const),
      opacity,
    };
  });

  const progressWidthSV = useDerivedValue(() => {
    const isSeeking = isSeekingSV.get();
    const duration = durationSV.get();
    if (duration === 0) return 0;
    const currentTime = isSeeking ? seekProgressSV.get() : currentTimeSV.get();
    return (currentTime / duration) * screenWidth;
  });

  const barHeightSV = useDerivedValue(() => {
    const seekingAnim = seekingAnimationSV.get();
    return seekingAnim * 5 + 3;
  });

  const barOpacitySV = useDerivedValue(() => {
    const seekingAnim = seekingAnimationSV.get();
    return interpolate(seekingAnim, [0, 1], [0.72, 1]);
  });

  const trackHeightSV = useDerivedValue(() => {
    return seekingAnimationSV.get() * 5 + 3;
  });

  const trackY = useDerivedValue(() => 34 - trackHeightSV.value);
  const barY = useDerivedValue(() => 34 - barHeightSV.value);

  // Unmount cleanup: clear scrubbing chrome + global flag (parent owns seekingAnimationSV).
  useEffect(() => {
    return () => {
      scheduleOnUI(() => {
        'worklet';
        isSeekingSV.set(false);
        currentTimeSV.set(0);
        seekProgressSV.set(0);
        seekingAnimationSV.set(0);
      });
      useUIStore.getState().setVisibility('videoScrubbing', false);
    };
  }, [seekingAnimationSV, isSeekingSV, currentTimeSV, seekProgressSV]);

  const childrenContainerStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacitySV.value,
  }));

  const trackContainerStyle = useAnimatedStyle(() => {
    const seekingAnim = seekingAnimationSV.get();
    const containerOpacity = overlayOpacitySV.value;
    return {
      width: '100%' as const,
      position: 'relative' as const,
      paddingTop: 32,
      height: 34,
      opacity: seekingAnim > 0 ? Math.max(containerOpacity, 0.95) : Math.max(containerOpacity, 0.1),
    };
  });

  // Card bottom matches feed row (already above tab bar); keep scrubber flush to card bottom.

  return (
    <>
      <Animated.View style={timeStyle} pointerEvents="none">
        <Text style={styles.timeText}>
          <Text style={styles.timeTextLarge}>{formatTime(currentSeekTime)}</Text>
          <Text style={styles.timeTextSeparator}>{'  /  '}</Text>
          <Text style={styles.timeTextDuration}>{formatTime(duration)}</Text>
        </Text>
      </Animated.View>

      <GestureDetector gesture={scrubPanGesture}>
        <Animated.View
          style={styles.scrubberContainer}
          pointerEvents={active ? 'box-none' : 'none'}
        >
          <Animated.View style={trackContainerStyle} pointerEvents={active ? 'auto' : 'none'}>
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Rect
                x={0}
                y={trackY}
                width={screenWidth}
                height={trackHeightSV}
                color={Colors.neutral[50]}
                opacity={0.45}
              />
              <Rect
                x={0}
                y={barY}
                width={progressWidthSV}
                height={barHeightSV}
                color={Colors.neutral[50]}
                opacity={barOpacitySV}
              />
            </Canvas>
          </Animated.View>
          <Animated.View style={childrenContainerStyle}>{children}</Animated.View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

function VideoScrubberShell(props: VideoScrubberProps) {
  if (Platform.OS !== 'ios') return null;
  return <VideoScrubberActive {...props} />;
}

export const VideoScrubber = memo(VideoScrubberShell, (prevProps, nextProps) => {
  return (
    prevProps.active === nextProps.active &&
    prevProps.player === nextProps.player &&
    prevProps.seekingAnimationSV === nextProps.seekingAnimationSV &&
    prevProps.scrollGesture === nextProps.scrollGesture &&
    prevProps.overlayOpacitySV === nextProps.overlayOpacitySV &&
    prevProps.children === nextProps.children
  );
});

const styles = StyleSheet.create({
  timeText: {
    textAlign: 'center',
    fontWeight: '600',
    color: Colors.neutral[50],
    fontFamily: FontFamily.semibold,
  },
  timeTextLarge: {
    fontSize: Typography.sizes.display,
    fontVariant: ['tabular-nums'],
    fontFamily: FontFamily.semibold,
  },
  timeTextDuration: {
    fontSize: Typography.sizes.display,
    fontVariant: ['tabular-nums'],
    fontFamily: FontFamily.semibold,
    opacity: 0.8,
  },
  timeTextSeparator: {
    fontSize: Typography.sizes.title,
    opacity: 0.8,
    fontFamily: FontFamily.regular,
  },
  scrubberContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    zIndex: 10,
  },
});
