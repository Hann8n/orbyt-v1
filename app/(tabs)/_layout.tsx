import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

import { useUserStore, useFeedSettings } from '../../src/stores/userStore';
import { useProfile } from '../../src/services/cache/ProfileCache';
import { Colors } from '../../src/components/ui/UI';
import CustomBottomTabBar from '../../src/components/ui/CustomBottomTabBar';

export default function TabsLayout() {
  const currentUserHandle = useUserStore(state => state.currentUser?.handle);
  const { data: profileData } = useProfile(currentUserHandle);
  const { nativeTabsEnabled } = useFeedSettings();
  
  // Native tabs: use light color from user colors
  const nativeTintColor = profileData?.profileColors?.lighterColor || profileData?.profileColors?.foregroundColor || Colors.white;
  
  // Custom JavaScript tabs: use white
  const customTintColor = Colors.white;
  const customInactiveTintColor = 'rgba(243, 245, 254, 0.60)'; // Colors.white at 60% opacity

  // Check iOS version for role="search" support (iOS 16+)
  const iosVersion = Platform.OS === 'ios' ? parseFloat(Platform.Version as string) : 0;
  const supportsSearchRole = iosVersion >= 16.0;

  // Experimental: Use native tabs if enabled
  if (nativeTabsEnabled) {
    return (
      <NativeTabs tintColor={nativeTintColor}>
        <NativeTabs.Trigger name="index">
          <Icon src={require('../../src/assets/tab-icons/png/home_5_fill.png')} />
          <Label hidden />
        </NativeTabs.Trigger>
        
        <NativeTabs.Trigger name="explore">
          <Icon src={require('../../src/assets/tab-icons/png/search_2_fill.png')} />
          <Label hidden />
        </NativeTabs.Trigger>
        
        <NativeTabs.Trigger name="activity">
          <Icon src={require('../../src/assets/tab-icons/png/flash_fill.png')} />
          <Label hidden />
        </NativeTabs.Trigger>
        
        <NativeTabs.Trigger name="profile">
          <Icon src={require('../../src/assets/tab-icons/png/user_3_fill.png')} />
          <Label hidden />
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  // Use Expo Router's Tabs component with custom tabBar for optimized routing
  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Hide default tab bar, we use custom one
        }}
        tabBar={(props) => (
          <CustomBottomTabBar 
            {...props}
            tintColor={customTintColor} 
            inactiveTintColor={customInactiveTintColor} 
          />
        )}
      >
        <Tabs.Screen name="index" options={{ href: '/(tabs)/' }} />
        <Tabs.Screen name="explore" />
        <Tabs.Screen name="activity" />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="search" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});
