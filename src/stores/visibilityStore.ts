/**
 * Video Visibility State Management
 * Centralizes playback state control based on screen focus and scroll position
 */
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { useCallback, useEffect } from 'react';
import { useRoute } from '@react-navigation/native';
import { useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';

// Route to tab mapping
const routeToTabMap: Record<string, string> = {
  'HomeScreen': 'Home',
  'ExploreScreen': 'Explore',
  'NotificationsScreen': 'Notifications',
  'ProfileScreen': 'Profile',
  'ChannelScreen': 'Channel',
  'FeedScreen': 'Feed',
  'CreateScreen': 'Create',
  'VideoPostScreen': 'VideoPost',
  'SettingsScreen': 'Settings',
};

export interface VisibilityState {
  // Navigation state
  currentTab: string;
  currentRoute: string;
  
  // Header state
  isHeaderVisible: boolean;
  headerScrollY: number;
  headerScrollThreshold: number;
  
  // Actions
  setCurrentTab: (tab: string) => void;
  setCurrentRoute: (route: string) => void;
  setHeaderVisible: (visible: boolean) => void;
  setHeaderScrollY: (scrollY: number) => void;
  setHeaderScrollThreshold: (threshold: number) => void;
  updateNavigation: (routeName: string) => void;

  // Computed getters
  isTabFocused: (tab: string) => boolean;
  shouldPlayInTab: (tab: string, isVisible: boolean) => boolean;
  shouldPauseForHeader: (scrollY: number) => boolean;
}

export const useVisibilityStore = create<VisibilityState>((set, get) => ({
  // State
  currentTab: 'Home',
  currentRoute: 'HomeScreen',
  isHeaderVisible: false,
  headerScrollY: 0,
  headerScrollThreshold: 50,

  // Actions
  setCurrentTab: (tab: string) => set({ currentTab: tab }),
  setCurrentRoute: (route: string) => set({ currentRoute: route }),
  setHeaderVisible: (visible: boolean) => set({ isHeaderVisible: visible }),
  setHeaderScrollY: (scrollY: number) => set({ headerScrollY: scrollY }),
  setHeaderScrollThreshold: (threshold: number) => set({ headerScrollThreshold: threshold }),
  
  // Combined navigation update
  updateNavigation: (routeName: string) => set(state => {
    const tabName = routeToTabMap[routeName] || routeName;
    return {
      currentRoute: routeName,
      currentTab: tabName
    };
  }),

  // Computed getters
  isTabFocused: (tab: string) => get().currentTab === tab,
  
  shouldPlayInTab: (tab: string, isVisible: boolean) => {
    // Only play videos if:
    // 1. The item is visible in the current viewport
    // 2. The tab containing this video is the active tab
    // 3. The header isn't covering the video
    const { currentTab, shouldPauseForHeader, headerScrollY } = get();
    return isVisible && currentTab === tab && !shouldPauseForHeader(headerScrollY);
  },
  
  shouldPauseForHeader: (scrollY: number) => {
    const { headerScrollThreshold, isHeaderVisible } = get();
    // Pause video when header is expanded and visible
    return isHeaderVisible && scrollY < headerScrollThreshold;
  }
}));

// Custom hooks for consuming the store
export const useCurrentTab = () => useVisibilityStore(state => state.currentTab);
export const useIsTabFocused = (tab: string) => useVisibilityStore(state => state.isTabFocused(tab));
export const useShouldPlayInTab = (tab: string, isVisible: boolean) => 
  useVisibilityStore(state => state.shouldPlayInTab(tab, isVisible));

/**
 * Header Scroll Tracker Hook
 * Returns a scroll handler that tracks header visibility for video playback
 */
interface UseHeaderScrollTrackerOptions {
  threshold?: number;
  onScrollJS?: (scrollY: number, contentHeight: number, screenHeight: number) => void;
  onBeginDragJS?: () => void;
  onEndDragJS?: () => void;
}

export function useHeaderScrollTracker({ threshold = 50, onScrollJS, onBeginDragJS, onEndDragJS }: UseHeaderScrollTrackerOptions = {}) {
  const { setHeaderVisible, setHeaderScrollY, setHeaderScrollThreshold } = useVisibilityStore();
  
  // Set threshold on first render
  useEffect(() => {
    setHeaderScrollThreshold(threshold);
  }, [threshold, setHeaderScrollThreshold]);
  
  // Create scroll handler
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const scrollY = event.contentOffset.y;
      const contentHeight = event.contentSize?.height ?? 0;
      const screenHeight = event.layoutMeasurement?.height ?? 1;
      
      // Update store with current scroll position
      runOnJS(setHeaderScrollY)(scrollY);
      
      // Update header visibility based on scroll position
      if (scrollY <= threshold) {
        runOnJS(setHeaderVisible)(true);
      } else {
        runOnJS(setHeaderVisible)(false);
      }
      
      // Invoke optional JS callback for consumer logic
      if (onScrollJS) {
        try { runOnJS(onScrollJS)(scrollY, contentHeight, screenHeight); } catch {}
      }
    },
    onBeginDrag: () => {
      if (onBeginDragJS) {
        try { runOnJS(onBeginDragJS)(); } catch {}
      }
    },
    onEndDrag: () => {
      if (onEndDragJS) {
        try { runOnJS(onEndDragJS)(); } catch {}
      }
    },
  });
  
  return scrollHandler;
}

/**
 * Header Visibility Hook
 * Returns header visibility state and computed values
 */
export function useHeaderVisibility() {
  const isHeaderVisible = useVisibilityStore(state => state.isHeaderVisible);
  const headerScrollY = useVisibilityStore(state => state.headerScrollY);
  const headerScrollThreshold = useVisibilityStore(state => state.headerScrollThreshold);
  
  return { 
    isHeaderVisible, 
    headerScrollY,
    headerScrollThreshold,
    shouldPauseForHeader: headerScrollY < headerScrollThreshold
  };
}

/**
 * Navigation Update Hook
 * Use this hook to update current navigation state
 */
export function useNavigationUpdate() {
  const updateNavigation = useVisibilityStore(state => state.updateNavigation);
  return updateNavigation;
}

/**
 * Video Playback State Hook
 * Determines if a video should play based on tab focus and visibility
 */
export function useVideoPlaybackState(isVisible: boolean) {
  const route = useRoute();
  const currentRoute = useVisibilityStore(state => state.currentRoute);
  const headerScrollY = useVisibilityStore(state => state.headerScrollY);
  const shouldPauseForHeader = useVisibilityStore(state => state.shouldPauseForHeader);

  const localRouteName = (route as any)?.name as string | undefined;
  const isOnActiveRoute = !!localRouteName && localRouteName === currentRoute;
  const pausedByHeader = shouldPauseForHeader(headerScrollY);

  const shouldPlay = isVisible && isOnActiveRoute && !pausedByHeader;
  return { shouldPlay };
}
