import { useCallback, useEffect, memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  clamp,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnUI, scheduleOnRN } from 'react-native-worklets';
import { useEvent } from 'expo';
import { type VideoPlayer } from 'expo-video';
import { formatTime } from '../../../utils/formatting/time';
import { Colors } from '../../../theme';
import { useFeedLayout } from '../feed/feedViewShared';
import { useUIStore } from '@/stores/uiStore';
import { FontFamily, Typography } from '@/utils/components/typography';
import { OVERLAY_Z_INDEX } from '../../../utils/constants/overlay';

interface VideoScrubberProps {
  active: boolean;
  player?: VideoPlayer;
  seekingAnimationSV: SharedValue<number>;
  children?: ReactNode;
  overlayOpacitySV: SharedValue<number>;
}

const SCRUBBER_TIME_UPDATE_INTERVAL_SECONDS = 0.1;
const SCRUBBER_BAR_HEIGHT = 3;
const SCRUBBER_TOUCH_AREA_HEIGHT = 32;
const SCRUBBER_TOTAL_HEIGHT = SCRUBBER_TOUCH_AREA_HEIGHT + SCRUBBER_BAR_HEIGHT;
const SCRUBBER_TRACK_CONTAINER_HEIGHT = 34;
const SCRUBBER_BAR_HEIGHT_RANGE_PX = 5;
const SCRUBBER_BAR_BASE_OPACITY = 0.7;
const SCRUBBER_BAR_PLAYING_OPACITY = 0.9;
const SCRUBBER_TRACK_OPACITY = 0.4;
const SCRUBBER_BOTTOM_PADDING = 8;

