import { useCallback, useMemo } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';
import {
  buildChannelDetailHref,
  buildProfileDetailHref,
  isRootModalStackContext,
  type BuildDetailHrefOptions,
  type DetailNavTab,
} from '@/utils/navigation/detailRoutes';

type UseProfileChannelNavigationOptions = {
  /** Overrides last focused tab when not under `(tabs)` (e.g. tests). */
  fallbackTab?: DetailNavTab;
};

/**
 * Tab-aware profile/channel navigation: pushes on the active tab’s stack (or last focused tab when
 * outside tabs, e.g. settings modal — see `DetailNavTabSegmentSync` in `app/(tabs)/_layout.tsx`).
 */
export function useProfileChannelNavigation(options?: UseProfileChannelNavigationOptions) {
  const router = useRouter();
  const segments = useSegments();
  const lastFocusedDetailNavTab = useDetailNavTabStore(s => s.lastFocusedDetailNavTab);
  const fallbackTab = options?.fallbackTab ?? lastFocusedDetailNavTab;

  const hrefOpts: BuildDetailHrefOptions = useMemo(
    () => ({
      segments,
      fallbackTab,
    }),
    [segments, fallbackTab]
  );

  const navigateToProfile = useCallback(
    (did: string) => {
      const href = buildProfileDetailHref(did, hrefOpts);
      if (isRootModalStackContext(segments)) {
        router.dismissTo(href);
      } else {
        router.navigate(href);
      }
    },
    [router, hrefOpts, segments]
  );

  const navigateToChannel = useCallback(
    (encodedChannelId: string) => {
      const href = buildChannelDetailHref(encodedChannelId, hrefOpts);
      if (isRootModalStackContext(segments)) {
        router.dismissTo(href);
      } else {
        router.navigate(href);
      }
    },
    [router, hrefOpts, segments]
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
