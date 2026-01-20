import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  SharedValue,
  useAnimatedReaction,
  runOnJS,
  useSharedValue,
} from 'react-native-reanimated';
import { Colors } from './UI';
import { BORDER_RADIUS } from '../../utils/constants';
import { useVideoUpload } from '../../hooks/useVideoUpload';

interface VideoUploadBannerProps {
  topInset?: number;
  applySafeArea?: boolean;
  scrollY?: SharedValue<number>;
}

const STATUS_TEXT: Record<string, string> = {
  uploading: 'Uploading video...',
  processing: 'Processing video...',
  complete: 'Done',
  default: 'Finishing up...',
};

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
    backgroundColor: Colors.darkGray,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  bannerText: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  chyronText: {
    color: Colors.white,
    fontSize: 13,
    fontFamily: 'Figtree-Regular',
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
    backgroundColor: Colors.blurple,
  },
});

const VideoUploadBannerComponent: React.FC<VideoUploadBannerProps> = ({
  topInset = 0,
  applySafeArea = false,
  scrollY,
}) => {
  const { progress, status, thumbnailUri, reset } = useVideoUpload();
  const router = useRouter();
  const [isAtTop, setIsAtTop] = useState(true);
  const [showContent, setShowContent] = useState(true);
  const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasDismissedRef = useRef(false);

  const isComplete = useMemo(() => status === 'complete', [status]);
  const statusText = useMemo(() => STATUS_TEXT[status] || STATUS_TEXT.default, [status]);
  const collapsedHeight = useMemo(
    () => (applySafeArea ? topInset : 0) + 4,
    [applySafeArea, topInset]
  );
  const shouldShowExpanded = useMemo(() => isComplete || showContent, [isComplete, showContent]);

  // All hooks must be called before early return
  const animatedProgress = useDerivedValue(() => {
    'worklet';
    return withTiming(progress, { duration: 300 });
  }, [progress]);

  const progressStyle = useAnimatedStyle(
    () => ({
      width: `${animatedProgress.value}%`,
    }),
    []
  );

  const isCompleteShared = useSharedValue(isComplete);

  const handleDismiss = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    hasDismissedRef.current = true;
    reset();
  }, [reset]);

  // Sync shared values and handle auto-dismiss
  useEffect(() => {
    // Update shared value directly (allowed in useEffect)
    isCompleteShared.value = isComplete;
    hasDismissedRef.current = false;

    if (isComplete) {
      // Update state asynchronously to avoid cascading renders
      // Use requestAnimationFrame for better performance
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

  // Handle scroll-based visibility (only if scrollY is provided)
  useAnimatedReaction(
    () => scrollY?.value ?? 0,
    scrollValue => {
      'worklet';
      if (!scrollY) return; // Skip if no scrollY

      const atTop = scrollValue <= 50;
      runOnJS(setIsAtTop)(atTop);

      // Auto-dismiss completed uploads when scrolled down
      const isCompleteValue = isCompleteShared.value;
      if (isCompleteValue && scrollValue > 20) {
        runOnJS(handleDismiss)();
      } else if (!isCompleteValue) {
        // For active uploads, show content when at top, hide when scrolled
        runOnJS(setShowContent)(scrollValue <= 50);
      }
    },
    [scrollY]
  );

  // Always show content when scrollY is not provided (no scroll-based hiding)
  useEffect(() => {
    if (!scrollY && !isComplete) {
      // Update state asynchronously to avoid cascading renders
      requestAnimationFrame(() => {
        setShowContent(true);
        setIsAtTop(true);
      });
    }
  }, [scrollY, isComplete]);

  const handleProfilePress = useCallback(() => {
    router.push('/(tabs)/profile');
    reset();
  }, [router, reset]);

  // Memoize dynamic styles before early return (hooks must be called in same order)
  const bannerDynamicStyle = useMemo(
    () => ({
      paddingTop: applySafeArea ? topInset : 0,
      backgroundColor: Colors.black,
      opacity: isAtTop ? 1 : 0.6,
      height: shouldShowExpanded ? undefined : collapsedHeight,
    }),
    [applySafeArea, topInset, isAtTop, shouldShowExpanded, collapsedHeight]
  );

  // Early return after all hooks to avoid React hooks violation
  if (status === 'idle') {
    return null;
  }

  return (
    <Pressable
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
            {isComplete && <Text style={styles.chyronText}>Tap to view on profile</Text>}
          </View>
          <View style={styles.thumbnailContainer}>
            {thumbnailUri && (
              <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} contentFit="cover" />
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
};

export const VideoUploadBanner = React.memo(VideoUploadBannerComponent, (prevProps, nextProps) => {
  return (
    prevProps.topInset === nextProps.topInset &&
    prevProps.applySafeArea === nextProps.applySafeArea &&
    prevProps.scrollY === nextProps.scrollY
  );
});

export default VideoUploadBanner;
