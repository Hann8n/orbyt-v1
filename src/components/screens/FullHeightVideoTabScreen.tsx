import { memo, useCallback } from 'react';
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
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { getVideoCardHeight } from '@/utils/video/helpers';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useFeedVisibility } from '@/core/visibility/hooks';
import { useVisibilityRouteIsActive } from '@/hooks';

const ROUTE_KEY = 'full-height-video-modal';
const FEED_OPTION = 'full-height-video';

type PlaybackProps = {
  insets: EdgeInsets;
  feedItem: NonNullable<ReturnType<typeof feedService.getCurrentFeed>[number]>;
  canPlay: boolean;
};

/**
 * Stack screen inside a tab: parent flex area already sits above the native tab bar — same inset
 * behavior as other tab stacks (no root transparent modal).
 */
const FullHeightVideoPlayback = memo(function FullHeightVideoPlayback({
  insets,
  feedItem,
  canPlay,
}: PlaybackProps) {
  const { screenWidth, screenHeight } = useDeviceLayout();
  const cardHeight = getVideoCardHeight(screenWidth, screenHeight);
  const cardWidth = (cardHeight * 9) / 16;

  const topInset = typeof insets.top === 'number' ? insets.top : 0;
  const bottomInset = typeof insets.bottom === 'number' ? insets.bottom : 0;

  const safeAreaVideoAreaStyle = {
    paddingTop: topInset,
    paddingBottom: bottomInset,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  };

  return (
    <View style={styles.videoArea}>
      <View style={[safeAreaVideoAreaStyle, styles.videoAreaInner]}>
        <View style={{ width: cardWidth, height: cardHeight, overflow: 'hidden' }}>
          <VideoItem
            feedItem={feedItem}
            post={feedItem.post}
            height={cardHeight}
            feedOption={FEED_OPTION}
            isVisible={true}
            canPlay={canPlay}
            index={0}
            isAppleZoomTarget={Platform.OS === 'ios'}
          />
        </View>
      </View>
    </View>
  );
});

const FullHeightVideoTabScreen = memo(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ postUri?: string }>();
  const postUri = typeof params.postUri === 'string' ? params.postUri : '';

  const isRouteFocused = useVisibilityRouteIsActive(ROUTE_KEY);

  const { canPlay } = useFeedVisibility({
    isActive: isRouteFocused,
  });

  const items = feedService.getCurrentFeed();
  const feedItem = postUri && items[0]?.post?.uri === postUri ? items[0] : undefined;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const backButtonTop = (typeof insets.top === 'number' ? insets.top : 0) + 15;

  const backButtonDynamicStyle = {
    top: backButtonTop,
  };

  return (
    <FollowProvider>
      <View style={styles.container}>
        <NativePressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={handleClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.backButton, backButtonDynamicStyle]}
        >
          <BackArrowIcon size={30} color={Colors.neutral[50]} />
        </NativePressable>

        {feedItem ? (
          <FullHeightVideoPlayback
            key={postUri}
            insets={insets}
            feedItem={feedItem}
            canPlay={canPlay}
          />
        ) : null}
      </View>
    </FollowProvider>
  );
});

FullHeightVideoTabScreen.displayName = 'FullHeightVideoTabScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  videoArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  videoAreaInner: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
  },
});

export default FullHeightVideoTabScreen;
