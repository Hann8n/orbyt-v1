import { useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';

import {
  DEFAULT_DETAIL_TAB,
  buildChannelDetailHref,
  buildProfileDetailHref,
  getDetailNavTabFromSegments,
  isRootModalStackContext,
  type DetailNavTab,
} from '@/utils/navigation/detailRoutes';

/**
 * Navigate to a profile/channel detail on the tab the user is currently on.
 *
 * The destination tab is read from the focused route segments at press time
 * ({@link getDetailNavTabFromSegments}), so the detail always lands on the originating tab's stack
 * — no live navigator-state guessing, no last-focused store. From a root screen presented over the
 * tabs (settings, chat, deep links) there is no current tab, so we `dismissTo` a single
 * deterministic destination ({@link DEFAULT_DETAIL_TAB}).
 */
export function useProfileChannelNavigation(options?: { fallbackTab?: DetailNavTab }) {
  const router = useRouter();
  const segments = useSegments();

  const currentTab =
    getDetailNavTabFromSegments(segments) ?? options?.fallbackTab ?? DEFAULT_DETAIL_TAB;
  const isRootModal = isRootModalStackContext(segments);

  const navigateToProfile = useCallback(
    (did: string) => {
      const href = buildProfileDetailHref(did, currentTab);
      if (isRootModal) {
        router.dismissTo(href);
      } else {
        router.navigate(href);
      }
    },
    [router, currentTab, isRootModal]
  );

  const navigateToChannel = useCallback(
    (encodedChannelId: string) => {
      const href = buildChannelDetailHref(encodedChannelId, currentTab);
      if (isRootModal) {
        router.dismissTo(href);
      } else {
        router.navigate(href);
      }
    },
    [router, currentTab, isRootModal]
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
