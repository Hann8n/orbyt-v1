import { memo, useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { NanoIcon } from '../../../ui/NanoIcon';
import { Colors } from '../../../../theme';
import { FontFamily, Typography } from '@/utils/components/typography';
import { formatNumber } from '../../../../utils/formatting/numbers';

const HIT_SLOP_14 = { top: 14, bottom: 14, left: 14, right: 14 } as const;

export interface VideoOverlayActionsProps {
  /** Used to reset Reanimated shared values when the row recycles. */
  postUri: string;
  isLiked: boolean;
  isReposted: boolean;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  isLikePending: boolean;
  isRepostPending: boolean;
  actionIconSize: number;
  moreMenuIconSize: number;
  onLike?: () => void;
  onRepost?: () => void;
  onOpenComments?: () => void;
  onSharePress?: () => void;
}

/**
 * Right-rail action stack: share/more, repost, comment, like.
 *
 * Memoized so a like that fires on row N never re-renders the author/caption
 * sections of the same card, and so an unrelated state change in the parent
 * (e.g. follow flag) doesn't re-run the like animation logic here.
 */
function VideoOverlayActionsComponent({
  postUri,
  isLiked,
  isReposted,
  likeCount,
  commentCount,
  repostCount,
  isLikePending,
  isRepostPending,
  actionIconSize,
  moreMenuIconSize,
  onLike,
  onRepost,
  onOpenComments,
  onSharePress,
}: VideoOverlayActionsProps) {
  // Per-button press feedback — driven on the UI thread, no React re-render.
  const likeScale = useSharedValue(1);
  const repostScale = useSharedValue(1);
  const repostRotate = useSharedValue(0);

  const likeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const repostAnimatedStyle = useAnimatedStyle(() => {
    const rotateValue = repostRotate.value;
    const rotateStr = rotateValue === 0 ? '0rad' : `${rotateValue}rad`;
    return {
      transform: [{ rotate: rotateStr }, { scale: repostScale.value }],
    };
  });

  // Reset shared values on FlashList recycle so the previous post's press animation
  // doesn't bleed into the new post.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    likeScale.value = 1;
    // eslint-disable-next-line react-hooks/immutability
    repostScale.value = 1;
    // eslint-disable-next-line react-hooks/immutability
    repostRotate.value = 0;
  }, [postUri, likeScale, repostScale, repostRotate]);

  const handleLikePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isLiked) {
      // eslint-disable-next-line react-hooks/immutability
      likeScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
        likeScale.value = withSpring(1);
      });
    } else {
      likeScale.value = withSpring(1);
    }
    onLike?.();
  }, [isLiked, onLike, likeScale]);

  const handleRepostPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isReposted) {
      // eslint-disable-next-line react-hooks/immutability
      repostScale.value = withSequence(
        withTiming(1.08, { duration: 120 }),
        withTiming(1.0, { duration: 120 })
      );
      // eslint-disable-next-line react-hooks/immutability
      repostRotate.value = withSequence(
        withTiming(0.2, { duration: 90 }),
        withTiming(-0.12, { duration: 90 }),
        withTiming(0, { duration: 90 })
      );
    } else {
      repostScale.value = withTiming(1, { duration: 100 });
      repostRotate.value = withTiming(0, { duration: 100 });
    }
    onRepost?.();
  }, [isReposted, onRepost, repostScale, repostRotate]);

  return (
    <View style={styles.actionsContainer} pointerEvents="box-none">
      <Pressable style={styles.baseActionButton} onPress={onSharePress} hitSlop={HIT_SLOP_14}>
        <View style={styles.moreMenuIconContainer}>
          <NanoIcon name="more-fill" size={moreMenuIconSize} color={Colors.neutral[50]} />
        </View>
      </Pressable>

      <Pressable
        style={styles.baseActionButton}
        onPress={handleRepostPress}
        disabled={isRepostPending}
        hitSlop={HIT_SLOP_14}
      >
        <Animated.View style={repostAnimatedStyle}>
          <NanoIcon
            name="refresh-fill"
            size={actionIconSize}
            color={isReposted ? Colors.teal[500] : Colors.neutral[50]}
          />
        </Animated.View>
        <Text style={styles.actionText}>{formatNumber(repostCount)}</Text>
      </Pressable>

      <Pressable style={styles.baseActionButton} onPress={onOpenComments} hitSlop={HIT_SLOP_14}>
        <NanoIcon name="chat-fill" size={actionIconSize} color={Colors.neutral[50]} />
        <Text style={styles.actionText}>{formatNumber(commentCount)}</Text>
      </Pressable>

      <Pressable
        style={styles.baseActionButton}
        onPress={handleLikePress}
        disabled={isLikePending}
        hitSlop={HIT_SLOP_14}
      >
        <Animated.View style={likeAnimatedStyle}>
          <NanoIcon
            name="heart-fill"
            size={actionIconSize}
            color={isLiked ? Colors.coral[500] : Colors.neutral[50]}
          />
        </Animated.View>
        <Text style={styles.actionText}>{formatNumber(likeCount)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 12,
    marginLeft: 2,
  },
  baseActionButton: {
    alignItems: 'center',
    width: 34,
  },
  moreMenuIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.semibold,
    marginTop: 1,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: Colors.transparent,
    textShadowRadius: 0,
  },
});

export const VideoOverlayActions = memo(VideoOverlayActionsComponent);
VideoOverlayActionsComponent.displayName = 'VideoOverlayActions';
