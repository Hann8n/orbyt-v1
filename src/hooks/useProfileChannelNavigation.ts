import { useCallback } from 'react';
import { useRouter, useSegments, useFocusEffect } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

import {
  buildChannelDetailHref,
  buildProfileDetailHref,
  getActiveTabFromNavigation,
  isRootModalStackContext,
  type DetailNavTab,
} from '@/utils/navigation/detailRoutes';

/**
 * Hook for profile/channel navigation that respects the currently focused tab.
 * Uses useFocusEffect to ensure tab context is always accurate when navigating.
 */
export function useProfileChannelNavigation(options?: { fallbackTab?: DetailNavTab }) {
  const router = useRouter();
  const segments = useSegments();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  
  // Track the last known active tab using navigation state
  // This stays stable even when modals are presented over tabs
  const currentTab = getActiveTabFromNavigation(navigation) ?? options?.fallbackTab ?? 'home';

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
