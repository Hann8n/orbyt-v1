import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';
import { useFeedSettings } from '@/stores/userStore';
import { useUserStore } from '@/stores/userStore';
import { Colors } from '@/theme';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { getTabBarActiveTintFromProfile, TAB_BAR_INACTIVE_TINT } from '@/utils/formatting/colors';
import { getDetailNavTabIfInsideTabs } from '@/utils/navigation/detailRoutes';

/** Default tab when opening `/(tabs)` without a segment (avoids resolving a missing `index` tab). */
export const unstable_settings = {
  initialRouteName: 'home',
};

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
  const { nativeTabsEnabled } = useFeedSettings();
  const profileColors = useUserStore(state => state.currentUserProfileColors);
  const profileAccentColor = useUserStore(state => state.currentUserProfileAccentColor);
  const { totalUnreadCount } = useUnreadCount();
  const activeTint = profileAccentColor ?? getTabBarActiveTintFromProfile(profileColors);

  return (
    <>
      <DetailNavTabSegmentSync />
      <NativeTabs
        backgroundColor={Colors.black}
        blurEffect="none"
        labelVisibilityMode="unlabeled"
        tintColor={activeTint}
        iconColor={{
          default: TAB_BAR_INACTIVE_TINT,
          selected: activeTint,
        }}
        badgeBackgroundColor={activeTint}
        disableTransparentOnScrollEdge={true}
      >
        {/* Matches `index.tsx` redirect; hidden so deep links / old state don’t show a fifth tab */}
        <NativeTabs.Trigger name="index" hidden>
          <NativeTabs.Trigger.Label hidden />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="home">
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/home_3_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.home')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="explore"
          {...(nativeTabsEnabled ? { role: 'search' as const } : {})}
        >
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/search_2_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.explore')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="activity">
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/inbox_2_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.activity')}</NativeTabs.Trigger.Label>
          {totalUnreadCount > 0 && (
            <NativeTabs.Trigger.Badge>
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount.toString()}
            </NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon src={require('@/assets/tab-icons/png/badge_cute.png')} />
          <NativeTabs.Trigger.Label hidden>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
