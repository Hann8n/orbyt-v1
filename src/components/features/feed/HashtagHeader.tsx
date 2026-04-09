import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/theme';
import { Typography, FontFamily } from '@/utils/components/typography';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getEffectiveTopInset } from '@/utils/device/screen';
import { PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET } from '@/components/layout/detail/ProfileChannelFeedLayout';

export interface HashtagHeaderProps {
  feedOption: string;
  insets: EdgeInsets;
}

/**
 * Shared hashtag header component for feed screens.
 * Displays hashtag with # symbol, excluding orbyt-channel-* prefixes.
 */
export const HashtagHeader: React.FC<HashtagHeaderProps> = ({ feedOption, insets }) => {
  const isHashtagFeed = feedOption?.startsWith('hashtag:');

  if (!isHashtagFeed) {
    return null;
  }

  const hashtagWithSort = feedOption.substring(8);
  const hashtag = hashtagWithSort ? hashtagWithSort.split(':')[0] : null;

  if (!hashtag) {
    return null;
  }

  const isOrbytChannelHashtag =
    hashtag.startsWith('orbyt-channel-') || hashtag.startsWith('orbyt-');

  if (isOrbytChannelHashtag) {
    return null;
  }

  const hookTop = typeof insets?.top === 'number' ? insets.top : 0;
  const rowTop = getEffectiveTopInset(hookTop) + PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET;
  // Center 30px line with the 40px-tall back row (same as `TabFullScreenBackButton`).
  const top = rowTop + 5;

  return (
    <View style={[styles.hashtagHeaderContainer, { top }]}>
      <Text style={styles.hashtagSymbol}>#</Text>
      <Text style={styles.hashtagText}>{hashtag}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
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
    fontSize: Typography.sizes.title,
    color: Colors.neutral[50],
    fontFamily: FontFamily.medium,
    includeFontPadding: false,
    lineHeight: Typography.lineHeights.title,
  },
  hashtagText: {
    fontSize: Typography.sizes.title,
    color: Colors.neutral[50],
    fontFamily: FontFamily.bold,
    includeFontPadding: false,
    lineHeight: Typography.lineHeights.title,
  },
});
