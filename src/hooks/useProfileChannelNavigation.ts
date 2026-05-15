import { useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';
import {
  buildChannelDetailHref,
  buildProfileDetailHref,
  isRootModalStackContext,
  type DetailNavTab,
} from '@/utils/navigation/detailRoutes';

const TAB_SEGMENTS: readonly DetailNavTab[] = ['home', 'explore', 'activity', 'profile'];

export function useProfileChannelNavigation(options?: { fallbackTab?: DetailNavTab }) {
  const router = useRouter();
  const segments = useSegments();
  const lastFocusedDetailNavTab = useDetailNavTabStore(s => s.lastFocusedDetailNavTab);
  const currentTab =
    (segments.find(s => (TAB_SEGMENTS as readonly string[]).includes(s)) as DetailNavTab) ??
    options?.fallbackTab ??
    lastFocusedDetailNavTab;

  const navigateToProfile = useCallback(
    (did: string) => {
      const href = buildProfileDetailHref(did, currentTab);
      if (isRootModalStackContext(segments)) {
        router.dismissTo(href);
      } else {
        router.navigate(href);
      }
    },
    [router, currentTab, segments]
  );

  const navigateToChannel = useCallback(
    (encodedChannelId: string) => {
      const href = buildChannelDetailHref(encodedChannelId, currentTab);
      if (isRootModalStackContext(segments)) {
        router.dismissTo(href);
      } else {
        router.navigate(href);
      }
    },
    [router, currentTab, segments]
  );

  return {
    navigateToProfile,
    navigateToChannel,
    currentTab,
    buildProfileHref: (did: string) => buildProfileDetailHref(did, currentTab),
    buildChannelHref: (encodedChannelId: string) => buildChannelDetailHref(encodedChannelId, currentTab),
  };
}
