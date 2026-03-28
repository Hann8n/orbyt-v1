import { useLayoutEffect } from 'react';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';

import Channel from './channel';
import { useFeedSettings } from '@/stores/userStore';
import { buildChannelDetailHref } from '@/utils/navigation/detailRoutes';

/**
 * Root stack route for /channel/[id] (modal layout). Classic layout replaces into tab stack.
 */
export default function ChannelIdRoute() {
  const router = useRouter();
  const segments = useSegments();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ?? '';
  const { modalProfileEnabled } = useFeedSettings();

  useLayoutEffect(() => {
    if (!modalProfileEnabled && id) {
      router.replace(
        buildChannelDetailHref(id, {
          useModalLayout: false,
          segments,
          fallbackTab: 'home',
        })
      );
    }
  }, [id, modalProfileEnabled, router, segments]);

  if (!modalProfileEnabled) {
    return null;
  }

  return <Channel />;
}
