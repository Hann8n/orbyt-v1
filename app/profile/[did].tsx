import { useLayoutEffect } from 'react';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';

import { buildProfileDetailHref } from '@/utils/navigation/detailRoutes';

/**
 * Deep-link / legacy root path `/profile/[did]`. Replaces into the active tab’s profile stack
 * so presentation matches in-app navigation (card stack, tab bar).
 */
export default function ProfileByDidRoute() {
  const router = useRouter();
  const segments = useSegments();
  const params = useLocalSearchParams<{ did?: string }>();
  const did = params.did ?? '';

  useLayoutEffect(() => {
    if (did) {
      router.replace(buildProfileDetailHref(did, { segments, fallbackTab: 'home' }));
    }
  }, [did, router, segments]);

  return null;
}
