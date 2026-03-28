import { useCallback, useMemo } from 'react';
import { useRouter, useSegments } from 'expo-router';

import {
  buildChannelDetailHref,
  buildProfileDetailHref,
  type BuildDetailHrefOptions,
  type DetailNavTab,
} from '@/utils/navigation/detailRoutes';

type UseProfileChannelNavigationOptions = {
  /** When not under `(tabs)` (e.g. settings screens). */
  fallbackTab?: DetailNavTab;
};

/**
 * Tab-aware profile/channel navigation: pushes on the active tab’s stack (or fallback tab when outside tabs).
 */
export function useProfileChannelNavigation(options?: UseProfileChannelNavigationOptions) {
  const router = useRouter();
  const segments = useSegments();
  const fallbackTab = options?.fallbackTab ?? 'home';

  const hrefOpts: BuildDetailHrefOptions = useMemo(
    () => ({
      segments,
      fallbackTab,
    }),
    [segments, fallbackTab]
  );

  const navigateToProfile = useCallback(
    (did: string) => {
      router.navigate(buildProfileDetailHref(did, hrefOpts));
    },
    [router, hrefOpts]
  );

  const navigateToChannel = useCallback(
    (encodedChannelId: string) => {
      router.navigate(buildChannelDetailHref(encodedChannelId, hrefOpts));
    },
    [router, hrefOpts]
  );

  return {
    navigateToProfile,
    navigateToChannel,
    hrefOpts,
    buildProfileHref: (did: string) => buildProfileDetailHref(did, hrefOpts),
    buildChannelHref: (encodedChannelId: string) =>
      buildChannelDetailHref(encodedChannelId, hrefOpts),
  };
}
