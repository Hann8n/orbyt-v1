import React, { useMemo } from 'react';
import type { TFunction } from 'i18next';
import Reanimated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { NativePressable } from '@/components/ui/NativePressable';
import { Colors } from '@/theme';
import { FontFamily, Typography } from '@/utils/components/typography';

import { exploreScreenStyles as styles } from './ExploreScreenStyles';
import type { ExploreSearchTabId } from './types';

type Props = {
  tabId: ExploreSearchTabId;
  tabIndex: number;
  onPress: () => void;
  indicatorScrollProgress: SharedValue<number>;
  t: TFunction;
};

export const ExploreSearchTabIndicator = React.memo(
  ({ tabId, tabIndex, onPress, indicatorScrollProgress, t }: Props) => {
    const label = useMemo(() => {
      if (tabId === 'recently-visited') return t('feed.recentlyVisited');
      if (tabId === 'profiles') return t('feed.people');
      return t('feed.feeds');
    }, [tabId, t]);

    const fontSize = Typography.sizes.h3;
    const animatedStyle = useAnimatedStyle(() => {
      'worklet';
      const progress = indicatorScrollProgress.value;
      const isActive = Math.round(progress) === tabIndex;
      const distance = Math.abs(progress - tabIndex);
      const opacity = isActive ? 1 : Math.max(0.3, 1 - distance * 0.4);

      return {
        color: isActive ? Colors.neutral[50] : Colors.neutral[500],
        fontSize,
        fontWeight: isActive ? ('bold' as const) : ('600' as const),
        fontFamily: isActive ? FontFamily.bold : FontFamily.semibold,
        opacity,
      };
    }, [tabIndex, fontSize]);

    return (
      <NativePressable onPress={onPress} style={styles.indicatorItem}>
        <Reanimated.Text style={animatedStyle}>{label}</Reanimated.Text>
      </NativePressable>
    );
  }
);
ExploreSearchTabIndicator.displayName = 'ExploreSearchTabIndicator';
