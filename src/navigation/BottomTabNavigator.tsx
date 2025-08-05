import React, { useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Platform, Dimensions, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

import HomeScreen, { HomeScreenRef } from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import CreateScreen from '../screens/CreateScreen';
import NotificationScreen from '../screens/NotificationScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChannelScreen from '../screens/ChannelScreen';
import Icon from '../components/ui/Icon';
import { isSmallScreen, isTablet, getBottomNavBarHeight } from '../utils/helpers/screenSize';
import * as ImagePicker from 'expo-image-picker';
import VideoProcessingService from '../services/VideoProcessingService';
import * as FileSystem from 'expo-file-system';
import { useClearView } from '../services/ClearViewContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface BottomTabNavigatorProps {
  onLogout: () => Promise<void>;
}

// Global ref for HomeScreen
const homeScreenRef = React.createRef<HomeScreenRef>();

// Create stack navigators for each tab that needs author profile access
const HomeStack = ({ onLogout }: { onLogout: () => Promise<void> }) => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="HomeScreen">
      {(props) => <HomeScreen {...props} ref={homeScreenRef} />}
    </Stack.Screen>
    <Stack.Screen 
      name="AuthorProfile" 
      children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
    />
    <Stack.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
    />
  </Stack.Navigator>
);

const ExploreStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
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
        focus: () => setIsOnStackedScreen(true),
      }}
    />
    <Stack.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        focus: () => setIsOnStackedScreen(true),
      }}
    />
  </Stack.Navigator>
);

const NotificationsStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
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
        focus: () => setIsOnStackedScreen(true),
      }}
    />
    <Stack.Screen 
      name="Channel" 
      children={(props) => <ChannelScreen {...props} />}
      listeners={{
        focus: () => setIsOnStackedScreen(true),
      }}
    />
  </Stack.Navigator>
);

// Profile tab with its own stack
const ProfileStack = ({ onLogout, setIsOnStackedScreen }: { onLogout: () => Promise<void>; setIsOnStackedScreen: (value: boolean) => void }) => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
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
        focus: () => setIsOnStackedScreen(true),
      }}
    />
  </Stack.Navigator>
);

const BottomTabNavigator: React.FC<BottomTabNavigatorProps> = ({ onLogout }) => {
  const [isHomeRefreshing, setIsHomeRefreshing] = useState(false);
  const [currentTab, setCurrentTab] = useState('Home');
  const [isOnStackedScreen, setIsOnStackedScreen] = useState(false);
  const insets = useSafeAreaInsets();
  const isSmallDevice = isSmallScreen() || isTablet();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isClearViewMode } = useClearView();
  


  const handleTabPress = (routeName: string) => {
    // console.log(`[BottomTabNavigator] Tab pressed: ${routeName}, current tab: ${currentTab}`);
    
    // If user taps home while already on home, refresh the feed
    if (routeName === 'Home' && currentTab === 'Home') {
      // console.log('[BottomTabNavigator] Home tab pressed while on home - triggering refresh');
      setIsHomeRefreshing(true);
      
      // Call refresh method
      if (homeScreenRef.current) {
        // console.log('[BottomTabNavigator] Calling homeScreenRef.current.refresh()');
        homeScreenRef.current.refresh();
      } else {
        console.warn('[BottomTabNavigator] homeScreenRef.current is null');
      }
      
      // Reset refreshing state after a delay
      setTimeout(() => {
        // console.log('[BottomTabNavigator] Resetting refresh state');
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
            borderRadius: 20,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
          }}
          disabled={isPreparing}
        >
          {/* Custom circle within a circle design */}
          <View style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1.75,
            borderColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}>
            <View style={{
              width: 28,
              height: 28,
              borderRadius: 14,
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
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Tab.Navigator
      backBehavior="initialRoute"
            screenOptions={({ route }) => ({
        headerShown: false,
        detachInactiveScreens: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: isSmallDevice && !isOnStackedScreen && (route.name === 'Explore' || route.name === 'Notifications') ? '#000' : (isSmallDevice ? 'rgba(0, 0, 0, 0.025)' : '#000'),
          height: getBottomNavBarHeight(insets),
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : 20,
          paddingTop: isSmallDevice ? 2 : 10,
          shadowOpacity: 0,
          borderTopWidth: 0,
          elevation: 0,
          // Ensure transparency works properly
          position: 'absolute',
          // Hide tab bar in clear view mode on small devices
          display: isSmallDevice && isClearViewMode ? 'none' : 'flex',
        },
        tabBarActiveTintColor: isSmallDevice ? '#fff' : '#fff',
        tabBarInactiveTintColor: isSmallDevice ? 'rgba(255, 255, 255, 0.6)' : '#666',
        tabBarShowLabel: false,
        tabBarIcon: ({ color, focused }) => {
          let iconName = '';
          let iconSize = 28;

          switch (route.name) {
            case 'Home':
              iconName = isHomeRefreshing ? 'refresh' : 'spotlight';
              iconSize = 30;
              break;
            case 'Explore':
              iconName = 'map';
              iconSize = 30;
              break;
            case 'Notifications':
              iconName = 'notification';
              iconSize = 28;
              break;
            case 'Profile':
              iconName = 'user';
              iconSize = 30;
              break;
            default:
              iconName = 'home';
              iconSize = 28;
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
          tabPress: (e: any) => {
            // Prevent default behavior for home tab when already on home
            if (route.name === 'Home' && currentTab === 'Home') {
              e.preventDefault();
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
        children={() => <HomeStack onLogout={onLogout} />}
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
            e.preventDefault();
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
