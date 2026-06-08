import { useLayoutEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DEFAULT_DETAIL_TAB, buildChannelDetailHref } from '@/utils/navigation/detailRoutes';

/**
 * Deep-link / legacy root path `/channel/[id]`. Redirects into a tab's channel stack. This path is
 * only hit from outside the tabs (deep links), where there is no current tab to anchor to, so it
 * lands on the single deterministic {@link DEFAULT_DETAIL_TAB}.
 */
export default function ChannelIdRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ?? '';

  useLayoutEffect(() => {
    if (id) {
      router.replace(buildChannelDetailHref(id, DEFAULT_DETAIL_TAB));
    }
  }, [id, router]);

  return null;
}
