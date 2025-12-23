import React, { useMemo, useCallback } from 'react';
import { Tabs, router, useSegments } from 'expo-router';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Avatar } from '../../src/components/ui/UI';
import Icon, { HomeIcon, ExploreIcon, NotificationIcon, UserIcon } from '../../src/components/ui/Icon';
import { getBottomNavBarHeight, isSmallScreen, isTablet } from '../../src/utils/helpers';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { NotificationIndicator } from '../../src/components/ui/NotificationIndicator';
import { useUserStore } from '../../src/stores/userStore';
import { useProfile } from '../../src/services/cache/ProfileCache';
import { tabRefs } from '../../src/utils/tabRefs';

// Move ProfileTabIcon outside component to prevent recreation on every render
const ProfileTabIcon = React.memo(({ color, focused, tabIconSize }: { color: string; focused: boolean; tabIconSize: number }) => {
  // Use specific selectors to prevent unnecessary re-renders
  const currentUserHandle = useUserStore((state) => state.currentUser?.handle);
  const savedAccountsLength = useUserStore((state) => state.savedAccounts.length);
  const { data: profileData } = useProfile(currentUserHandle);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();

  const hasMultipleAccounts = savedAccountsLength > 1;

  const handleProfileTabPress = useCallback((e: any) => {
    if (focused) {
      // Tab is already active - scroll to top
      tabRefs.profile?.scrollToTop();
    } else {
      // Tab is not active - navigate to profile
      router.push('/profile');
    }
  }, [focused]);

  return (
    <Pressable
      onPress={handleProfileTabPress}
      onLongPress={presentAccountSwitcher}
      delayLongPress={400}
    >
      {!hasMultipleAccounts ? (
        <UserIcon size={tabIconSize} color={color} />
      ) : (
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
      )}
    </Pressable>
  );
});

ProfileTabIcon.displayName = 'ProfileTabIcon';

// Move CaptureIcon outside component to prevent recreation
const CaptureIcon = React.memo(({ color, focused, captureSize, captureInner }: { color: string; focused: boolean; captureSize: number; captureInner: number }) => {
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
});

CaptureIcon.displayName = 'CaptureIcon';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmallDevice = isSmallScreen() || isTablet();
  const { hasUnread } = useUnreadCount();
  const segments = useSegments();
  
  const isTabActive = useCallback((routeName: string) => {
    const lastSegment = segments[segments.length - 1];
    if (routeName === 'index') {
      // Index is active if we're at the tabs root (last segment is 'index' or we're in (tabs) without other tab segments)
      return lastSegment === 'index' || (!segments.includes('explore') && !segments.includes('activity') && !segments.includes('profile') && !segments.includes('create'));
    }
    return lastSegment === routeName;
  }, [segments]);

  const tabIconSize = useMemo(() => Math.round(Math.max(26, Math.min(36, width * 0.085))), [width]);
  const captureSize = useMemo(() => Math.round(tabIconSize * 1.15), [tabIconSize]);
  const captureInner = useMemo(() => Math.round(captureSize * 0.82), [captureSize]);

  const handleDoubleTap = useCallback((routeName: string) => {
    switch (routeName) {
      case 'index':
        tabRefs.home?.scrollToTop();
        break;
      case 'explore':
        tabRefs.explore?.scrollToTop();
        break;
      case 'activity':
        tabRefs.activity?.scrollToTop();
        break;
      case 'profile':
        tabRefs.profile?.scrollToTop();
        break;
    }
  }, []);

  // Memoize screenOptions to prevent React Navigation from thinking props changed
  const screenOptions = useMemo(() => {
    return ({ route }: { route: any }) => ({
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarShowLabel: false,
      tabBarStyle: route.name === 'create' ? {
        display: 'none' as const,
      } : {
        backgroundColor: (route.name === 'explore' || route.name === 'activity') ? Colors.black : 'transparent',
        paddingTop: isSmallDevice ? 2 : 6,
        paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom : 0,
        shadowOpacity: 0,
        borderTopWidth: 0,
        elevation: 0,
        position: 'absolute' as const,
        borderColor: 'transparent',
      },
      tabBarBackground: () => (
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.35)']}
          style={{ flex: 1 }}
          pointerEvents="none"
        />
      ),
      tabBarActiveTintColor: '#fff',
      tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.70)',
      tabBarButton: (props: any) => {
        // Only handle scroll-to-top for tabs that have scroll/focus functionality
        if (route.name === 'create') {
          // Create tab doesn't have scroll-to-top behavior, use default
          return <Pressable {...props} />;
        }

        const isActive = isTabActive(route.name);

        return (
          <Pressable
            {...props}
            onPress={(e: any) => {
              if (isActive) {
                // Tab is already active
                if (route.name === 'index') {
                  // Home tab: refresh feed and scroll to top
                  tabRefs.home?.refresh();
                  handleDoubleTap(route.name);
                } else if (route.name === 'explore' && tabRefs.explore?.isSearchActive()) {
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
            delayLongPress={400}
          />
        );
      },
      tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => {
        switch (route.name) {
          case 'index':
            return <HomeIcon size={tabIconSize} color={color} />;
          case 'explore':
            return <ExploreIcon size={tabIconSize} color={color} style={{ transform: [{ scaleX: -1 }] }} />;
          case 'activity':
            return (
              <View style={{ position: 'relative' }}>
                <NotificationIcon size={tabIconSize} color={color} />
                <NotificationIndicator 
                  hasUnread={hasUnread} 
                  size="small" 
                  position="top-right" 
                />
              </View>
            );
          case 'create':
            return <CaptureIcon color={color} focused={focused} captureSize={captureSize} captureInner={captureInner} />;
          case 'profile':
            return <ProfileTabIcon color={color} focused={focused} tabIconSize={tabIconSize} />;
          default:
            return <Icon name="home" size={tabIconSize} color={color} />;
        }
      },
    });
  }, [isSmallDevice, insets.bottom, isTabActive, handleDoubleTap, tabIconSize, captureSize, captureInner, hasUnread]);

  return (
    <Tabs
      screenOptions={screenOptions}
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
