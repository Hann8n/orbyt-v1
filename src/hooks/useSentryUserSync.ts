import { useEffect } from 'react';
import { useUserStore, selectIsSessionValid } from '@/stores/userStore';
import * as Sentry from '@sentry/react-native';

/**
 * Hook to automatically sync Sentry user context with app authentication state
 * Should be called once in your root layout after Sentry is initialized
 */
export const useSentryUserSync = () => {
  const currentUser = useUserStore(state => state.currentUser);
  const isAuthenticated = useUserStore(selectIsSessionValid);

  useEffect(() => {
    if (isAuthenticated && currentUser) {
      // Set user context in Sentry when authenticated
      Sentry.setUser({
        id: currentUser.did ?? undefined,
        username: currentUser.handle ?? undefined,
      });

      // Add app-specific context
      Sentry.setContext('user_profile', {
        handle: currentUser.handle,
        displayName: currentUser.displayName,
        emailConfirmed: currentUser.emailConfirmed,
      });
    } else {
      // Clear user context when not authenticated
      Sentry.setUser(null);
      Sentry.setContext('user_profile', {});
    }
  }, [isAuthenticated, currentUser]);
};
