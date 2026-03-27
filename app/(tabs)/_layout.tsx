import { useTranslation } from 'react-i18next';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useUserStore, isIosLiquidGlassAvailable } from '../../src/stores/userStore';
import { Colors } from '../../src/theme';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import {
  getTabBarActiveTintFromProfile,
  TAB_BAR_INACTIVE_TINT,
} from '../../src/utils/formatting/colors';

export default function TabsLayout() {
  const { t } = useTranslation();
  const profileColors = useUserStore(state => state.currentUserProfileColors);
  const { totalUnreadCount } = useUnreadCount();
  const hideTabLabels = isIosLiquidGlassAvailable;

  return (
    <NativeTabs
      backgroundColor={Colors.black}
      blurEffect="none"
      labelVisibilityMode={hideTabLabels ? undefined : 'labeled'}
      tintColor={getTabBarActiveTintFromProfile(profileColors)}
      iconColor={{
        default: TAB_BAR_INACTIVE_TINT,
        selected: getTabBarActiveTintFromProfile(profileColors),
      }}
      badgeBackgroundColor={Colors.teal[600]}
      disableTransparentOnScrollEdge={true}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon src={require('../../src/assets/tab-icons/png/home_3_cute.png')} />
        <NativeTabs.Trigger.Label hidden={hideTabLabels}>{t('tabs.home')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore" {...(hideTabLabels && { role: 'search' })}>
        <NativeTabs.Trigger.Icon
          src={require('../../src/assets/tab-icons/png/search_2_cute.png')}
        />
        <NativeTabs.Trigger.Label hidden={hideTabLabels}>
          {t('tabs.explore')}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Icon src={require('../../src/assets/tab-icons/png/inbox_2_cute.png')} />
        <NativeTabs.Trigger.Label hidden={hideTabLabels}>
          {t('tabs.activity')}
        </NativeTabs.Trigger.Label>
        {totalUnreadCount > 0 && (
          <NativeTabs.Trigger.Badge>
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount.toString()}
          </NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon src={require('../../src/assets/tab-icons/png/badge_cute.png')} />
        <NativeTabs.Trigger.Label hidden={hideTabLabels}>
          {t('tabs.profile')}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
