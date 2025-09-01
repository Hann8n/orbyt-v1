import React, { useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Platform, Dimensions, TouchableOpacity, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, HomeStackParamList, ExploreStackParamList, NotificationsStackParamList, ProfileStackParamList } from './types';
import type { HomeScreenRef } from '../types';

import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import CreateScreen from '../screens/CreateScreen';
import NotificationScreen from '../screens/NotificationScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChannelScreen from '../screens/ChannelScreen';
import Icon, { HomeIcon, ExploreIcon, NotificationIcon, ProfileIcon } from '../components/ui/Icon';
import { isSmallScreen, isTablet, getBottomNavBarHeight } from '../utils/helpers/screenSize';
import * as ImagePicker from 'expo-image-picker';
import VideoProcessingService from '../services/VideoProcessingService';
import * as FileSystem from 'expo-file-system/legacy';
import { useClearView } from '../stores/uiStore';
import { Colors } from '../components/ui/UI';
import { BORDER_RADIUS } from '../utils/constants';

const Tab = createBottomTabNavigator();
const HomeStackNavigator = createNativeStackNavigator<HomeStackParamList>();
const ExploreStackNavigator = createNativeStackNavigator<ExploreStackParamList>();
const NotificationsStackNavigator = createNativeStackNavigator<NotificationsStackParamList>();
const ProfileStackNavigator = createNativeStackNavigator<ProfileStackParamList>();

interface BottomTabNavigatorProps {
  onLogout: () => Promise<void>;
}

// Global ref for HomeScreen
const homeScreenRef = React.createRef<HomeScreenRef>();

// Create stack navigators for each tab that needs author profile access
const HomeStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <HomeStackNavigator.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <HomeStackNavigator.Screen 
      name="HomeScreen"
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    >
      {(props) => <HomeScreen {...props} ref={homeScreenRef} />}
    </HomeStackNavigator.Screen>
    <HomeStackNavigator.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
    <HomeStackNavigator.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </HomeStackNavigator.Navigator>
);

const ExploreStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <ExploreStackNavigator.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <ExploreStackNavigator.Screen 
      name="ExploreScreen" 
      component={ExploreScreen}
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    />
    <ExploreStackNavigator.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
    <ExploreStackNavigator.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </ExploreStackNavigator.Navigator>
);

const NotificationsStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <NotificationsStackNavigator.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <NotificationsStackNavigator.Screen 
      name="NotificationsScreen" 
      component={NotificationScreen}
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    />
    <NotificationsStackNavigator.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
    <NotificationsStackNavigator.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </NotificationsStackNavigator.Navigator>
);

// Profile tab with its own stack
const ProfileStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <ProfileStackNavigator.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <ProfileStackNavigator.Screen 
      name="ProfileScreen" 
      children={() => <ProfileScreen onLogout={onLogout} />}
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    />
    <ProfileStackNavigator.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </ProfileStackNavigator.Navigator>
);

