import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Animated, {
  clamp,
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
  /**
   * From parent’s single `useEvent(player, 'statusChange')` — avoids a second status listener per cell.
   */
  playerStatus: string;
  seekingAnimationSV: SharedValue<number>;
  scrollGesture?: NativeGesture;
  children?: React.ReactNode;
  /** Composed opacity from VideoCard (scroll overlap × scrubbing). */
  overlayOpacitySV: SharedValue<number>;
}

/**
 * iOS scrubber with Skia + gestures. Always mounted when the row shows a scrubber so the
 * track can fade with `overlayOpacitySV` while scrolling. `active` only gates player sync,
 * intervals, and touch handling — not the Skia track presence.
 */
const VideoScrubberActive = ({
  active,
  player,
  playerStatus,
  seekingAnimationSV,
  scrollGesture,
  children,
  overlayOpacitySV,
}: VideoScrubberProps) => {
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

  // Scrubber bar dimensions (from styles)
  const scrubberBarHeight = 3; // Base bar height from styles.track
  const scrubberTouchAreaHeight = 32; // Touchable area from styles.trackContainer.paddingTop
  const scrubberTotalHeight = scrubberTouchAreaHeight + scrubberBarHeight; // Matches styles.trackContainer.height (34)

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

  useEffect(() => {
    if (!player || !active) return;

    // Read-only operation - never affects playback
    if (playerStatus === 'readyToPlay' || player.duration > 0) {
      const playerDuration = player.duration;
      if (playerDuration > 0 && duration !== playerDuration) {
        // Only update local state - never touches player
        setDuration(Math.round(playerDuration));
        scheduleOnUI(() => {
          'worklet';
          durationSV.set(playerDuration);
        });
      }
    }
  }, [player, active, playerStatus, duration, durationSV]);

  // Passive read-only sync from player - never interferes with playback
  // Uses lower frequency to avoid any performance impact on core playback
  useEffect(() => {
    if (!player || !active) return;

    const syncProgress = () => {
      // Defensive checks - never block if player is invalid
      if (!player || playerRef.current !== player) return;

      try {
        const isSeeking = isSeekingSV.get();
        // Only read from player when not seeking (during seek, use local seekProgressSV)
        if (!isSeeking) {
          // Read-only operation - never affects playback
          const currentTime = player.currentTime;
          if (currentTime >= 0) {
            scheduleOnUI(() => {
              'worklet';
              currentTimeSV.set(currentTime);
            });
          }
        }
      } catch (_error) {
        // Silently ignore - scrubber never blocks or interferes
      }
    };

    // 30fps sync for smooth scrub bar during playback
    const interval = setInterval(syncProgress, 33);
    return () => clearInterval(interval);
  }, [player, active, isSeekingSV, currentTimeSV]);

  // Sync seekingAnimationSV to UI store using same threshold as overlay (0.2)
  useAnimatedReaction(
    () => seekingAnimationSV.get(),
    seekingValue => {
      'worklet';
      const isScrubbing = seekingValue >= 0.2;
      scheduleOnRN(setScrubbingState, 'videoScrubbing', isScrubbing);
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

  // Optimize time style - add worklet directive for better performance
  const timeStyle = useAnimatedStyle(() => {
    'worklet';
    const seekingValue = seekingAnimationSV.get();
    // Fade in faster and fade out slower to avoid clash with overlay
    // Use a threshold so time appears when seeking is active enough
    const threshold = 0.3;
    const opacity = seekingValue < threshold ? 0 : (seekingValue - threshold) / (1 - threshold); // Scale from threshold to 1
    return {
      display: seekingValue === 0 ? 'none' : 'flex',
      opacity: opacity,
    };
  });

  const progressWidthSV = useDerivedValue(() => {
    'worklet';
    const isSeeking = isSeekingSV.get();
    const duration = durationSV.get();
    if (duration === 0) return 0;
    const currentTime = isSeeking ? seekProgressSV.get() : currentTimeSV.get();
    return (currentTime / duration) * screenWidth;
  }, [screenWidth, isSeekingSV, seekProgressSV, currentTimeSV, durationSV]);

  const barHeightSV = useDerivedValue(() => {
    'worklet';
    const seekingAnim = seekingAnimationSV.get();
    return seekingAnim * 5 + 3;
  }, [seekingAnimationSV]);

  const barOpacitySV = useDerivedValue(() => {
    'worklet';
    const seekingAnim = seekingAnimationSV.get();
    return interpolate(seekingAnim, [0, 1], [0.72, 1]);
  }, [seekingAnimationSV]);

  const trackHeightSV = useDerivedValue(() => {
    'worklet';
    return seekingAnimationSV.get() * 5 + 3;
  }, [seekingAnimationSV]);

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

  const childrenStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: 1 - seekingAnimationSV.get(),
    };
  });

  const scrubberOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: overlayOpacitySV.value,
    };
  });

  // Track container opacity - ensure it stays visible during scrubbing
  const trackContainerOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    const seekingAnim = seekingAnimationSV.get();
    const containerOpacity = overlayOpacitySV.value;
    // During scrubbing, ensure track/progress bar stays visible (min 0.95 opacity)
    // Otherwise use container opacity
    return {
      opacity: seekingAnim > 0 ? Math.max(containerOpacity, 0.95) : containerOpacity,
    };
  });

  // Card bottom matches feed row (already above tab bar); keep scrubber flush to card bottom.

  return (
    <>
      <Animated.View
        style={[
          styles.timeContainer,
          styles.timeContainerPosition,
          {
            bottom: scrubberTotalHeight + 5, // Above scrubber track at bottom of card
          },
          timeStyle,
        ]}
        pointerEvents="none"
      >
        <Text style={styles.timeText}>
          <Text style={styles.timeTextLarge}>{formatTime(currentSeekTime)}</Text>
          <Text style={styles.timeTextSeparator}>{'  /  '}</Text>
          <Text style={[styles.timeTextLarge, styles.timeTextMuted]}>{formatTime(duration)}</Text>
        </Text>
      </Animated.View>

      <GestureDetector gesture={scrubPanGesture}>
        <Animated.View
          style={styles.scrubberContainer}
          pointerEvents={active ? 'box-none' : 'none'}
        >
          <Animated.View
            style={[styles.trackContainer, trackContainerOpacityStyle]}
            pointerEvents={active ? 'auto' : 'none'}
          >
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
          <Animated.View style={[childrenStyle, scrubberOpacityStyle]}>{children}</Animated.View>
        </Animated.View>
      </GestureDetector>
    </>
  );
};

VideoScrubberActive.displayName = 'VideoScrubberActive';

function VideoScrubberShell(props: VideoScrubberProps) {
  if (Platform.OS !== 'ios') return null;
  return <VideoScrubberActive {...props} />;
}

// Memoize: avoid re-renders when unrelated parent props are stable.
export const VideoScrubber = React.memo(VideoScrubberShell, (prevProps, nextProps) => {
  return (
    prevProps.active === nextProps.active &&
    prevProps.player === nextProps.player &&
    prevProps.playerStatus === nextProps.playerStatus &&
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
    zIndex: 20, // Always on top - above overlay (zIndex: 5) and scrubber (zIndex: 10)
  },
  timeContainerPosition: {
    left: 0,
    right: 0,
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
  timeTextSeparator: {
    fontSize: Typography.sizes.title,
    opacity: 0.8,
    fontFamily: FontFamily.regular,
  },
  timeTextMuted: {
    opacity: 0.8,
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
    position: 'relative',
    paddingTop: 32, // Much larger touchable area above the bar for easier grabbing
    paddingBottom: 0, // No padding below - bar at absolute bottom
    height: 34, // Total height: 32px padding + 2px bar
  },
});
