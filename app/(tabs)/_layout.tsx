import React, { useState } from 'react';
import { Tabs, router, useSegments } from 'expo-router';
import { View, TouchableOpacity, Platform, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';

import { Colors, Avatar } from '../../src/components/ui/UI';
import { Loading3FillIcon } from '../../src/components/ui/Icon';
import Icon, { HomeIcon, ExploreIcon, NotificationIcon, UserIcon } from '../../src/components/ui/Icon';
import { getBottomNavBarHeight, isSmallScreen, isTablet } from '../../src/utils/helpers';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { NotificationIndicator } from '../../src/components/ui/NotificationIndicator';
import { useUserStore } from '../../src/stores/userStore';
import { useProfile } from '../../src/services/cache/ProfileCache';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmallDevice = isSmallScreen() || isTablet();
  const { hasUnread } = useUnreadCount();
  const segments = useSegments();
  const isCreateScreen = segments.includes('create');

  const tabIconSize = Math.round(Math.max(26, Math.min(36, width * 0.085)));
  const captureSize = Math.round(tabIconSize * 1.15);
  const captureInner = Math.round(captureSize * 0.82);

  const CaptureIcon = ({ color, focused }: { color: string; focused: boolean }) => {
    return (
      <View style={{
        width: captureSize,
        height: captureSize,
        borderRadius: captureSize / 2,
        borderWidth: 1.5,
        borderColor: Colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}>
        <View style={{
          width: captureInner,
          height: captureInner,
          borderRadius: captureInner / 2,
          backgroundColor: '#fff',
        }} />
      </View>
    );
  };

  const ProfileTabIcon = ({ color, focused }: { color: string; focused: boolean }) => {
    const currentUserHandle = useUserStore((state) => state.currentUser?.handle);
    const savedAccounts = useUserStore((state) => state.savedAccounts);
    const { data: profileData } = useProfile(currentUserHandle);
    const { presentAccountSwitcher } = useGlobalAccountSwitcher();

    const hasMultipleAccounts = savedAccounts.length > 1;

    if (!hasMultipleAccounts) {
      return <UserIcon size={tabIconSize} color={color as string} />;
    }

    return (
      <TouchableOpacity
        onPress={() => router.push('/profile')}
        onLongPress={presentAccountSwitcher}
        activeOpacity={0.7}
      >
        <View style={{ position: 'relative' }}>
          <Avatar
            uri={profileData?.avatar}
            type="profile"
            size={tabIconSize}
            showRing={true}
            profileColors={profileData?.profileColors ? {
              backgroundColor: profileData.profileColors.backgroundColor,
              textColor: profileData.profileColors.foregroundColor || color,
              foregroundColor: profileData.profileColors.foregroundColor || color,
            } : undefined}
            ringColor={profileData?.profileColors?.foregroundColor || color}
          />
          {!focused && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: tabIconSize / 2,
                backgroundColor: 'rgba(128, 128, 128, 0.5)',
              }}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
        tabBarStyle: isCreateScreen ? {
          display: 'none',
        } : {
          backgroundColor: (route.name === 'explore' || route.name === 'activity') ? Colors.black : 'transparent',
          paddingTop: isSmallDevice ? 2 : 6,
          paddingBottom: insets.bottom,
          shadowOpacity: 0,
          borderTopWidth: 0,
          elevation: 0,
          position: 'absolute',
          borderColor: 'transparent',
        },
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: (route.name === 'explore' || route.name === 'activity') ? Colors.black : 'transparent' }} />
        ),
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.75)',
          tabBarIcon: ({ color, focused }) => {
            switch (route.name) {
              case 'index':
                return <HomeIcon size={tabIconSize} color={color as string} />;
              case 'explore':
                return <ExploreIcon size={tabIconSize} color={color as string} style={{ transform: [{ scaleX: -1 }] }} />;
              case 'activity':
                return (
                  <View style={{ position: 'relative' }}>
                    <NotificationIcon size={tabIconSize} color={color as string} />
                    <NotificationIndicator 
                      hasUnread={hasUnread} 
                      size="small" 
                      position="top-right" 
                    />
                  </View>
                );
              case 'create':
                return <CaptureIcon color={color as string} focused={focused} />;
              case 'profile':
                return <ProfileTabIcon color={color as string} focused={focused} />;
              default:
                return <Icon name="home" size={tabIconSize} color={color as string} />;
            }
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
        <Tabs.Screen name="create" options={{ title: 'Create' }} />
        <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        <Tabs.Screen 
          name="profile" 
          options={{ 
            title: 'Profile',
          }} 
        />
      </Tabs>
  );
}
