import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { AppState } from 'react-native';
import BottomTabNavigator from './BottomTabNavigator';
import VideoPostScreen from '../screens/VideoPostScreen';

import FeedModal from '../screens/FeedModal';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import InsightsScreen from '../screens/InsightsScreen';
import ModerationControlsScreen from '../screens/Settings/ModerationControlsScreen';
import BlockedUsersScreen from '../screens/Settings/BlockedUsersScreen';
import MutedUsersScreen from '../screens/Settings/MutedUsersScreen';
import MutedWordsScreen from '../screens/Settings/MutedWordsScreen';
import HiddenPostsScreen from '../screens/Settings/HiddenPostsScreen';
import WatchHistoryScreen from '../screens/Settings/WatchHistoryScreen';
import ChannelManagementScreen from '../screens/Settings/ChannelManagementScreen';
import AboutScreen from '../screens/Settings/AboutScreen';
import CreateScreen from '../screens/CreateScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { RootStackParamList, LogoutContext } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  onLogout: () => Promise<void>;
}

const RootNavigator: React.FC<RootNavigatorProps> = ({ onLogout }) => {
  const navigation = useNavigation();
  
  // VideoPreloadManager removed

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
          name="FeedModal"
          component={FeedModal}
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
        <Stack.Screen
          name="About"
          component={AboutScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="AuthorProfile"
          children={(props) => <ProfileScreen {...props} onLogout={onLogout} />}
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
