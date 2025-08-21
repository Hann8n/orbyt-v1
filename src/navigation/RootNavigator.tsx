import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
// Removed useNavigation here since this component is a navigator, not a screen
import BottomTabNavigator from './BottomTabNavigator';
import VideoPostScreen from '../screens/VideoPostScreen';

import FeedScreen from '../screens/FeedScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import InsightsScreen from '../screens/InsightsScreen';
import BlockedUsersScreen from '../screens/Settings/BlockedUsersScreen';
import MutedUsersScreen from '../screens/Settings/MutedUsersScreen';
import HiddenPostsScreen from '../screens/Settings/HiddenPostsScreen';
import WatchHistoryScreen from '../screens/Settings/WatchHistoryScreen';
import ContentFiltersScreen from '../screens/Settings/ContentFiltersScreen';
import ChannelManagementScreen from '../screens/Settings/ChannelManagementScreen';
import AboutScreen from '../screens/Settings/AboutScreen';
import ColorPaletteScreen from '../screens/Settings/ColorPaletteScreen';
import CreateScreen from '../screens/CreateScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChannelScreen from '../screens/ChannelScreen';
import { RootStackParamList, LogoutContext } from './types';
// Navigation tracking is handled at the NavigationContainer level

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  onLogout: () => Promise<void>;
}

const RootNavigator: React.FC<RootNavigatorProps> = ({ onLogout }) => {
  // Navigation state tracking moved to NavigationContainer.onStateChange

  return (
    <LogoutContext.Provider value={onLogout}>
      <Stack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
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
          name="FeedScreen"
          component={FeedScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
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
          name="ContentFilters"
          component={ContentFiltersScreen}
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
          name="ColorPalette"
          component={ColorPaletteScreen}
          options={{
            animation: 'slide_from_right',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Channel"
          component={ChannelScreen}
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
