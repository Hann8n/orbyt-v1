import React, { useState, useRef } from 'react';
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
import { tabRefs } from '../../src/utils/tabRefs';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmallDevice = isSmallScreen() || isTablet();
  const { hasUnread } = useUnreadCount();
  const segments = useSegments();
  const isCreateScreen = segments.includes('create');
  
  const isTabActive = (routeName: string) => {
    const lastSegment = segments[segments.length - 1];
    if (routeName === 'index') {
      // Index is active if we're at the tabs root (last segment is 'index' or we're in (tabs) without other tab segments)
      return lastSegment === 'index' || (!segments.includes('explore') && !segments.includes('activity') && !segments.includes('profile') && !segments.includes('create'));
    }
    return lastSegment === routeName;
  };

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

    const handleProfileTabPress = (e: any) => {
      if (focused) {
        // Tab is already active - scroll to top
        handleDoubleTap('profile');
      } else {
        // Tab is not active - navigate to profile
        router.push('/profile');
      }
    };

    return (
      <TouchableOpacity
        onPress={handleProfileTabPress}
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

  const handleDoubleTap = (routeName: string) => {
    switch (routeName) {
      case 'index':
        // Home: Scroll to top
        tabRefs.home?.scrollToTop();
        break;
      case 'explore':
        // Explore: Scroll to top
        tabRefs.explore?.scrollToTop();
        break;
      case 'activity':
        // Activity: Scroll to top
        tabRefs.activity?.scrollToTop();
        break;
      case 'profile':
        // Profile: Scroll to top
        tabRefs.profile?.scrollToTop();
        break;
    }
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
        tabBarButton: (props: any) => {
          // Only handle scroll-to-top for tabs that have scroll/focus functionality
          if (route.name === 'create') {
            // Create tab doesn't have scroll-to-top behavior, use default
            return <TouchableOpacity {...props} />;
          }

          const isActive = isTabActive(route.name);

          return (
            <TouchableOpacity
              {...props}
              onPress={(e: any) => {
                if (isActive) {
                  // Tab is already active
                  if (route.name === 'explore' && tabRefs.explore?.isSearchActive()) {
                    // If search is active, dismiss it
                    tabRefs.explore?.dismissSearch();
                  } else {
                    // Otherwise scroll to top
                    handleDoubleTap(route.name);
                  }
                } else {
                  // Tab is not active - use default navigation
                  props.onPress?.(e);
                }
              }}
              onLongPress={() => {
                // Long press on explore tab focuses search
                if (route.name === 'explore') {
                  tabRefs.explore?.focusSearch();
                }
              }}
            />
          );
        },
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
