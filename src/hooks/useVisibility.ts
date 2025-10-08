/**
 * Simple, robust visibility hook system
 * For tracking which items are visible in a list
 */
import { create } from 'zustand';
import { useCallback, useRef } from 'react';

// Simple state structure to track visible videos
interface VisibilityState {
  // Currently visible video URI
  visibleVideoUri: string | null;
  // Currently visible video index
  visibleVideoIndex: number;
  // App state
  isAppActive: boolean;
  isAppForegrounded: boolean;
  // Disable all video playback
  isPlaybackDisabled: boolean;
  // Current route
  currentRoute: string | null;
  
  // Actions
  setVisibleVideo: (uri: string | null, index: number) => void;
  setAppActive: (active: boolean) => void;
  setAppForegrounded: (foregrounded: boolean) => void;
  disablePlayback: (disabled: boolean) => void;
  setCurrentRoute: (route: string) => void;
}

// Create a simple store with no complex logic
export const useVisibilityStore = create<VisibilityState>((set) => ({
  visibleVideoUri: null,
  visibleVideoIndex: -1,
  isAppActive: true,
  isAppForegrounded: true,
  isPlaybackDisabled: false,
  currentRoute: null,
  
  setVisibleVideo: (uri, index) => set({
    visibleVideoUri: uri,
    visibleVideoIndex: index
  }),
  
  setAppActive: (active) => set({
    isAppActive: active
  }),
  
  setAppForegrounded: (foregrounded) => set({
    isAppForegrounded: foregrounded
  }),
  
  disablePlayback: (disabled) => set({
    isPlaybackDisabled: disabled
  }),
  
  setCurrentRoute: (route) => set({
    currentRoute: route
  })
}));

// Simple hook to determine if a video should play
export function useVideoPlayback(uri: string, isComponentVisible: boolean) {
  const {
    visibleVideoUri,
    isAppActive,
    isAppForegrounded,
    isPlaybackDisabled
  } = useVisibilityStore();
  
  // A video should play when:
  // 1. The component itself reports as visible
  // 2. The app is active and foregrounded
  // 3. Playback is not globally disabled
  // 4. This is the currently visible video
  const shouldPlay = 
    isComponentVisible && 
    isAppActive && 
    isAppForegrounded && 
    !isPlaybackDisabled &&
    visibleVideoUri === uri;
    
  return { shouldPlay };
}

// Hook for list components to use for visibility tracking
export function useViewabilityTracker() {
  const { setVisibleVideo } = useVisibilityStore();
  const lastVisibleUri = useRef<string | null>(null);
  
  // Return a simple memoized handler for onViewableItemsChanged
  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    // Find the most visible video (first viewable non-end-card item)
    const visibleVideoItem = viewableItems.find(item => 
      item.isViewable && 
      item.item?.post?.uri && 
      !item.item.endCard
    );
    
    if (visibleVideoItem) {
      const nextUri = visibleVideoItem.item.post.uri;
      const nextIndex = visibleVideoItem.index;
      
      // Only update if the visible video has actually changed
      if (nextUri !== lastVisibleUri.current) {
        lastVisibleUri.current = nextUri;
        setVisibleVideo(nextUri, nextIndex);
      }
    } else if (lastVisibleUri.current !== null) {
      // No visible video found, clear state
      lastVisibleUri.current = null;
      setVisibleVideo(null, -1);
    }
  }, [setVisibleVideo]);
  
  return {
    onViewableItemsChanged: handleViewableItemsChanged,
    viewabilityConfig: {
      viewAreaCoveragePercentThreshold: 50, // 50% of viewport must be covered
      minimumViewTime: 0, // No minimum time for immediate feedback
      waitForInteraction: false // Don't wait for user interaction
    }
  };
}

// Hook to track app state
export function useAppStateTracker() {
  const { setAppActive, setAppForegrounded } = useVisibilityStore();
  
  return {
    trackActive: (isActive: boolean) => setAppActive(isActive),
    trackForegrounded: (isForegrounded: boolean) => setAppForegrounded(isForegrounded)
  };
}

// Hook to get current visible video info
export function useVisibleVideo() {
  return useVisibilityStore(state => ({
    visibleVideoUri: state.visibleVideoUri,
    visibleVideoIndex: state.visibleVideoIndex
  }));
}
