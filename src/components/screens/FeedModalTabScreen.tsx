import { useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import FeedRenderer from '@/components/features/feed/FeedRenderer';
import { TabFullScreenBackButton } from '@/components/common/TabFullScreenBackButton';
import { HashtagHeader } from '@/components/features/feed/HashtagHeader';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { useVisibilityRouteIsActive } from '@/hooks';

/**
 * Full-screen feed opened as a **stack screen inside a tab** (not a root modal), so the native
 * bottom tab bar layout and safe-area insets apply normally.
 */
const FeedModalTabScreen = memo(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const isRouteFocused = useVisibilityRouteIsActive('feed-modal');

  const routeParams = useMemo(() => {
    const initialIndex = params.initialIndex ? parseInt(params.initialIndex as string, 10) : null;
    const validInitialIndex = initialIndex !== null && !isNaN(initialIndex) ? initialIndex : null;
    const initialPostUri =
      typeof params.initialPostUri === 'string' && params.initialPostUri.length > 0
        ? params.initialPostUri
        : null;
    return {
      feed: params.feed as string,
      feedOption: params.feedOption as string,
      userDid: params.userDid as string,
      hasNextPage: params.hasNextPage === 'true',
      isFetchingNextPage: params.isFetchingNextPage === 'true',
      initialIndex: validInitialIndex,
      initialPostUri,
    };
  }, [params]);

  const modalQueryOptions = useMemo(
    () => ({
      staleTime: 5 * 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    }),
    []
  );

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <TabFullScreenBackButton
        onPress={handleClose}
        insets={insets}
        accessibilityLabel={t('common.back')}
      />

      <FeedRenderer
        feedOption={routeParams.feedOption}
        userDid={routeParams.userDid}
        backgroundColor={Colors.black}
        secondaryColor={Colors.neutral[50]}
        isVisible={isRouteFocused}
        hasTabBar
        hasNextPage={routeParams.hasNextPage}
        isFetchingNextPage={routeParams.isFetchingNextPage}
        queryOptions={modalQueryOptions}
        targetScrollIndex={routeParams.initialIndex}
        zoomTargetPostUri={routeParams.initialPostUri}
      />

      <HashtagHeader feedOption={routeParams.feedOption} insets={insets} />
    </View>
  );
});

FeedModalTabScreen.displayName = 'FeedModalTabScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});

export default FeedModalTabScreen;
