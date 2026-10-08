import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { skipToken, useQuery } from '@tanstack/react-query';

import { Colors } from '@/theme';
import { getCommunity } from '@/services/orbyt/communities';
import { buildChannelDetailHref, useCurrentDetailNavTab } from '@/utils/navigation/detailRoutes';
import { queryKeys } from '@/utils/query/queryKeys';
import { QUERY_CONSTANTS } from '@/utils/constants';

/**
 * `getorbyt.com/c/<name>` (mapped in `+native-intent`). A public link carries only the Community's
 * name; the app addresses Communities by AT-URI, so resolve the name and replace into the active
 * tab's channel stack. An unknown name goes home.
 */
export default function CommunityLinkRoute() {
  const router = useRouter();
  const currentTab = useCurrentDetailNavTab();
  const { name } = useLocalSearchParams<{ name?: string }>();

  const { data: community, isError } = useQuery({
    queryKey: queryKeys.channels.byName(name ?? ''),
    queryFn: name ? ({ signal }) => getCommunity({ name }, signal) : skipToken,
    staleTime: QUERY_CONSTANTS.STALE_TIME,
    retry: QUERY_CONSTANTS.RETRY_COUNT,
  });

  useEffect(() => {
    if (community) {
      router.replace(buildChannelDetailHref(encodeURIComponent(community.uri), currentTab));
    } else if (isError || !name) {
      router.replace('/');
    }
  }, [community, isError, name, currentTab, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.neutral[50]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.black,
  },
});
