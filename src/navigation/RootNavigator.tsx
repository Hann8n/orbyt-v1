import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { AppState } from 'react-native';
import BottomTabNavigator from './BottomTabNavigator';
import VideoPostScreen from '../screens/VideoPostScreen';
import VideoPreloadManager from '../services/VideoPreloadManager';
import ProfileFeedModal from '../screens/ProfileFeedModal';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import InsightsScreen from '../screens/InsightsScreen';
import ModerationControlsScreen from '../screens/Settings/ModerationControlsScreen';
import BlockedUsersScreen from '../screens/Settings/BlockedUsersScreen';
import MutedUsersScreen from '../screens/Settings/MutedUsersScreen';
import MutedWordsScreen from '../screens/Settings/MutedWordsScreen';
import HiddenPostsScreen from '../screens/Settings/HiddenPostsScreen';
import WatchHistoryScreen from '../screens/Settings/WatchHistoryScreen';
import ChannelManagementScreen from '../screens/Settings/ChannelManagementScreen';
import CreateScreen from '../screens/CreateScreen';
import { RootStackParamList, LogoutContext } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  onLogout: () => Promise<void>;
}

const RootNavigator: React.FC<RootNavigatorProps> = ({ onLogout }) => {
  const navigation = useNavigation();
  
  // Add navigation state listener to handle video management on stacked screens
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e: any) => {
      const currentRoute = e.data.state?.routes?.[e.data.state.index];
      
      if (currentRoute?.name === 'VideoPost') {
        // Initialize VideoPreloadManager when navigating to stacked screens
        VideoPreloadManager.initialize();
      } else if (currentRoute?.name === 'Main') {
        // Initialize VideoPreloadManager when returning to main screen
        VideoPreloadManager.initialize();
      }
    });

    return unsubscribe;
  }, [navigation]);

  // Add app state listener to handle app reopening on stacked screens
  React.useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        // App has come to foreground
        const navigationState = navigation.getState();
        const currentRoute = navigationState?.routes?.[navigationState.index];
        
        // If app is reopened on a stacked screen, initialize VideoPreloadManager
        if (currentRoute?.name === 'VideoPost') {
          VideoPreloadManager.initialize();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [navigation]);

  return (
    <LogoutContext.Provider value={onLogout}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="Main" 
          children={() => <BottomTabNavigator onLogout={onLogout} />}
        />
        <Stack.Screen 
          name="VideoPost"
          component={VideoPostScreen}
          options={{ 
            animation: 'slide_from_right',
            // This ensures that when navigating to VideoPost, the tab bar will be hidden
            presentation: 'fullScreenModal'
          }}
        />
        <Stack.Screen 
          name="Create"
          component={CreateScreen}
          options={{ 
            animation: 'slide_from_bottom',
            presentation: 'fullScreenModal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ProfileFeedModal"
          component={ProfileFeedModal}
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Insights"
          component={InsightsScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ModerationControls"
          component={ModerationControlsScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="BlockedUsers"
          component={BlockedUsersScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="MutedUsers"
          component={MutedUsersScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="MutedWords"
          component={MutedWordsScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="HiddenPosts"
          component={HiddenPostsScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="WatchHistory"
          component={WatchHistoryScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ChannelManagement"
          component={ChannelManagementScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
      </Stack.Navigator>
    </LogoutContext.Provider>
  );
};

export default RootNavigator;
