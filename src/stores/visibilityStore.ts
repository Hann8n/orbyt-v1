/**
 * Video Visibility State Management
 * Centralizes playback state control based on screen focus and scroll position
 */
import { create } from 'zustand';
import { useRoute } from '@react-navigation/native';

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
  
  // Actions
  setCurrentTab: (tab: string) => void;
  setCurrentRoute: (route: string) => void;
  updateNavigation: (routeName: string) => void;

  // Computed getters
  isTabFocused: (tab: string) => boolean;
  shouldPlayInTab: (tab: string, isVisible: boolean) => boolean;
}

export const useVisibilityStore = create<VisibilityState>((set, get) => ({
  // State
  currentTab: 'Home',
  currentRoute: 'HomeScreen',

  // Actions
  setCurrentTab: (tab: string) => set({ currentTab: tab }),
  setCurrentRoute: (route: string) => set({ currentRoute: route }),
  
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
    const { currentTab } = get();
    return isVisible && currentTab === tab;
  },
}));

// Custom hooks for consuming the store
export const useCurrentTab = () => useVisibilityStore(state => state.currentTab);
export const useIsTabFocused = (tab: string) => useVisibilityStore(state => state.isTabFocused(tab));
export const useShouldPlayInTab = (tab: string, isVisible: boolean) => 
  useVisibilityStore(state => state.shouldPlayInTab(tab, isVisible));

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

  const localRouteName = (route as any)?.name as string | undefined;
  const isOnActiveRoute = !!localRouteName && localRouteName === currentRoute;

  const shouldPlay = isVisible && isOnActiveRoute;
  return { shouldPlay };
}
