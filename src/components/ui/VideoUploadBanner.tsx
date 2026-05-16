import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { NativePressable } from './NativePressable';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withTiming,
  SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Colors } from './UI';
import { BORDER_RADIUS } from '../../utils/constants';
import { useVideoUpload } from '../../hooks/useVideoUpload';
import { FontFamily, Typography, TextStyles } from '@/utils/components/typography';

interface VideoUploadBannerProps {
  topInset?: number;
  applySafeArea?: boolean;
  scrollY?: SharedValue<number>;
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: Colors.black,
    overflow: 'hidden',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
    position: 'relative',
    zIndex: 10,
    overflow: 'visible',
  },
  textContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  thumbnailContainer: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[925],
    borderWidth: 2,
    borderColor: Colors.neutral[50],
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  bannerText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
  },
  chyronText: {
    ...TextStyles.chyron,
    color: Colors.neutral[50],
    opacity: 0.8,
    marginTop: 2,
  },
  progressBarContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.transparent,
    overflow: 'hidden',
    zIndex: 1,
  },
  bannerExpanded: {
    marginTop: 4,
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    height: '100%',
    backgroundColor: Colors.purple[500],
  },
});

const VideoUploadBannerComponent: React.FC<VideoUploadBannerProps> = ({
  topInset = 0,
  applySafeArea = false,
  scrollY,
}) => {
  const { t } = useTranslation();
  const { progress, status, thumbnailUri, reset } = useVideoUpload();
  const router = useRouter();
  const [isAtTop, setIsAtTop] = useState(true);
  const [showContent, setShowContent] = useState(true);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDismissedRef = useRef(false);

  const isComplete = useMemo(() => status === 'complete', [status]);
  const statusText = useMemo(() => {
    const key =
      status === 'uploading'
        ? 'video.uploadingVideo'
        : status === 'processing'
          ? 'video.processingVideo'
          : status === 'complete'
            ? 'common.done'
            : 'video.finishingUp';
    return t(key);
  }, [status, t]);
  const collapsedHeight = useMemo(
    () => (applySafeArea ? topInset : 0) + 4,
    [applySafeArea, topInset]
  );
  const shouldShowExpanded = useMemo(() => isComplete || showContent, [isComplete, showContent]);

  // All hooks must be called before early return
  const animatedProgress = useSharedValue(progress);
  useEffect(() => {
    animatedProgress.value = withTiming(progress, { duration: 300 });
  }, [progress, animatedProgress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value}%`,
  }));

  const isCompleteShared = useSharedValue(isComplete);

  const handleDismiss = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    hasDismissedRef.current = true;
    reset();
  }, [reset]);

  useEffect(() => {
    isCompleteShared.value = isComplete;
    hasDismissedRef.current = false;

    if (isComplete) {
      requestAnimationFrame(() => {
        setShowContent(true);
      });
      dismissTimeoutRef.current = setTimeout(() => {
        if (!hasDismissedRef.current) handleDismiss();
      }, 10000);
    }

    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, [isComplete, handleDismiss, isCompleteShared]);

  useAnimatedReaction(
    () => {
      const scrollValue = scrollY?.value ?? 0;
      const atTop = scrollValue <= 50;
      const isCompleteValue = isCompleteShared.value;

      return {
        atTop,
        shouldShow: scrollValue <= 50,
        shouldDismiss: isCompleteValue && scrollValue > 20,
        isComplete: isCompleteValue,
      };
    },
    (current, previous) => {
      if (!scrollY) return;

      if (current.atTop !== previous?.atTop) {
        scheduleOnRN(setIsAtTop, current.atTop);
      }

      if (current.shouldDismiss && !previous?.shouldDismiss) {
        scheduleOnRN(handleDismiss);
      } else if (!current.isComplete && current.shouldShow !== previous?.shouldShow) {
        scheduleOnRN(setShowContent, current.shouldShow);
      }
    },
    [scrollY, handleDismiss]
  );

  useEffect(() => {
    if (!scrollY && !isComplete) {
      requestAnimationFrame(() => {
        setShowContent(true);
        setIsAtTop(true);
      });
    }
  }, [scrollY, isComplete]);

  const handleProfilePress = useCallback(() => {
    router.navigate('/(tabs)/profile');
    reset();
  }, [router, reset]);

  const bannerDynamicStyle = useMemo(
    () => ({
      paddingTop: applySafeArea ? topInset : 0,
      backgroundColor: Colors.black,
      opacity: isAtTop ? 1 : 0.6,
      height: shouldShowExpanded ? undefined : collapsedHeight,
    }),
    [applySafeArea, topInset, isAtTop, shouldShowExpanded, collapsedHeight]
  );

  if (status === 'idle') {
    return null;
  }

  return (
    <NativePressable
      onPress={isComplete ? handleProfilePress : undefined}
      style={[styles.banner, bannerDynamicStyle]}
    >
      <View style={styles.progressBarContainer}>
        <Animated.View style={[styles.progressBarFill, progressStyle]} />
      </View>
      {shouldShowExpanded && (
        <View style={[styles.bannerContent, styles.bannerExpanded]}>
          <View style={styles.textContainer}>
            <Text style={styles.bannerText}>{statusText}</Text>
            {isComplete && <Text style={styles.chyronText}>{t('video.tapToViewProfile')}</Text>}
          </View>
          <View style={styles.thumbnailContainer}>
            {thumbnailUri && (
              <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} contentFit="cover" />
            )}
          </View>
        </View>
      )}
    </NativePressable>
  );
};

export const VideoUploadBanner = React.memo(VideoUploadBannerComponent);
