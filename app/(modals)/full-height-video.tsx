import { memo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativePressable } from '@/components/ui/NativePressable';
import { BackArrowIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import { FollowProvider } from '@/context/FollowContext';
import { VideoItem } from '@/components/features/feed/VideoItem';
import { feedService } from '@/services/FeedService';
import { getViewportDimensions } from '@/utils/device/screen';
import { useFeedVisibility } from '@/core/visibility';
import { useVisibilityCoreStore } from '@/core/visibility/visibilityStore';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '@/hooks';

/** Route + visibility scope for this modal (one viewport-tall video, e.g. chat embed). */
const ROUTE_KEY = 'full-height-video-modal';
const FEED_OPTION = 'full-height-video';

const FullHeightVideoScreen = memo(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ postUri?: string }>();
  const postUri = typeof params.postUri === 'string' ? params.postUri : '';

  useVisibilityRouteTracker(ROUTE_KEY);
  const isRouteFocused = useVisibilityRouteIsActive(ROUTE_KEY);

  const { canPlay, feedKey } = useFeedVisibility({
    feedOption: FEED_OPTION,
    isActive: isRouteFocused,
  });

  const items = feedService.getCurrentFeed();
  const feedItem =
    postUri && items[0]?.post?.uri === postUri ? items[0] : undefined;

  const setLastViewableIndex = useVisibilityCoreStore(s => s.setLastViewableIndex);

  useEffect(() => {
    if (!isRouteFocused || !feedItem) return;
    setLastViewableIndex(feedKey, 0);
  }, [isRouteFocused, feedItem, feedKey, setLastViewableIndex]);

  const { height: windowHeight } = getViewportDimensions(true, false, insets);
  const bottomInset = typeof insets.bottom === 'number' ? insets.bottom : 0;
  const videoHeight = Math.max(0, windowHeight - bottomInset);

  const handleClose = useCallback(() => {
    router.dismiss();
  }, [router]);

  return (
    <FollowProvider>
      <View style={styles.container}>
        <NativePressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={handleClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={StyleSheet.flatten([
            styles.backButton,
            { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 },
          ])}
        >
          <BackArrowIcon size={30} color={Colors.neutral[50]} />
        </NativePressable>

        {feedItem ? (
          <VideoItem
            feedItem={feedItem}
            post={feedItem.post}
            height={videoHeight}
            feedOption={FEED_OPTION}
            feedKey={feedKey}
            canPlay={canPlay}
            isHeaderBlockingPlayback={false}
            isModal
            index={0}
            isAppleZoomTarget={Platform.OS === 'ios' && Boolean(postUri)}
          />
        ) : null}
      </View>
    </FollowProvider>
  );
});

FullHeightVideoScreen.displayName = 'FullHeightVideoScreen';

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
});

export default FullHeightVideoScreen;
