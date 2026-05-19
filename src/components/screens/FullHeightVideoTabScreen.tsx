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
import { IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING } from '@/components/features/feed/feedViewShared';
import { feedService } from '@/services/FeedService';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { isIosLiquidGlassAvailable } from '@/stores/userStore';
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
  const hasTabBar = true;
  const useManualIosGlassTabPaddingLayout = hasTabBar && isIosLiquidGlassAvailable;

  const viewableAreaHeight = (() => {
    if (!hasTabBar) {
      const maxViewport = Math.max(0, screenHeight - insets.bottom);
      return maxViewport;
    }
    if (useManualIosGlassTabPaddingLayout) {
      return screenHeight;
    }
    // For non-liquid glass, don't subtract status bar - only subtract bottom inset
    return Math.max(0, screenHeight - insets.bottom);
  })();

  const cardHeight = useManualIosGlassTabPaddingLayout
    ? getVideoCardHeight(screenWidth, screenHeight)
    : viewableAreaHeight;

  const topInset = typeof insets.top === 'number' ? insets.top : 0;
  const bottomInset = typeof insets.bottom === 'number' ? insets.bottom : 0;

  const cardWidth = (() => {
    if (!useManualIosGlassTabPaddingLayout) return screenWidth;
    return (cardHeight * 9) / 16;
  })();

  const safeAreaVideoAreaStyle = {
    paddingTop: topInset,
    paddingBottom:
      bottomInset + (useManualIosGlassTabPaddingLayout ? IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING : 0),
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  };

  const cardContainerStyle = {
    width: cardWidth,
    height: cardHeight,
    overflow: 'hidden' as const,
  };

  return (
    <View style={styles.videoArea}>
      {useManualIosGlassTabPaddingLayout ? (
        <View style={[safeAreaVideoAreaStyle, styles.videoAreaLiquidGlassInner]}>
          <View style={cardContainerStyle}>
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
        </View>
      ) : (
        <VideoItem
          feedItem={feedItem}
          post={feedItem.post}
          height={cardHeight}
          feedOption={FEED_OPTION}
          canPlay={canPlay}
          index={0}
          isAppleZoomTarget={Platform.OS === 'ios'}
        />
      )}
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
  videoAreaLiquidGlassInner: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
  },
});

export default FullHeightVideoTabScreen;
