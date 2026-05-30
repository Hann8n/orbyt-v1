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
import { useViewportHeight } from '@/hooks/useViewportHeight';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useFeedVisibility, useScreenVisible } from '@/core/visibility/hooks';

const FEED_OPTION = 'full-height-video';

type ContentProps = {
  insets: EdgeInsets;
  feedItem: NonNullable<ReturnType<typeof feedService.getCurrentFeed>[number]>;
  canPlay: boolean;
};

const VideoPlayerContent = memo(function VideoPlayerContent({ feedItem, canPlay }: ContentProps) {
  // Tab bar is in-flow below TabSlot; viewport height already excludes it.
  const cardHeight = useViewportHeight({ hasTabBar: true, feedLayoutHeight: 0 });

  return (
    <View style={styles.videoArea}>
      <VideoItem
        feedItem={feedItem}
        post={feedItem.post}
        height={cardHeight}
        feedOption={FEED_OPTION}
        canPlay={canPlay}
        index={0}
        isAppleZoomTarget={Platform.OS === 'ios'}
      />
    </View>
  );
});

const VideoPlayerScreen = memo(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ postUri?: string }>();
  const postUri = typeof params.postUri === 'string' ? params.postUri : '';

  const { canPlay } = useFeedVisibility({ isActive: useScreenVisible() });

  const items = feedService.getCurrentFeed();
  const feedItem = postUri && items[0]?.post?.uri === postUri ? items[0] : undefined;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const backButtonTop = (typeof insets.top === 'number' ? insets.top : 0) + 15;

  return (
    <FollowProvider>
      <View style={styles.container}>
        <NativePressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={handleClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.backButton, { top: backButtonTop }]}
        >
          <BackArrowIcon size={30} color={Colors.neutral[50]} />
        </NativePressable>

        {feedItem ? (
          <VideoPlayerContent key={postUri} insets={insets} feedItem={feedItem} canPlay={canPlay} />
        ) : null}
      </View>
    </FollowProvider>
  );
});

VideoPlayerScreen.displayName = 'VideoPlayerScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  videoArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
  },
});

export default VideoPlayerScreen;
