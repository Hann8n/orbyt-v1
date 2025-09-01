import React from 'react';
import { VideoFile } from 'react-native-vision-camera';

// Define custom video type that extends VideoFile
export type CustomVideoFile = VideoFile | {
  path: string;
  duration: number;
  width?: number;
  height?: number;
  segments?: {
    startTime: number;
    duration: number;
    path: string;
  }[];
};

// Text overlay definition for passing between screens
export interface TextOverlay {
  id: string;
  text: string;
  position: { x: number; y: number };
  scale: number;
  color: string;
  fontFamily: string;
}

// Define the root stack parameter list
export type RootStackParamList = {
  Main: undefined;
  Create: undefined;
  VideoPost: {
    video: CustomVideoFile;
    textOverlays?: TextOverlay[];
  };
  FeedScreen: {
    feed?: any[]; // FeedItem[] type, but import if needed
    initialIndex: number;
    initialUri?: string;
    feedOption: string;
    userDid?: string;
    backgroundColor?: string;
    secondaryColor?: string;
  };
  Channel: {
    uri: string;
    title?: string;
    description?: string;
    avatar?: string;
    creator?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
  Settings: {
    onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
  };
  Insights: {
    onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
  };
  
  ContentFilters: undefined;
  ModerationDebug: {
    onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
  };
  BlockedUsers: undefined;
  MutedUsers: undefined;
  HiddenPosts: undefined;
  WatchHistory: undefined;
  ChannelManagement: undefined;
  About: undefined;
  ColorPalette: undefined;
  AuthorProfile: { handle: string };
};

// Define stack navigator parameter lists for tab stacks
export type HomeStackParamList = {
  HomeScreen: undefined;
  AuthorProfile: { handle: string };
  Channel: {
    uri: string;
    title?: string;
    description?: string;
    avatar?: string;
    creator?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
};

export type ExploreStackParamList = {
  ExploreScreen: undefined;
  AuthorProfile: { handle: string };
  Channel: {
    uri: string;
    title?: string;
    description?: string;
    avatar?: string;
    creator?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
};

export type NotificationsStackParamList = {
  NotificationsScreen: undefined;
  AuthorProfile: { handle: string };
  Channel: {
    uri: string;
    title?: string;
    description?: string;
    avatar?: string;
    creator?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
};

export type ProfileStackParamList = {
  ProfileScreen: undefined;
  AuthorProfile: { handle: string };
  Channel: {
    uri: string;
    title?: string;
    description?: string;
    avatar?: string;
    creator?: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  };
};

// Create a context to provide onLogout to nested components
export const LogoutContext = React.createContext<((clearAllAccounts?: boolean) => Promise<void>) | null>(null);

// Hook to access the logout function
export const useLogout = () => {
  const logout = React.useContext(LogoutContext);
  if (!logout) {
    throw new Error('useLogout must be used within a RootNavigator');
  }
  return logout;
};

 