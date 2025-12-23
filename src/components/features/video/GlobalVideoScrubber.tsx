import React, { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type VideoPlayer } from 'expo-video';
import { useUIStore } from '../../../stores/uiStore';
import { getBottomNavBarHeight } from '../../../utils/helpers';
import { VideoScrubber } from './VideoScrubber';

// Simple registry for active video player (module-level to avoid re-renders)
let activePlayerRef: VideoPlayer | null = null;
let visibilityListeners: Set<() => void> = new Set();

export const registerActiveVideoPlayer = (player: VideoPlayer | null) => {
  activePlayerRef = player;
  visibilityListeners.forEach(listener => listener());
};

export const getActiveVideoPlayer = (): VideoPlayer | null => {
  return activePlayerRef;
};

/**
 * Global video scrubber for iOS only
 * Positioned above the bottom bar
 * Tracks active video player from registry
 */
export const GlobalVideoScrubber: React.FC = () => {
  // iOS only
  if (Platform.OS !== 'ios') {
    return null;
  }

  const insets = useSafeAreaInsets();
  const isVideoVisible = useUIStore((state) => state.visibility.isVideoVisible ?? false);
  const [activePlayer, setActivePlayer] = useState<VideoPlayer | null>(activePlayerRef);
  const seekingAnimationSV = useSharedValue(0);

  // Subscribe to player changes
  useEffect(() => {
    const listener = () => {
      setActivePlayer(activePlayerRef);
    };
    visibilityListeners.add(listener);
    return () => {
      visibilityListeners.delete(listener);
    };
  }, []);

  // Reset scrubber when visibility changes (low impact - just shared value)
  useEffect(() => {
    if (!isVideoVisible) {
      seekingAnimationSV.value = 0;
    }
  }, [isVideoVisible, seekingAnimationSV]);

  const bottomNavBarHeight = useMemo(() => getBottomNavBarHeight(insets), [insets]);

  if (!activePlayer || !isVideoVisible) {
    return null;
  }

  return (
    <VideoScrubber
      active={isVideoVisible}
      player={activePlayer}
      seekingAnimationSV={seekingAnimationSV}
    />
  );
};

