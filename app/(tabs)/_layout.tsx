import React, { useState } from 'react';
import { Tabs, router } from 'expo-router';
import { View, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { Colors } from '../../src/components/ui/UI';
import Icon, { HomeIcon, ExploreIcon, NotificationIcon, ProfileIcon } from '../../src/components/ui/Icon';
import { getBottomNavBarHeight, isSmallScreen, isTablet } from '../../src/utils/helpers';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmallDevice = isSmallScreen() || isTablet();

  const tabIconSize = Math.round(Math.max(26, Math.min(36, width * 0.085)));
  const tabIconSizeSm = Math.max(24, Math.min(34, tabIconSize - 2));
  const captureOuter = Math.round(Math.max(34, Math.min(48, width * 0.11)));
  const captureInner = Math.round(captureOuter * 0.78);

  const CaptureTabButton = ({ children }: { children?: React.ReactNode }) => {
    const [isPreparing, setIsPreparing] = useState(false);

    const handleCapturePress = async () => {
      try {
        handleGalleryPick();
      } catch {}
    };

    const handleGalleryPick = async () => {
      try {
        setIsPreparing(true);
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'videos',
          allowsMultipleSelection: false,
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) {
          setIsPreparing(false);
          return;
        }
        const asset = result.assets[0];
        if (!asset.uri) {
          setIsPreparing(false);
          Alert.alert('Error', 'No video selected.');
          return;
        }
        let videoPath = asset.uri.startsWith('file://') ? asset.uri : `file://${asset.uri}`;
        const fileInfo = await FileSystem.getInfoAsync(videoPath);
        if (!fileInfo.exists) {
          setIsPreparing(false);
          Alert.alert('Error', 'Selected video file does not exist or is not accessible.');
          return;
        }
        const destPath = `${FileSystem.cacheDirectory}gallery_${Date.now()}.mp4`;
        await FileSystem.copyAsync({ from: videoPath, to: destPath });
        const videoFile = {
          path: destPath.startsWith('file://') ? destPath : `file://${destPath}`,
          duration: asset.duration || 0,
          width: asset.width || 0,
          height: asset.height || 0,
        } as any;
        setIsPreparing(false);
        router.push({ pathname: '/post/[id]', params: { id: 'new' } });
      } catch (e) {
        setIsPreparing(false);
        Alert.alert('Error', 'Failed to access gallery. Please try again.');
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
              <ActivityIndicator size="small" color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: (route.name === 'explore' || route.name === 'notifications') ? Colors.black : 'transparent',
          height: getBottomNavBarHeight(insets),
          paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom - 8, 4) : 4,
          paddingTop: isSmallDevice ? 2 : 6,
          shadowOpacity: 0,
          borderTopWidth: 0,
          elevation: 0,
          position: 'absolute',
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
        tabBarIcon: ({ color }) => {
          switch (route.name) {
            case 'index':
              return <HomeIcon size={tabIconSize} color={color as string} />;
            case 'explore':
              return <ExploreIcon size={tabIconSize} color={color as string} style={{ transform: [{ scaleX: -1 }] }} />;
            case 'notifications':
              return <NotificationIcon size={tabIconSizeSm} color={color as string} />;
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
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
