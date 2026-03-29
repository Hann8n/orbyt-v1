import { useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Text } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { useRouter, useLocalSearchParams } from 'expo-router';

import FeedRenderer from '@/components/features/feed/FeedRenderer';

import { BackArrowIcon } from '@/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';
import { Typography } from '@/utils/components/typography';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '@/hooks';

/**
 * Full-screen feed opened as a **stack screen inside a tab** (not a root modal), so the native
 * bottom tab bar layout and safe-area insets apply normally.
 */
const FeedModalTabScreen = memo(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  useVisibilityRouteTracker('feed-modal');
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

  const isHashtagFeed = routeParams.feedOption?.startsWith('hashtag:');
  const hashtagWithSort = isHashtagFeed ? routeParams.feedOption.substring(8) : null;
  const hashtag = hashtagWithSort ? hashtagWithSort.split(':')[0] : null;
  const isOrbytChannelHashtag = hashtag
    ? hashtag.startsWith('orbyt-channel-') || hashtag.startsWith('orbyt-')
    : false;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <NativePressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={handleClose}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[
          styles.backButton,
          { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 },
        ]}
      >
        <BackArrowIcon size={30} color={Colors.neutral[50]} />
      </NativePressable>

      <FeedRenderer
        feedOption={routeParams.feedOption}
        userDid={routeParams.userDid}
        backgroundColor={Colors.black}
        secondaryColor={Colors.neutral[50]}
        isVisible={isRouteFocused}
        isModal={true}
        hasTabBar
        hasNextPage={routeParams.hasNextPage}
        isFetchingNextPage={routeParams.isFetchingNextPage}
        queryOptions={modalQueryOptions}
        targetScrollIndex={routeParams.initialIndex}
        zoomTargetPostUri={routeParams.initialPostUri}
      />

      {isHashtagFeed && hashtag && !isOrbytChannelHashtag && (
        <View
          style={[
            styles.hashtagHeaderContainer,
            { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 },
          ]}
        >
          <Text style={styles.hashtagSymbol}>#</Text>
          <Text style={styles.hashtagText}>{hashtag}</Text>
        </View>
      )}
    </View>
  );
});

FeedModalTabScreen.displayName = 'FeedModalTabScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
  },
  hashtagHeaderContainer: {
    position: 'absolute',
    left: 70,
    right: 70,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  hashtagSymbol: {
    fontSize: 18,
    color: Colors.neutral[50],
    fontFamily: Typography.families.medium,
    includeFontPadding: false,
    lineHeight: 30,
  },
  hashtagText: {
    fontSize: 18,
    color: Colors.neutral[50],
    fontFamily: Typography.families.bold,
    includeFontPadding: false,
    lineHeight: 30,
  },
});

export default FeedModalTabScreen;
