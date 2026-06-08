import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useCurrentUser } from '@/stores/userStore';
import { useOrbytProfile } from '@/services/colors';
import {
  TAB_BAR_INACTIVE_TINT,
  getProfileColors,
  getTabBarActiveTintFromProfile,
} from '@/utils/formatting/colors';
import { getDetailNavTabIfInsideTabs } from '@/utils/navigation/detailRoutes';
import { Colors } from '@/theme/colors';

/**
 * While a root modal (e.g. settings) is focused, `useSegments()` no longer includes `(tabs)`; we skip
 * updates so `lastFocusedDetailNavTab` stays the tab the user was on before the modal.
 */
function DetailNavTabSegmentSync() {
  const segments = useSegments();
  const setLastFocused = useDetailNavTabStore(s => s.setLastFocusedDetailNavTab);

  useEffect(() => {
    const tab = getDetailNavTabIfInsideTabs(segments);
    if (tab) {
      setLastFocused(tab);
    }
  }, [segments, setLastFocused]);

  return null;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const { data: orbytRecord } = useOrbytProfile(currentUser?.did ?? null);
  const profileColors = getProfileColors(orbytRecord?.colors ?? null);
  const activeTint = getTabBarActiveTintFromProfile(profileColors);
  const { totalUnreadCount } = useUnreadCount();

  return (
    <>
      <DetailNavTabSegmentSync />
      <NativeTabs
        backgroundColor={Colors.black}
        labelVisibilityMode="unlabeled"
        tintColor={activeTint}
        iconColor={{
          default: TAB_BAR_INACTIVE_TINT,
          selected: activeTint,
        }}
        badgeBackgroundColor={activeTint}
        disableTransparentOnScrollEdge={true}
        shadowColor={Colors.black}
      >
        <NativeTabs.Trigger name="home" disableAutomaticContentInsets disableScrollToTop>
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/home_3_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.home')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="explore"
          role={isLiquidGlassAvailable() ? 'search' : undefined}
          disableAutomaticContentInsets
        >
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/search_2_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.explore')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="activity" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/inbox_2_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.chats')}</NativeTabs.Trigger.Label>
          {totalUnreadCount > 0 && (
            <NativeTabs.Trigger.Badge>
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount.toString()}
            </NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/badge_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
