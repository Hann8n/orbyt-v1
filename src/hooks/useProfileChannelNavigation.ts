import { useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';
import {
  buildChannelDetailHref,
  buildProfileDetailHref,
  getActiveTabFromNavigation,
  isRootModalStackContext,
  type DetailNavTab,
} from '@/utils/navigation/detailRoutes';

export function useProfileChannelNavigation(options?: { fallbackTab?: DetailNavTab }) {
  const router = useRouter();
  const segments = useSegments();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const lastFocusedDetailNavTab = useDetailNavTabStore(s => s.lastFocusedDetailNavTab);
  const currentTab =
    getActiveTabFromNavigation(navigation) ??
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
    buildChannelHref: (encodedChannelId: string) =>
      buildChannelDetailHref(encodedChannelId, currentTab),
  };
}
