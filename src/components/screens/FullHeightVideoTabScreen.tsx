import { memo, useCallback, useEffect, useMemo } from 'react';
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
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useFeedVisibility } from '@/core/visibility';
import { useVisibilityCoreStore } from '@/core/visibility/visibilityStore';
import { useVisibilityRouteIsActive } from '@/hooks';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

const ROUTE_KEY = 'full-height-video-modal';
const FEED_OPTION = 'full-height-video';

type PlaybackProps = {
  insets: EdgeInsets;
  feedItem: NonNullable<ReturnType<typeof feedService.getCurrentFeed>[number]>;
  feedKey: string;
  canPlay: boolean;
};

/**
 * Stack screen inside a tab: parent flex area already sits above the native tab bar — same inset
 * behavior as other tab stacks (no root transparent modal).
 */
const FullHeightVideoPlayback = memo(function FullHeightVideoPlayback({
  insets,
  feedItem,
  feedKey,
  canPlay,
}: PlaybackProps) {
  const { width: windowWidth, height: windowHeight } = getViewportDimensions(insets, {
    useFullWindowHeight: true,
  });

  const topInset = typeof insets.top === 'number' ? insets.top : 0;
  const bottomInset = typeof insets.bottom === 'number' ? insets.bottom : 0;
  const liquidGlassEnabled = Platform.OS === 'ios' && isLiquidGlassAvailable();

  const cardHeight = useMemo(() => {
    if (!liquidGlassEnabled) return 0;
    const availableHeight = Math.max(0, windowHeight - topInset - bottomInset);
    const maxCardHeightByWidth = (windowWidth * 16) / 9;
    return Math.max(0, Math.min(availableHeight, maxCardHeightByWidth));
  }, [liquidGlassEnabled, windowHeight, topInset, bottomInset, windowWidth]);

  const cardWidth = useMemo(() => {
    if (!liquidGlassEnabled) return 0;
    return (cardHeight * 9) / 16;
  }, [cardHeight, liquidGlassEnabled]);

  const safeAreaVideoAreaStyle = useMemo(
    () =>
      StyleSheet.create({
        safeAreaVideoArea: {
          paddingTop: topInset,
          paddingBottom: bottomInset,
          justifyContent: 'center',
          alignItems: 'center',
        },
      }).safeAreaVideoArea,
    [topInset, bottomInset]
  );

  const cardContainerStyle = useMemo(
    () =>
      StyleSheet.create({
        cardContainer: {
          width: cardWidth,
          height: cardHeight,
          overflow: 'hidden',
        },
      }).cardContainer,
    [cardHeight, cardWidth]
  );

  const fullHeightVideoHeight = Math.max(0, windowHeight - bottomInset);

  return (
    <View style={styles.videoArea}>
      {liquidGlassEnabled ? (
        <View style={[safeAreaVideoAreaStyle, styles.videoAreaLiquidGlassInner]}>
          <View style={cardContainerStyle}>
            <VideoItem
              feedItem={feedItem}
              post={feedItem.post}
              height={cardHeight}
              feedOption={FEED_OPTION}
              feedKey={feedKey}
              canPlay={canPlay}
              isHeaderBlockingPlayback={false}
              index={0}
              isAppleZoomTarget={Platform.OS === 'ios'}
            />
          </View>
        </View>
      ) : (
        <VideoItem
          feedItem={feedItem}
          post={feedItem.post}
          height={fullHeightVideoHeight}
          feedOption={FEED_OPTION}
          feedKey={feedKey}
          canPlay={canPlay}
          isHeaderBlockingPlayback={false}
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

  const { canPlay, feedKey } = useFeedVisibility({
    feedOption: FEED_OPTION,
    isActive: isRouteFocused,
  });

  const items = feedService.getCurrentFeed();
  const feedItem = postUri && items[0]?.post?.uri === postUri ? items[0] : undefined;

  const setLastViewableIndex = useVisibilityCoreStore(s => s.setLastViewableIndex);

  useEffect(() => {
    if (!isRouteFocused || !feedItem) return;
    setLastViewableIndex(feedKey, 0);
  }, [isRouteFocused, feedItem, feedKey, setLastViewableIndex]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const backButtonTop = useMemo(
    () => (typeof insets.top === 'number' ? insets.top : 0) + 15,
    [insets.top]
  );

  const backButtonDynamicStyle = useMemo(
    () =>
      StyleSheet.create({
        backButtonDynamic: {
          top: backButtonTop,
        },
      }).backButtonDynamic,
    [backButtonTop]
  );

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
            feedKey={feedKey}
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
