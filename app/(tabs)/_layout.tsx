import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { useCurrentUserOrbytShellColors } from '@/services/colors';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { TAB_BAR_INACTIVE_TINT } from '@/utils/formatting/colors';
import { Colors } from '@/theme/colors';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { activeTint } = useCurrentUserOrbytShellColors();
  const { totalUnreadCount } = useUnreadCount();

  return (
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
        <NativeTabs.Trigger name="home" disableAutomaticContentInsets>
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
