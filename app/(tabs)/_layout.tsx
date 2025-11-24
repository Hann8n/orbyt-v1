import React, { useState } from 'react';
import { Tabs, router, useSegments } from 'expo-router';
import { View, TouchableOpacity, Platform, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '../../src/components/ui/UI';
import { Loading3FillIcon } from '../../src/components/ui/Icon';
import Icon, { HomeIcon, ExploreIcon, NotificationIcon, ProfileIcon } from '../../src/components/ui/Icon';
import { getBottomNavBarHeight, isSmallScreen, isTablet } from '../../src/utils/helpers';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { NotificationIndicator } from '../../src/components/ui/NotificationIndicator';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmallDevice = isSmallScreen() || isTablet();
  const { hasUnread } = useUnreadCount();
  const segments = useSegments();
  const isCreateScreen = segments.includes('create');

  const tabIconSize = Math.round(Math.max(26, Math.min(36, width * 0.085)));
  const tabIconSizeSm = Math.max(24, Math.min(34, tabIconSize - 2));
  const captureOuter = Math.round(Math.max(34, Math.min(48, width * 0.11)));
  const captureInner = Math.round(captureOuter * 0.78);

  const CaptureTabButton = ({ children }: { children?: React.ReactNode }) => {
    const [isPreparing, setIsPreparing] = useState(false);

    const handleCapturePress = async () => {
      try {
        // Navigate to camera capture screen
        router.push('/create');
      } catch (e) {
        Alert.alert('Error', 'Failed to open camera. Please try again.');
      }
    };

    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity
          onPress={handleCapturePress}
          activeOpacity={0.8}
          style={{
            width: captureOuter,
            height: captureOuter,
            borderRadius: captureOuter / 2,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: Colors.black,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
          }}
          disabled={isPreparing}
        >
          <View style={{
            width: captureOuter - 2,
            height: captureOuter - 2,
            borderRadius: (captureOuter - 2) / 2,
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
              backgroundColor: isPreparing ? 'rgba(255, 255, 255, 0.5)' : '#fff',
            }} />
          </View>
          {isPreparing && (
            <View style={{
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: captureOuter / 2,
            }}>
              <Loading3FillIcon size={24} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const ProfileTabButton = ({ children }: { children?: React.ReactNode }) => {
    const { presentAccountSwitcher } = useGlobalAccountSwitcher();

    const handlePress = () => {
      // Navigate to profile screen
      router.push('/profile');
    };

    const handleLongPress = () => {
      // Open account switcher
      presentAccountSwitcher();
    };

    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={handleLongPress}
          activeOpacity={0.7}
          style={{
            width: tabIconSize,
            height: tabIconSize,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </TouchableOpacity>
      </View>
    );
  };

  const bottomNavBarHeight = getBottomNavBarHeight(insets);

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: false,
          tabBarStyle: isCreateScreen ? {
            display: 'none',
          } : {
            backgroundColor: (route.name === 'explore' || route.name === 'activity') ? Colors.black : 'transparent',
            height: bottomNavBarHeight,
            paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom - 8, 4) : 4,
            paddingTop: isSmallDevice ? 2 : 6,
            shadowOpacity: 0,
            borderTopWidth: 0,
            elevation: 0,
            position: 'absolute',
            zIndex: 10,
          },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
          tabBarIcon: ({ color }) => {
            switch (route.name) {
              case 'index':
                return <HomeIcon size={tabIconSize} color={color as string} />;
              case 'explore':
                return <ExploreIcon size={tabIconSize} color={color as string} style={{ transform: [{ scaleX: -1 }] }} />;
              case 'activity':
                return (
                  <View style={{ position: 'relative' }}>
                    <NotificationIcon size={tabIconSizeSm} color={color as string} />
                    <NotificationIndicator 
                      hasUnread={hasUnread} 
                      size="small" 
                      position="top-right" 
                    />
                  </View>
                );
              case 'profile':
                return <ProfileIcon size={tabIconSize} color={color as string} />;
              default:
                return <Icon name="home" size={tabIconSizeSm} color={color as string} />;
            }
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
        <Tabs.Screen
          name="create"
          options={{
            title: 'Create',
            tabBarButton: (props) => <CaptureTabButton {...props} />,
          }}
        />
        <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        <Tabs.Screen 
          name="profile" 
          options={{ 
            title: 'Profile',
            tabBarButton: (props) => <ProfileTabButton {...props} />,
          }} 
        />
      </Tabs>
      {!isCreateScreen && (
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.2)', 'rgba(0, 0, 0, 0.5)']}
          locations={[0, 0.6, 1]}
          style={[
            styles.gradient,
            {
              bottom: 0,
              height: bottomNavBarHeight + 15,
            }
          ]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
});
