import { useLayoutEffect } from 'react';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';

import ProfileScreen from '../(tabs)/profile';
import { useAuth, useFeedSettings } from '@/stores/userStore';
import { buildProfileDetailHref } from '@/utils/navigation/detailRoutes';

/**
 * Root stack route for /profile/[did] (modal layout). When classic layout is on, replace into the
 * active tab’s nested stack so the tab bar stays visible.
 */
export default function ProfileByDidRoute() {
  const router = useRouter();
  const segments = useSegments();
  const params = useLocalSearchParams<{ did?: string }>();
  const did = params.did ?? '';
  const { modalProfileEnabled } = useFeedSettings();
  const { signOut } = useAuth();

  useLayoutEffect(() => {
    if (!modalProfileEnabled && did) {
      router.replace(
        buildProfileDetailHref(did, {
          useModalLayout: false,
          segments,
          fallbackTab: 'home',
        })
      );
    }
  }, [modalProfileEnabled, did, router, segments]);

  if (!modalProfileEnabled) {
    return null;
  }

  return <ProfileScreen onLogout={signOut} />;
}
