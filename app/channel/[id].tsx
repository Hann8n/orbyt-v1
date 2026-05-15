import { useLayoutEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { buildChannelDetailHref, useCurrentDetailNavTab } from '@/utils/navigation/detailRoutes';

/**
 * Deep-link / legacy root path `/channel/[id]`. Replaces into the active tab's channel stack.
 */
export default function ChannelIdRoute() {
  const router = useRouter();
  const currentTab = useCurrentDetailNavTab();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ?? '';

  useLayoutEffect(() => {
    if (id) {
      router.replace(buildChannelDetailHref(id, currentTab));
    }
  }, [id, currentTab, router]);

  return null;
}
