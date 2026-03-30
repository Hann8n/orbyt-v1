import { useLayoutEffect } from 'react';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';
import { buildChannelDetailHref } from '@/utils/navigation/detailRoutes';

/**
 * Deep-link / legacy root path `/channel/[id]`. Replaces into the active tab’s channel stack.
 */
export default function ChannelIdRoute() {
  const router = useRouter();
  const segments = useSegments();
  const lastFocusedDetailNavTab = useDetailNavTabStore(s => s.lastFocusedDetailNavTab);
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ?? '';

  useLayoutEffect(() => {
    if (id) {
      router.replace(
        buildChannelDetailHref(id, { segments, fallbackTab: lastFocusedDetailNavTab })
      );
    }
  }, [id, lastFocusedDetailNavTab, router, segments]);

  return null;
}
