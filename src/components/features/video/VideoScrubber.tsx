import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type NativeGesture,
} from 'react-native-gesture-handler';
import Animated, {
  clamp,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { scheduleOnUI, scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { type VideoPlayer } from 'expo-video';
import { useSegments } from 'expo-router';
import { formatTime, isTablet, isSmallScreen, getBottomNavBarHeight } from '../../../utils/helpers';
import { Colors } from '../../ui/UI';
import { useUIStore } from '../../../stores/uiStore';
import { useTabBarHeight } from '../../../context/TabBarContext';
import { useFeedSettings } from '../../../stores/userStore';

interface VideoScrubberProps {
  active: boolean;
  player?: VideoPlayer;
  seekingAnimationSV: SharedValue<number>;
  scrollGesture?: NativeGesture;
  children?: React.ReactNode;
  isVisible?: boolean; // Visibility for fade animation (matches overlay)
}

// Memoize VideoScrubber to prevent unnecessary re-renders when props haven't changed
export const VideoScrubber = React.memo(({
  active,
  player,
  seekingAnimationSV,
  scrollGesture,
  children,
  isVisible = true,
}: VideoScrubberProps) => {
  // iOS only - return null on other platforms
  if (Platform.OS !== 'ios') {
    return null;
  }

  const { width: screenWidth } = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isTabletDevice = isTablet();
  const isSmallScreenDevice = isSmallScreen();
  const measuredTabBarHeight = useTabBarHeight();
  const calculatedBottomNavBarHeight = getBottomNavBarHeight(insets);
  const bottomNavBarHeight = measuredTabBarHeight ?? calculatedBottomNavBarHeight;
  const hasTabBar = Array.isArray(segments) && segments[0] === '(tabs)';
  const isModal = !hasTabBar;
  const { nativeTabsEnabled } = useFeedSettings();
  
  const setScrubbingState = useUIStore((state) => state.setVisibility);
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
      } catch (error) {
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

  // Read-only duration sync - never affects player
  const { status: playerStatus } = useEvent(player as any, 'statusChange', { status: player?.status ?? 'idle' });
  
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
      } catch (error) {
        // Silently ignore - scrubber never blocks or interferes
      }
    };
    
    // Lower frequency sync (30fps) - scrubber is non-primary, never blocks playback
    const interval = setInterval(syncProgress, 33);
    return () => clearInterval(interval);
  }, [player, active, isSeekingSV, currentTimeSV]);

  // Sync seekingAnimationSV to UI store using same threshold as overlay (0.2)
  useAnimatedReaction(
    () => seekingAnimationSV.get(),
    (seekingValue) => {
      'worklet';
      const isScrubbing = seekingValue >= 0.2;
      scheduleOnRN(setScrubbingState, 'videoScrubbing', isScrubbing);
    },
  );

  // Update current time display from shared value (for both seeking and normal playback)
  useAnimatedReaction(
    () => {
      const isSeeking = isSeekingSV.get();
      if (isSeeking) {
        // When seeking, use seek progress
        return Math.round(seekProgressSV.get());
      } else {
        // When not seeking, use current time
        return Math.round(currentTimeSV.get());
      }
    },
    (time, prevTime) => {
      // Update if time changed
      if (time !== prevTime && time >= 0) {
        scheduleOnRN(setCurrentSeekTime, time);
      }
    },
  );

  // Non-blocking seek - never interferes with playback state
  // Fire-and-forget operation that only sets position, never affects play/pause
  const seekTo = useCallback(
    (time: number) => {
      if (!player) return;
      
      // Non-blocking async operation - never blocks core playback logic
      requestAnimationFrame(() => {
        try {
          // Only set position - never touch play/pause state or other playback properties
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
        } catch (error) {
          // Silently ignore - scrubber never blocks or interferes with playback
        }
      });
    },
    [player, isSeekingSV, seekingAnimationSV, currentTimeSV],
  );

  // Lightweight gesture handler - purely UI, never blocks or interferes with playback
  const scrubPanGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .onStart(() => {
        'worklet';
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

        // Non-blocking seek - fire and forget, never blocks playback
        scheduleOnRN(seekTo, newTime);
      });

    // Don't block scroll - scrubber is non-primary
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

  // Bar style - use local progress state directly
  const barStyle = useAnimatedStyle(() => {
    'worklet';
    const isSeeking = isSeekingSV.get();
    const seekingAnim = seekingAnimationSV.get();
    const duration = durationSV.get();
    
    // Early return for zero duration
    if (duration === 0) {
      return {
        height: 3,
        opacity: 0.5,
        width: '0%',
      };
    }
    
    // Use seek progress while seeking, otherwise use current time
    const currentTime = isSeeking ? seekProgressSV.get() : currentTimeSV.get();
    const progress = currentTime === 0 ? 0 : currentTime / duration;
    
    return {
      height: seekingAnim * 5 + 3, // Thicker when seeking
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

  // Fade out with overlay - matches VideoOverlayUI fade behavior
  const overlayOpacitySV = useSharedValue(isVisible ? 1 : 0);
  
  useEffect(() => {
    overlayOpacitySV.set(withTiming(isVisible ? 1 : 0, {
      duration: 60,
      easing: Easing.out(Easing.ease),
    }));
  }, [isVisible, overlayOpacitySV]);

  const scrubberOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: overlayOpacitySV.get(),
    };
  });

  // Calculate bottom offset using same logic as VideoOverlayUI
  // Add extra height when using native tabs
  const scrubberBottomOffset = useMemo(() => {
    if (isModal) {
      return 0;
    }
    if (hasTabBar && (isSmallScreenDevice || isTabletDevice)) {
      const baseHeight = bottomNavBarHeight;
      // Add extra padding when native tabs are enabled (native tabs are slightly taller)
      return nativeTabsEnabled ? baseHeight + 10 : baseHeight;
    }
    return 0;
  }, [isModal, hasTabBar, isSmallScreenDevice, isTabletDevice, bottomNavBarHeight, nativeTabsEnabled]);

  return (
    <>
      <Animated.View
        style={[
          styles.timeContainer,
          {
            left: 0,
            right: 0,
            bottom: scrubberTotalHeight + 5 + scrubberBottomOffset, // Position above scrubber bar at bottom of card
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
        <Animated.View 
          style={[styles.scrubberContainer, { bottom: scrubberBottomOffset }, scrubberOpacityStyle]}
          pointerEvents="box-none" // Allow taps to pass through to overlay buttons underneath
        >
          <View style={styles.trackContainer} pointerEvents="auto">
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
        </Animated.View>
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

const styles = StyleSheet.create({
  timeContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20, // Always on top - above overlay (zIndex: 5) and scrubber (zIndex: 10)
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

