import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import ProfileCache from '../services/cache/ProfileCache';

/**
 * Hook for navigating to user profiles with prefetching
 */
export const useProfileNavigation = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const navigateToProfile = useCallback((handle: string) => {
    if (handle && handle.trim()) {
      queryClient.prefetchQuery({
        queryKey: ProfileCache.getQueryKey(handle.trim()),
        queryFn: () => ProfileCache.getProfile(handle.trim()),
        staleTime: ProfileCache.cacheExpiry,
      }).finally(() => {
        const target = handle.trim();
        if (target) {
          // Navigate to root navigation to ensure proper stack behavior
          // This ensures the profile opens from the root stack, not nested within settings
          let rootNav: any = router as any;
          while (rootNav?.getParent?.()) {
            rootNav = rootNav.getParent();
          }
          router.push(`/profile/${target}`);
        }
      });
    }
  }, [router, queryClient]);

  return { navigateToProfile };
};
