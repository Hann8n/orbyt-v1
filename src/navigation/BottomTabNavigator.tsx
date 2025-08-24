import React, { useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Platform, Dimensions, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

import HomeScreen from '../screens/HomeScreen';
import type { HomeScreenRef } from '../types';
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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface BottomTabNavigatorProps {
  onLogout: () => Promise<void>;
}

// Global ref for HomeScreen
const homeScreenRef = React.createRef<HomeScreenRef>();

// Create stack navigators for each tab that needs author profile access
const HomeStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <Stack.Screen 
      name="HomeScreen"
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    >
      {(props) => <HomeScreen {...props} ref={homeScreenRef} />}
    </Stack.Screen>
    <Stack.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
    <Stack.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </Stack.Navigator>
);

const ExploreStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <Stack.Screen 
      name="ExploreScreen" 
      component={ExploreScreen}
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    />
    <Stack.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
    <Stack.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </Stack.Navigator>
);

const NotificationsStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <Stack.Screen 
      name="NotificationsScreen" 
      component={NotificationScreen}
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    />
    <Stack.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
    <Stack.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </Stack.Navigator>
);

// Profile tab with its own stack
const ProfileStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
    <Stack.Screen 
      name="ProfileScreen" 
      children={() => <ProfileScreen onLogout={onLogout} />}
      listeners={{
        focus: () => setIsOnStackedScreen(false),
      }}
    />
    <Stack.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      listeners={{
        transitionEnd: (e: any) => { if (!e.data?.closing) setIsOnStackedScreen(true); },
        transitionStart: (e: any) => { if (e.data?.closing) setIsOnStackedScreen(false); },
      }}
    />
  </Stack.Navigator>
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
          onPress={handleGalleryPick}
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 19,
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
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1.5,
            borderColor: Colors.white,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}>
            <View style={{
              width: 30,
              height: 30,
              borderRadius: 15,
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
              borderRadius: 20,
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
          let iconSize = 26;

          switch (route.name) {
            case 'Home':
              return (
                isHomeRefreshing
                  ? <Icon name="loading-3-fill" size={26} color={color} />
                  : <HomeIcon size={30} color={color} />
              );
            case 'Explore':
              return (
                <ExploreIcon 
                  size={30} 
                  color={color}
                  style={{ transform: [{ scaleX: -1 }] }}
                />
              );
            case 'Notifications':
              return (
                <NotificationIcon 
                  size={28} 
                  color={color}
                />
              );
            case 'Profile':
              return (
                <ProfileIcon 
                  size={30} 
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
