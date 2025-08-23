/**
 * Navigation Tracker Hook
 * Automatically tracks navigation state and updates the visibility store
 */
import { useEffect } from 'react';
import { useNavigationState } from '@react-navigation/native';
import { useNavigationUpdate } from '../stores/visibilityStore';

/**
 * Hook that automatically tracks navigation changes and updates the visibility store
 * Add this to your root navigation component
 */
export function useNavigationTracker() {
  const navigationState = useNavigationState(state => state);
  const updateNavigation = useNavigationUpdate();
  
  useEffect(() => {
    if (!navigationState || !navigationState.routes || navigationState.routes.length === 0) {
      return;
    }
    
    const activeRouteIndex = navigationState.index;
    const activeRoute = navigationState.routes[activeRouteIndex];
    const routeName = activeRoute.name;
    
    // Update the visibility store with current route
    updateNavigation(routeName);
    
    // Debug logging
    console.log(`[NavigationTracker] Route changed to: ${routeName}`);
  }, [navigationState, updateNavigation]);
}
