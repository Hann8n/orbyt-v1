// Simple global feed store for modal navigation
let currentFeed: any[] = [];

// Global map of video URIs to blur state (true = blurred, false = unblurred)
const videoBlurState = new Map<string, boolean>();

// Header visibility state tracking
let headerVisibilityState = {
  isSnappedToTop: true,
  scrollY: 0,
  headerHeight: 0,
};

// Header visibility listeners
const headerVisibilityListeners = new Set<(state: typeof headerVisibilityState) => void>();

export function setCurrentFeed(feed: any[]) {
  currentFeed = feed;
}

export function getCurrentFeed(): any[] {
  return currentFeed;
}

export function clearCurrentFeed() {
  currentFeed = [];
}

// Set the blur state for a video URI
export function setVideoBlurState(uri: string, blurred: boolean) {
  videoBlurState.set(uri, blurred);
}

// Check if a video URI is blurred (default to true if not set and moderation says blur)
export function isVideoBlurred(uri: string, moderationBlur: boolean): boolean {
  if (videoBlurState.has(uri)) {
    return videoBlurState.get(uri)!;
  }
  return moderationBlur;
}

// Header visibility management
export function updateHeaderVisibility(scrollY: number, headerHeight: number = 0, isSnappedToTop: boolean = false) {
  const newState = {
    isSnappedToTop,
    scrollY,
    headerHeight,
  };
  
  headerVisibilityState = newState;
  
  // Notify all listeners
  headerVisibilityListeners.forEach(listener => {
    try {
      listener(newState);
    } catch (error) {
      console.warn('Error in header visibility listener:', error);
    }
  });
}

export function getHeaderVisibilityState() {
  return headerVisibilityState;
}

export function subscribeToHeaderVisibility(listener: (state: typeof headerVisibilityState) => void) {
  headerVisibilityListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    headerVisibilityListeners.delete(listener);
  };
}

export function resetHeaderVisibility() {
  headerVisibilityState = {
    isSnappedToTop: true,
    scrollY: 0,
    headerHeight: 0,
  };
  
  // Notify listeners of reset
  headerVisibilityListeners.forEach(listener => {
    try {
      listener(headerVisibilityState);
    } catch (error) {
      console.warn('Error in header visibility listener:', error);
    }
  });
} 