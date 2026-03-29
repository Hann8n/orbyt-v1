import { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';

/** Old `/(modals)/feed` URLs → tab stack (native tab bar insets). */
export default function LegacyFeedModalRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)/explore/feed',
      params: params as Record<string, string>,
    });
  }, [router, params]);

  return null;
}
