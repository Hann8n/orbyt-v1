import { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';

/** Old `/(modals)/full-height-video` URLs → tab stack (native tab bar insets). */
export default function LegacyFullHeightVideoModalRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)/explore/full-height-video',
      params: params as Record<string, string>,
    });
  }, [router, params]);

  return null;
}
