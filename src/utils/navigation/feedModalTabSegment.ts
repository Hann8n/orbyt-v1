import { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';

export const FEED_MODAL_TAB_SEGMENTS = ['home', 'explore', 'activity', 'profile'] as const;

export type FeedModalTabSegment = (typeof FEED_MODAL_TAB_SEGMENTS)[number];

function isFeedModalTabSegment(s: string): s is FeedModalTabSegment {
  return (FEED_MODAL_TAB_SEGMENTS as readonly string[]).includes(s);
}

export function useFeedModalTabSegment(): FeedModalTabSegment {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const lastFocusedTab = useDetailNavTabStore(s => s.lastFocusedDetailNavTab);

  return useMemo(() => {
    const tabNav = navigation.getParent?.();
    if (!tabNav) {
      return lastFocusedTab;
    }

    const tabState = tabNav.getState?.();
    if (!tabState || tabState.type !== 'tab') {
      return lastFocusedTab;
    }

    const activeRoute = tabState.routes[tabState.index ?? 0];
    if (activeRoute && isFeedModalTabSegment(activeRoute.name)) {
      return activeRoute.name;
    }

    return lastFocusedTab;
  }, [navigation, lastFocusedTab]);
}