const BottomTabNavigator: React.FC<BottomTabNavigatorProps> = ({ onLogout }) => {
  const [isHomeRefreshing, setIsHomeRefreshing] = useState(false);
  const [currentTab, setCurrentTab] = useState('Home');
  const lastHomeTapRef = useRef<number>(0);
  const resetTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isOnStackedScreen, setIsOnStackedScreen] = useState(false);
  const insets = useSafeAreaInsets();
  const isSmallDevice = isSmallScreen() || isTablet();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isClearViewMode } = useClearView();
  const { width } = useWindowDimensions();

  // Responsive sizing driven by width and safe area (slightly reduced)
  const tabIconSize = Math.round(Math.max(26, Math.min(36, width * 0.085)));
  const tabIconSizeSm = Math.max(24, Math.min(34, tabIconSize - 2));
  const captureOuter = Math.round(Math.max(34, Math.min(48, width * 0.11)));
  const captureInner = Math.round(captureOuter * 0.78);

  const handleTabPress = (routeName: string) => {
    const now = Date.now();

    // If user taps home while already on home, detect double-tap and trigger refresh
    if (routeName === 'Home' && currentTab === 'Home') {
      const delta = now - (lastHomeTapRef.current || 0);
      const isDoubleTap = delta > 0 && delta < 400; // 400ms window
      lastHomeTapRef.current = now;

      setIsHomeRefreshing(true);

      if (homeScreenRef.current) {
        homeScreenRef.current.refresh();
      }

      if (resetTapTimeoutRef.current) {
        clearTimeout(resetTapTimeoutRef.current);
      }
      resetTapTimeoutRef.current = setTimeout(() => {
        setIsHomeRefreshing(false);
      }, 2000);
    }

    setCurrentTab(routeName);
  };

  // Custom tab bar button for capture
  const CaptureTabButton = ({ children }: { children: React.ReactNode }) => {
    const [isPreparing, setIsPreparing] = useState(false);
    
    const handleCapturePress = async () => {
      try {
        // Show action sheet for user to choose between camera and gallery
        Alert.alert(
          'Create Video',
          'Choose how you want to create your video',
          [
            {
              text: 'Camera',
              onPress: () => {
                // Navigate to CreateScreen for camera recording
                navigation.navigate('Create');
              },
            },
            {
              text: 'Gallery',
              onPress: handleGalleryPick,
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ]
        );
      } catch (error) {
        console.error('Error in capture button:', error);
      }
    };

    const handleGalleryPick = async () => {
      try {
        setIsPreparing(true);
        // Open gallery for video selection
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'videos',
          allowsMultipleSelection: false,
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) {
          setIsPreparing(false);
          return; // User cancelled
        }
        const asset = result.assets[0];
        if (!asset.uri) {
          setIsPreparing(false);
          Alert.alert('Error', 'No video selected.');
          return;
        }
        // Prepare video file object
        let videoPath = asset.uri;
        if (!videoPath.startsWith('file://')) {
          videoPath = `file://${videoPath}`;
        }
        // Check file existence before proceeding
        const fileInfo = await FileSystem.getInfoAsync(videoPath);
        if (!fileInfo.exists) {
          setIsPreparing(false);
          Alert.alert('Error', 'Selected video file does not exist or is not accessible.');
          return;
        }
        // Optionally, copy to cache directory to ensure accessibility
        const destPath = `${FileSystem.cacheDirectory}gallery_${Date.now()}.mp4`;
        await FileSystem.copyAsync({ from: videoPath, to: destPath });
        // Prepare video object for post screen
        const videoFile = {
          path: destPath.startsWith('file://') ? destPath : `file://${destPath}`,
          duration: asset.duration || 0,
          width: asset.width || 0,
          height: asset.height || 0,
        };
        setIsPreparing(false);
        navigation.navigate('VideoPost', { video: videoFile });
      } catch (e) {
        setIsPreparing(false);
        console.error('Error picking video from gallery:', e);
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
          {/* Custom circle within a circle design */}
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
    <Tab.Navigator id={undefined}
      backBehavior="initialRoute"
      screenOptions={({ route }) => ({
        headerShown: false,
        detachInactiveScreens: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: (route.name === 'Explore' || route.name === 'Notifications') ? Colors.black : 'transparent',
          height: getBottomNavBarHeight(insets),
          paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom - 8, 4) : 4,
          paddingTop: isSmallDevice ? 2 : 6,
          shadowOpacity: 0,
          borderTopWidth: 0,
          elevation: 0,
          // Ensure transparency works properly
          position: 'absolute',
          // Hide tab bar on stacked screens (after transition completes). Also hide in clear view mode.
          display: (isOnStackedScreen || isClearViewMode) ? 'none' : 'flex',
        },
        tabBarItemStyle: {

        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
        tabBarShowLabel: false,
        tabBarIcon: ({ color, focused }) => {
          let iconName = '';
          let iconSize = tabIconSizeSm;

          switch (route.name) {
            case 'Home':
              return (
                isHomeRefreshing
                  ? <Icon name="loading-3-fill" size={iconSize} color={color} />
                  : <HomeIcon size={tabIconSize} color={color} />
              );
            case 'Explore':
              return (
                <ExploreIcon 
                  size={tabIconSize} 
                  color={color}
                  style={{ transform: [{ scaleX: -1 }] }}
                />
              );
            case 'Notifications':
              return (
                <NotificationIcon 
                  size={tabIconSizeSm} 
                  color={color}
                />
              );
            case 'Profile':
              return (
                <ProfileIcon 
                  size={tabIconSize} 
                  color={color}
                />
              );
            default:
              iconName = 'home';
          }

          return (
            <Icon 
              name={iconName} 
              size={iconSize} 
              color={color}
            />
          );
        },
        listeners: ({ navigation }: { navigation: any }) => ({
          tabPress: (_e: any) => {
            // Prevent default behavior for home tab when already on home
            if (route.name === 'Home' && currentTab === 'Home') {
              handleTabPress(route.name);
            } else {
              handleTabPress(route.name);
            }
          },
          focus: () => {
            // Reset stacked screen state when tab is focused
            setIsOnStackedScreen(false);
          },
        }),
      })}
    >
      <Tab.Screen 
        name="Home" 
        children={() => <HomeStack onLogout={onLogout} setIsOnStackedScreen={setIsOnStackedScreen} />}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen 
        name="Explore" 
        children={() => <ExploreStack onLogout={onLogout} setIsOnStackedScreen={setIsOnStackedScreen} />}
        options={{
          tabBarLabel: 'Explore',
        }}
      />
      {/* Center capture button as a dummy tab */}
      <Tab.Screen
        name="Capture"
        children={() => null}
        options={{
          tabBarButton: (props) => (
            <CaptureTabButton {...props} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            try { (e as any)?.preventDefault?.(); } catch {}
            // Do nothing, handled by custom button
          },
        }}
      />
      <Tab.Screen 
        name="Notifications" 
        children={() => <NotificationsStack onLogout={onLogout} setIsOnStackedScreen={setIsOnStackedScreen} />}
        options={{
          tabBarLabel: 'Notifications',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        children={() => <ProfileStack onLogout={onLogout} setIsOnStackedScreen={setIsOnStackedScreen} />}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

export default BottomTabNavigator;
