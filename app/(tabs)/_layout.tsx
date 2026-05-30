import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSegments } from 'expo-router';
import { Tabs, TabSlot, TabList, TabTrigger } from 'expo-router/ui';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { TAB_BAR_INACTIVE_TINT } from '@/utils/formatting/colors';
import { getDetailNavTabIfInsideTabs } from '@/utils/navigation/detailRoutes';
import { Colors } from '@/theme';
import { AppTabBar, AppTabBarButton } from '@/components/layout/navigation/AppTabBar';

const homeIcon = require('@/assets/tab-icons/png/home_3_cute.png');
const exploreIcon = require('@/assets/tab-icons/png/search_2_cute.png');
const activityIcon = require('@/assets/tab-icons/png/inbox_2_cute.png');
const profileIcon = require('@/assets/tab-icons/png/badge_cute.png');

/**
 * While a root modal (e.g. settings) is focused, `useSegments()` no longer includes `(tabs)`; we skip
 * updates so `lastFocusedDetailNavTab` stays the tab the user was on before the modal.
 */
function DetailNavTabSegmentSync() {
  const segments = useSegments();
  const setLastFocused = useDetailNavTabStore(s => s.setLastFocusedDetailNavTab);

  useLayoutEffect(() => {
    const tab = getDetailNavTabIfInsideTabs(segments);
    if (tab) {
      setLastFocused(tab);
    }
  }, [segments, setLastFocused]);

  return null;
}

/**
 * Bottom tabs using expo-router/ui headless primitives with a fully JS-rendered, solid tab bar
 * (AppTabBar). The bar is in-flow: TabSlot fills the area above it so each screen's viewport
 * already excludes the bar height — no manual bottom-inset math needed.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { totalUnreadCount } = useUnreadCount();
  return (
    <Tabs>
      <DetailNavTabSegmentSync />
      <TabSlot detachInactiveScreens={false} />
      <TabList asChild>
        <AppTabBar>
          <TabTrigger name="home" href="/home" asChild>
            <AppTabBarButton
              source={homeIcon}
              activeTint={Colors.neutral[0]}
              inactiveTint={TAB_BAR_INACTIVE_TINT}
              accessibilityLabel={t('tabs.home')}
            />
          </TabTrigger>

          <TabTrigger name="explore" href="/explore" asChild>
            <AppTabBarButton
              source={exploreIcon}
              activeTint={Colors.neutral[0]}
              inactiveTint={TAB_BAR_INACTIVE_TINT}
              accessibilityLabel={t('tabs.explore')}
            />
          </TabTrigger>

          <TabTrigger name="activity" href="/activity" asChild>
            <AppTabBarButton
              source={activityIcon}
              activeTint={Colors.neutral[0]}
              inactiveTint={TAB_BAR_INACTIVE_TINT}
              badgeCount={totalUnreadCount}
              accessibilityLabel={t('tabs.chats')}
            />
          </TabTrigger>

          <TabTrigger name="profile" href="/profile" asChild>
            <AppTabBarButton
              source={profileIcon}
              activeTint={Colors.neutral[0]}
              inactiveTint={TAB_BAR_INACTIVE_TINT}
              accessibilityLabel={t('tabs.profile')}
            />
          </TabTrigger>
        </AppTabBar>
      </TabList>
    </Tabs>
  );
}