function VideoScrubberActive({
  active,
  player,
  seekingAnimationSV,
  children,
  overlayOpacitySV,
}: VideoScrubberProps) {
  const { viewportWidth: screenWidth } = useFeedLayout();
  const contentPadding = Math.round(Math.max(8, Math.min(14, screenWidth * 0.025)));
  const trackWidth = screenWidth - 2 * contentPadding;

  const setScrubbingState = useUIStore(state => state.setVisibility);
  const currentTimeSV = useSharedValue(0);
  const durationSV = useSharedValue(0);
  const [currentSeekTime, setCurrentSeekTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const isSeekingSV = useSharedValue(false);
  const isPlayingSV = useSharedValue(false);
  const seekProgressSV = useSharedValue(0);
  const playerStatusEvent = useEvent(player!, 'statusChange', { status: 'idle' as const });

  const playerRef = useRef(player);

  useEffect(() => {
    if (!active) {
      scheduleOnUI(() => {
        'worklet';
        isSeekingSV.set(false);
        isPlayingSV.set(false);
        cancelAnimation(currentTimeSV);
        currentTimeSV.set(0);
        seekProgressSV.set(0);
        seekingAnimationSV.set(0);
      });
    } else if (active && playerRef.current) {
      try {
        const currentPlayer = playerRef.current;
        const currentTime = currentPlayer.currentTime;
        const isPlaying = currentPlayer.playing;
        scheduleOnUI(() => {
          'worklet';
          isPlayingSV.set(isPlaying);
          if (currentTime > 0) {
            currentTimeSV.set(currentTime);
          }
        });
      } catch (_error) {
        // ignored
      }
    }
  }, [
    active,
    playerRef,
    isSeekingSV,
    isPlayingSV,
    currentTimeSV,
    seekProgressSV,
    seekingAnimationSV,
  ]);

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

  useEffect(() => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer || !active) return;

    const syncDuration = (d: number) => {
      if (d > 0 && d !== duration) {
        setDuration(Math.round(d));
        scheduleOnUI(() => {
          'worklet';
          durationSV.set(d);
        });
      }
    };

    syncDuration(currentPlayer.duration);
    const sub = currentPlayer.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') syncDuration(currentPlayer.duration);
    });
    return () => sub.remove();
  }, [playerRef, active, duration, durationSV]);

  // playerStatusEvent dependency ensures the interval is re-applied after replaceAsync resets it.
  useEffect(() => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer) return;
    currentPlayer.timeUpdateEventInterval = active ? SCRUBBER_TIME_UPDATE_INTERVAL_SECONDS : 0;
  }, [playerRef, active, playerStatusEvent]);

  useEffect(() => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer || !active) return;

    const syncPlaying = (isPlaying: boolean) => {
      scheduleOnUI(() => {
        'worklet';
        isPlayingSV.set(isPlaying);
      });
    };

    syncPlaying(currentPlayer.playing ?? false);
    const sub = currentPlayer.addListener('playingChange', ({ isPlaying }) =>
      syncPlaying(isPlaying)
    );
    return () => sub.remove();
  }, [playerRef, active, isPlayingSV]);

  useEffect(() => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer || !active) return;

    const sub = currentPlayer.addListener('timeUpdate', ({ currentTime }) => {
      if (isSeekingSV.get()) return;
      scheduleOnUI(() => {
        'worklet';
        const dur = durationSV.get();
        if (dur === 0) return;
        const target = Math.min(currentTime + SCRUBBER_TIME_UPDATE_INTERVAL_SECONDS, dur);
        currentTimeSV.set(
          withTiming(target, {
            duration: SCRUBBER_TIME_UPDATE_INTERVAL_SECONDS * 1000,
            easing: Easing.linear,
          })
        );
      });
    });
    return () => sub.remove();
  }, [playerRef, active, isSeekingSV, currentTimeSV, durationSV]);

  useAnimatedReaction(
    () => seekingAnimationSV.get() >= 0.2,
    (isScrubbing, prevIsScrubbing) => {
      if (prevIsScrubbing === null || isScrubbing !== prevIsScrubbing) {
        scheduleOnRN(setScrubbingState, 'videoScrubbing', isScrubbing);
      }
    }
  );

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

  const enableScrubbingMode = useCallback(() => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer) return;
    try {
      currentPlayer.scrubbingModeOptions = { scrubbingModeEnabled: true };
    } catch (_error) {
      // ignored
    }
  }, [playerRef]);

  const disableScrubbingMode = useCallback(() => {
    const currentPlayer = playerRef.current;
    if (!currentPlayer) return;
    try {
      currentPlayer.scrubbingModeOptions = { scrubbingModeEnabled: false };
    } catch (_error) {
      // ignored
    }
  }, [playerRef]);

  const seekTo = useCallback(
    (time: number) => {
      const currentPlayer = playerRef.current;
      if (!currentPlayer) return;
      try {
        currentPlayer.currentTime = time;

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
        // ignored
      }
    },
    [playerRef, isSeekingSV, seekingAnimationSV, currentTimeSV]
  );

  /* eslint-disable react-hooks/refs */
  const scrubPanGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .onStart(() => {
        'worklet';
        scheduleOnRN(enableScrubbingMode);
        cancelAnimation(currentTimeSV);
        seekProgressSV.set(currentTimeSV.get());
        isSeekingSV.set(true);
        seekingAnimationSV.set(withTiming(1, { duration: 500 }));
      })
      .onUpdate(evt => {
        'worklet';
        const progress = evt.x / trackWidth;
        const dur = durationSV.get();
        seekProgressSV.set(clamp(progress * dur, 0, dur));
      })
      .onEnd(evt => {
        'worklet';
        const progress = evt.x / trackWidth;
        const dur = durationSV.get();
        const newTime = clamp(progress * dur, 0, dur);

        seekProgressSV.set(newTime);
        currentTimeSV.set(newTime);

        scheduleOnRN(disableScrubbingMode);
        scheduleOnRN(seekTo, newTime);
      });

    return gesture.enabled(active);
  }, [
    active,
    seekingAnimationSV,
    trackWidth,
    durationSV,
    isSeekingSV,
    seekProgressSV,
    seekTo,
    currentTimeSV,
    enableScrubbingMode,
    disableScrubbingMode,
  ]);
  /* eslint-enable react-hooks/refs */

  const timeStyle = useAnimatedStyle(() => {
    const seekingValue = seekingAnimationSV.get();
    const threshold = 0.3;
    const opacity = seekingValue < threshold ? 0 : (seekingValue - threshold) / (1 - threshold);
    return {
      display: seekingValue === 0 ? ('none' as const) : ('flex' as const),
      opacity,
    };
  });

  const trackContainerStyle = useAnimatedStyle(() => {
    const seekingAnim = seekingAnimationSV.get();
    const containerOpacity = overlayOpacitySV.value;
    return {
      opacity: seekingAnim > 0 ? Math.max(containerOpacity, 0.95) : containerOpacity,
    };
  });

  const trackBarStyle = useAnimatedStyle(() => ({
    height: seekingAnimationSV.get() * SCRUBBER_BAR_HEIGHT_RANGE_PX + SCRUBBER_BAR_HEIGHT,
  }));

  const progressBarStyle = useAnimatedStyle(() => {
    const isSeeking = isSeekingSV.get();
    const seekingAnim = seekingAnimationSV.get();
    const isPlaying = isPlayingSV.get();
    const dur = durationSV.get();
    const currentTime = isSeeking ? seekProgressSV.get() : currentTimeSV.get();
    const width =
      dur === 0 ? 0 : interpolate(currentTime, [0, dur], [0, trackWidth], Extrapolation.CLAMP);
    return {
      width,
      height: seekingAnim * SCRUBBER_BAR_HEIGHT_RANGE_PX + SCRUBBER_BAR_HEIGHT,
      opacity: interpolate(
        seekingAnim,
        [0, 1],
        [isPlaying && !isSeeking ? SCRUBBER_BAR_PLAYING_OPACITY : SCRUBBER_BAR_BASE_OPACITY, 1]
      ),
    };
  });

  useEffect(() => {
    return () => {
      scheduleOnUI(() => {
        'worklet';
        isSeekingSV.set(false);
        isPlayingSV.set(false);
        cancelAnimation(currentTimeSV);
        currentTimeSV.set(0);
        seekProgressSV.set(0);
        seekingAnimationSV.set(0);
      });
      useUIStore.getState().setVisibility('videoScrubbing', false);
    };
  }, [seekingAnimationSV, isSeekingSV, isPlayingSV, currentTimeSV, seekProgressSV]);

  const childrenContainerStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacitySV.value,
  }));

  const composedTimeStyle = useMemo(
    () => [
      styles.timeContainer,
      timeStyle,
      { bottom: SCRUBBER_TOTAL_HEIGHT + 5 + SCRUBBER_BOTTOM_PADDING },
    ],
    [timeStyle]
  );
  const composedTrackContainerStyle = useMemo(
    () => [styles.trackContainer, trackContainerStyle],
    [trackContainerStyle]
  );
  const scrubberContainerStyle = useMemo(
    () => [
      styles.scrubberContainer,
      { bottom: SCRUBBER_BOTTOM_PADDING, left: contentPadding, right: contentPadding },
    ],
    [contentPadding]
  );
  const composedTrackBarStyle = useMemo(() => [styles.trackBar, trackBarStyle], [trackBarStyle]);
  const composedProgressBarStyle = useMemo(
    () => [styles.progressBar, progressBarStyle],
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
        <Animated.View style={scrubberContainerStyle} pointerEvents={active ? 'box-none' : 'none'}>
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
  if (Platform.OS !== 'ios') return null;
  return <VideoScrubberActive {...props} />;
}

export const VideoScrubber = memo(VideoScrubberShell);

const styles = StyleSheet.create({
  timeContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: OVERLAY_Z_INDEX.SCRUBBER_TIME,
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
    bottom: 0,
    zIndex: OVERLAY_Z_INDEX.SCRUBBER,
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
    backgroundColor: Colors.brand.white,
    opacity: SCRUBBER_TRACK_OPACITY,
    borderRadius: (SCRUBBER_BAR_HEIGHT + SCRUBBER_BAR_HEIGHT_RANGE_PX) / 2,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    backgroundColor: Colors.brand.white,
    borderRadius: (SCRUBBER_BAR_HEIGHT + SCRUBBER_BAR_HEIGHT_RANGE_PX) / 2,
  },
});
