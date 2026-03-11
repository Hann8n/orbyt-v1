import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { useUserStore, useFeedSettings } from '../../src/stores/userStore';
import { Colors } from '../../src/theme';
import CustomBottomTabBar from '../../src/components/ui/CustomBottomTabBar';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import {
  getTabBarActiveTintFromProfile,
  TAB_BAR_INACTIVE_TINT,
} from '../../src/utils/formatting/colors';

export default function TabsLayout() {
  const { t } = useTranslation();
  const profileColors = useUserStore(state => state.currentUserProfileColors);
  const { nativeTabsEnabled } = useFeedSettings();
  const { totalUnreadCount } = useUnreadCount();

  const nativeTintColor = getTabBarActiveTintFromProfile(profileColors);
  const customTintColor = Colors.neutral[50];

  // Check if liquid glass is available (needed for role="search" on newer iOS versions)
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  // Experimental: Use native tabs if enabled (tint = lighter profile color)
  if (nativeTabsEnabled) {
    return (
      <NativeTabs
        tintColor={nativeTintColor}
        iconColor={{
          default: TAB_BAR_INACTIVE_TINT,
          selected: nativeTintColor,
        }}
        badgeBackgroundColor={Colors.teal[600]}
        disableTransparentOnScrollEdge={true}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon
            src={require('../../src/assets/tab-icons/png/home_5_fill.png')}
          />
          <NativeTabs.Trigger.Label hidden={useLiquidGlass}>
            {t('tabs.home')}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="explore" {...(useLiquidGlass && { role: 'search' })}>
          <NativeTabs.Trigger.Icon
            src={require('../../src/assets/tab-icons/png/search_2_fill.png')}
          />
          <NativeTabs.Trigger.Label hidden={useLiquidGlass}>
            {t('tabs.explore')}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="activity">
          <NativeTabs.Trigger.Icon src={require('../../src/assets/tab-icons/png/flash_fill.png')} />
          <NativeTabs.Trigger.Label hidden={useLiquidGlass}>
            {t('tabs.activity')}
          </NativeTabs.Trigger.Label>
          {totalUnreadCount > 0 && (
            <NativeTabs.Trigger.Badge>
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount.toString()}
            </NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon
            src={require('../../src/assets/tab-icons/png/user_3_fill.png')}
          />
          <NativeTabs.Trigger.Label hidden={useLiquidGlass}>
            {t('tabs.profile')}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  const blackAbsoluteTabBarStyle = {
    ...Platform.select({
      ios: {
        position: 'absolute' as const,
      },
      default: {},
    }),
    backgroundColor: Colors.black,
  };

  // Use Expo Router's Tabs component following the guide pattern
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: customTintColor,
        tabBarInactiveTintColor: TAB_BAR_INACTIVE_TINT,
        tabBarBadgeStyle: {
          backgroundColor: Colors.teal[600],
          color: '#fff',
        },
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
        // Performance optimizations for faster tab switching
        lazy: true, // Lazy load screens for better initial performance
        freezeOnBlur: true, // Freeze screens when not focused to prevent unnecessary re-renders
      }}
      tabBar={props => (
        <CustomBottomTabBar
          state={props.state}
          navigation={props.navigation}
          tintColor={customTintColor}
          inactiveTintColor={TAB_BAR_INACTIVE_TINT}
        />
      )}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: '/(tabs)/',
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          tabBarStyle: blackAbsoluteTabBarStyle,
        }}
      />

      <Tabs.Screen
        name="activity"
        options={{
          tabBarBadge:
            totalUnreadCount > 0
              ? totalUnreadCount > 99
                ? '99+'
                : totalUnreadCount.toString()
              : undefined,
          tabBarStyle: blackAbsoluteTabBarStyle,
        }}
      />

      <Tabs.Screen name="profile" options={{}} />
    </Tabs>
  );
}
