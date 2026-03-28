import { useCallback, useMemo } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { useFeedSettings } from '@/stores/userStore';
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
 * Tab-aware profile/channel navigation: classic pushes on the current tab stack; modal uses root routes.
 */
export function useProfileChannelNavigation(options?: UseProfileChannelNavigationOptions) {
  const router = useRouter();
  const segments = useSegments();
  const { modalProfileEnabled } = useFeedSettings();
  const fallbackTab = options?.fallbackTab ?? 'home';

  const hrefOpts: BuildDetailHrefOptions = useMemo(
    () => ({
      useModalLayout: modalProfileEnabled,
      segments,
      fallbackTab,
    }),
    [modalProfileEnabled, segments, fallbackTab]
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
