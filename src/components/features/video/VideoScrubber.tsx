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
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnUI, scheduleOnRN } from 'react-native-worklets';
import { type VideoPlayer } from 'expo-video';
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
const SCRUBBER_TRACK_CONTAINER_HEIGHT = 34;
const SCRUBBER_BAR_HEIGHT_RANGE_PX = 5;
const SCRUBBER_BAR_BASE_OPACITY = 0.72;
const SCRUBBER_TRACK_OPACITY = 0.45;

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

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Reset local UI state only - never affects player or playback
  useEffect(() => {
    if (!active) {
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
      scheduleOnUI(() => {
        'worklet';
        currentTimeSV.set(0);
        seekProgressSV.set(0);
      });
      playerRef.current = player;
    }
  }, [player, currentTimeSV, seekProgressSV]);

  // Sync duration when player becomes ready — HLS duration isn't known until manifest loads.
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

    syncDuration(player.duration);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') syncDuration(player.duration);
    });
    return () => sub.remove();
  }, [player, active, duration, durationSV]);

  // Enable timeUpdate events only while the scrubber is active so we don't pay bridge traffic
  // on every feed player. VideoCard initialises timeUpdateEventInterval=0; we set it here.
  useEffect(() => {
    if (!player) return;
    // expo-video player is an imperative SDK handle; this is its documented configuration API.
    player.timeUpdateEventInterval = active ? SCRUBBER_TIME_UPDATE_INTERVAL_SECONDS : 0;
  }, [player, active]);

  // Sync playback position via native timeUpdate events (fired at 4fps when scrubber active).
  // Animate between ticks with withTiming so the bar moves smoothly at display frame rate.
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

  // Faster seeking during user drag.
  const enableScrubbingMode = useCallback(() => {
    if (!player) return;
    try {
      player.scrubbingModeOptions = { scrubbingModeEnabled: true };
    } catch (_error) {
      // Silently ignore - scrubber never blocks
    }
  }, [player]);

  const disableScrubbingMode = useCallback(() => {
    if (!player) return;
    try {
      player.scrubbingModeOptions = { scrubbingModeEnabled: false };
    } catch (_error) {
      // Silently ignore - scrubber never blocks
    }
  }, [player]);

  // Non-blocking seek - never interferes with playback state.
  // expo-video's currentTime setter is already non-blocking.
  const seekTo = useCallback(
    (time: number) => {
      if (!player) return;
      try {
        // expo-video player is an imperative SDK handle; assigning currentTime is the
        // documented seek API. Not a React-managed value.
        player.currentTime = time;

        scheduleOnUI(() => {
          'worklet';
          currentTimeSV.set(time);
        });

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

  // Lightweight gesture handler — purely UI, never blocks or interferes with playback.
  const scrubPanGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .onStart(() => {
        'worklet';
        scheduleOnRN(enableScrubbingMode);
        seekProgressSV.set(currentTimeSV.get());
        isSeekingSV.set(true);
        seekingAnimationSV.set(withTiming(1, { duration: 500 }));
      })
      .onUpdate(evt => {
        'worklet';
        const progress = evt.x / screenWidth;
        const dur = durationSV.get();
        seekProgressSV.set(clamp(progress * dur, 0, dur));
      })
      .onEnd(evt => {
        'worklet';
        const progress = evt.x / screenWidth;
        const dur = durationSV.get();
        const newTime = clamp(progress * dur, 0, dur);

        seekProgressSV.set(newTime);
        currentTimeSV.set(newTime);

        scheduleOnRN(disableScrubbingMode);
        scheduleOnRN(seekTo, newTime);
      });

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

  // Time label sits above the track and fades in once seekingAnimationSV crosses 0.3.
  const timeStyle = useAnimatedStyle(() => {
    const seekingValue = seekingAnimationSV.get();
    const threshold = 0.3;
    const opacity = seekingValue < threshold ? 0 : (seekingValue - threshold) / (1 - threshold);
    return {
      display: seekingValue === 0 ? ('none' as const) : ('flex' as const),
      opacity,
    };
  });

  // Track + bar styles. Two thin Animated.Views replace the previous Skia Canvas + Rects:
  //   - Track: full-width white bar at 45% opacity (background scrubber line).
  //   - Bar  : the leading-edge progress, anchored at the left, scaled by playback position.
  // Width-by-screenWidth and absolute positioning means height changes don't reflow siblings
  // (the parent's height is fixed at 34), so the only per-frame work is style mutation —
  // no Skia GPU surface, no extra render pass on every visible card.
  const trackContainerStyle = useAnimatedStyle(() => {
    const seekingAnim = seekingAnimationSV.get();
    const containerOpacity = overlayOpacitySV.value;
    return {
      opacity: seekingAnim > 0 ? Math.max(containerOpacity, 0.95) : Math.max(containerOpacity, 0.1),
    };
  });

  const trackBarStyle = useAnimatedStyle(() => {
    const seekingAnim = seekingAnimationSV.get();
    return {
      height: seekingAnim * SCRUBBER_BAR_HEIGHT_RANGE_PX + SCRUBBER_BAR_HEIGHT,
    };
  });

  const progressBarStyle = useAnimatedStyle(() => {
    const isSeeking = isSeekingSV.get();
    const seekingAnim = seekingAnimationSV.get();
    const dur = durationSV.get();
    const currentTime = isSeeking ? seekProgressSV.get() : currentTimeSV.get();
    const ratio = dur === 0 ? 0 : clamp(currentTime / dur, 0, 1);
    return {
      width: ratio * screenWidth,
      height: seekingAnim * SCRUBBER_BAR_HEIGHT_RANGE_PX + SCRUBBER_BAR_HEIGHT,
      opacity: interpolate(seekingAnim, [0, 1], [SCRUBBER_BAR_BASE_OPACITY, 1]),
    };
  });

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

  const composedTimeStyle = useMemo(
    () => StyleSheet.compose(styles.timeContainer, timeStyle),
    [timeStyle]
  );
  const composedTrackContainerStyle = useMemo(
    () => StyleSheet.compose(styles.trackContainer, trackContainerStyle),
    [trackContainerStyle]
  );
  const composedTrackBarStyle = useMemo(
    () => StyleSheet.compose(styles.trackBar, trackBarStyle),
    [trackBarStyle]
  );
  const composedProgressBarStyle = useMemo(
    () => StyleSheet.compose(styles.progressBar, progressBarStyle),
    [progressBarStyle]
  );

  return (
    <>
      <Animated.View style={composedTimeStyle} pointerEvents="none">
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
          <Animated.View
            style={composedTrackContainerStyle}
            pointerEvents={active ? 'auto' : 'none'}
          >
            <Animated.View style={composedTrackBarStyle} pointerEvents="none" />
            <Animated.View style={composedProgressBarStyle} pointerEvents="none" />
          </Animated.View>
          <Animated.View style={childrenContainerStyle}>{children}</Animated.View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

function VideoScrubberShell(props: VideoScrubberProps) {
  // The Skia rewrite removes the GPU-surface cost, but we keep the iOS gating to preserve
  // the existing UX (Android cards have always shipped without an overlay scrubber). Lifting
  // the gate is a separate UX decision that belongs in its own change.
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
  timeContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    left: 0,
    right: 0,
    bottom: SCRUBBER_TOTAL_HEIGHT + 5,
  },
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
  trackContainer: {
    width: '100%',
    paddingTop: SCRUBBER_TOUCH_AREA_HEIGHT,
    height: SCRUBBER_TRACK_CONTAINER_HEIGHT,
    position: 'relative',
  },
  trackBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neutral[50],
    opacity: SCRUBBER_TRACK_OPACITY,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    backgroundColor: Colors.neutral[50],
  },
});
