import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label, Badge } from 'expo-router/unstable-native-tabs';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { useUserStore, useFeedSettings } from '../../src/stores/userStore';
import { useProfile } from '../../src/services/data/ProfileService';
import { Colors } from '../../src/components/ui/UI';
import CustomBottomTabBar from '../../src/components/ui/CustomBottomTabBar';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';

export default function TabsLayout() {
  const currentUserHandle = useUserStore(state => state.currentUser?.handle);
  const { data: profileData } = useProfile(currentUserHandle);
  const { nativeTabsEnabled } = useFeedSettings();
  const { totalUnreadCount } = useUnreadCount();

  // Native tabs: use light color from user colors
  const nativeTintColor =
    profileData?.profileColors?.lighterColor ||
    profileData?.profileColors?.foregroundColor ||
    Colors.white;

  // Custom JavaScript tabs: use white
  const customTintColor = Colors.white;
  const customInactiveTintColor = 'rgba(243, 245, 254, 0.60)'; // Colors.white at 60% opacity

  // Check if liquid glass is available (needed for role="search" on newer iOS versions)
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  // Experimental: Use native tabs if enabled
  if (nativeTabsEnabled) {
    return (
      <NativeTabs
        tintColor={nativeTintColor}
        badgeBackgroundColor={Colors.badgeGreen}
        disableTransparentOnScrollEdge={true}
      >
        <NativeTabs.Trigger name="index">
          <Icon src={require('../../src/assets/tab-icons/png/home_5_fill.png')} />
          <Label hidden={useLiquidGlass}>Home</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="explore" {...(useLiquidGlass && { role: 'search' })}>
          <Icon src={require('../../src/assets/tab-icons/png/search_2_fill.png')} />
          <Label hidden={useLiquidGlass}>Explore</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="activity">
          <Icon src={require('../../src/assets/tab-icons/png/flash_fill.png')} />
          <Label hidden={useLiquidGlass}>Activity</Label>
          {totalUnreadCount > 0 && (
            <Badge>{totalUnreadCount > 99 ? '99+' : totalUnreadCount.toString()}</Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <Icon src={require('../../src/assets/tab-icons/png/user_3_fill.png')} />
          <Label hidden={useLiquidGlass}>Profile</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  // Use Expo Router's Tabs component following the guide pattern
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: customTintColor,
        tabBarInactiveTintColor: customInactiveTintColor,
        tabBarBadgeStyle: {
          backgroundColor: Colors.badgeGreen,
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
          {...props}
          tintColor={customTintColor}
          inactiveTintColor={customInactiveTintColor}
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
          tabBarStyle: {
            ...Platform.select({
              ios: {
                position: 'absolute',
              },
              default: {},
            }),
            backgroundColor: Colors.black,
          },
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
          tabBarStyle: {
            ...Platform.select({
              ios: {
                position: 'absolute',
              },
              default: {},
            }),
            backgroundColor: Colors.black,
          },
        }}
      />

      <Tabs.Screen name="profile" options={{}} />
    </Tabs>
  );
}
