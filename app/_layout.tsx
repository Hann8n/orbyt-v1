import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar, Appearance, AppState, LogBox } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Keep local imports where they are; no file moves
import StatusBarController from '../src/components/ui/StatusBarController';
import { Colors } from '../src/components/ui/UI';
import { useAppStore } from '../src/stores/appStore';
import { useAuth, useAccountManagement, useUserStore } from '../src/stores/userStore';
import { QUERY_CONSTANTS } from '../src/utils/constants';
import { CommonErrorHandlers } from '../src/utils/errorHandler';
import ShareSheet from '../src/components/ui/ShareSheet';
import CommentSection from '../src/components/features/comments/CommentSection';
import GlobalAccountSwitcher from '../src/components/ui/GlobalAccountSwitcher';
import LoginScreen from './login';

// Configure Reanimated logger to disable strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

// Ignore multiformats warnings
LogBox.ignoreLogs([
  'multiformats',
  'Attempted to import the module',
  'which is not listed in the "exports"',
  'Falling back to file-based resolution',
]);

Appearance.setColorScheme('dark');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: QUERY_CONSTANTS.RETRY_COUNT,
      staleTime: QUERY_CONSTANTS.STALE_TIME,
      gcTime: QUERY_CONSTANTS.GC_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

// Handle location variable error for React Native
if (typeof global !== 'undefined' && !global.location) {
  (global as any).location = {
    href: '',
    origin: '',
    protocol: '',
    host: '',
    hostname: '',
    port: '',
    pathname: '',
    search: '',
    hash: '',
    reload: () => {},
    replace: () => {},
    assign: () => {},
  };
}

export default function RootLayout() {
  const { fontsLoaded, appState, setFontsLoaded, setAppState } = useAppStore();
  const { isAuthenticated, isAuthenticating, signIn, signOut } = useAuth();
  const { switchAccount } = useAccountManagement();
  const { initializeUserState } = useUserStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const loadFonts = async () => {
      try {
        await Font.loadAsync({
          'Firma-Regular': require('../src/assets/fonts/Firma-Regular.otf'),
          'Firma-Medium': require('../src/assets/fonts/Firma-Medium.otf'),
          'Firma-SemiBold': require('../src/assets/fonts/Firma-SemiBold.otf'),
          'Firma-Bold': require('../src/assets/fonts/Firma-Bold.otf'),
          'Firma-BoldItalic': require('../src/assets/fonts/Firma-BoldItalic.otf'),
          'Firma-Black': require('../src/assets/fonts/Firma-Black.otf'),
        });
        setFontsLoaded(true);
      } catch (error) {
        CommonErrorHandlers.cache(error);
        setFontsLoaded(true);
      }
    };
    loadFonts();
  }, [setFontsLoaded]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      setAppState(nextAppState);
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [setAppState]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initializeUserState();
      } catch (error) {
        CommonErrorHandlers.api(error);
      } finally {
        setIsInitializing(false);
      }
    };
    initializeApp();
  }, [initializeUserState]);

  const handleLogin = async (handle: string) => {
    try {
      if (handle === 'oauth-success') return Promise.resolve();
      await signIn(handle);
      return Promise.resolve();
    } catch (error) {
      CommonErrorHandlers.login(error);
      return Promise.reject(error);
    }
  };

  const handleAccountSwitch = async (account: any) => {
    try {
      await switchAccount(account.did);
      return Promise.resolve();
    } catch (error) {
      CommonErrorHandlers.login(error);
      return Promise.reject(error);
    }
  };

  const handleLogout = async (clearAllAccounts: boolean = false) => {
    try {
      queryClient.clear();
      await signOut(clearAllAccounts);
      return Promise.resolve();
    } catch (error) {
      CommonErrorHandlers.logout(error);
      return Promise.reject(error);
    }
  };

  if (isInitializing || isAuthenticating || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <StatusBarController />
          <GestureHandlerRootView style={styles.gestureHandler}>
            <LoginScreen onLogin={handleLogin} onAccountSwitch={handleAccountSwitch} />
          </GestureHandlerRootView>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <StatusBarController />
        <GestureHandlerRootView style={styles.gestureHandler}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="feed" options={{ headerShown: false }} />
            <Stack.Screen name="insights" options={{ headerShown: false }} />
            <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="channel/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="profile/[did]" options={{ headerShown: false }} />
            <Stack.Screen 
              name="settings" 
              options={{ 
                headerShown: false,
                presentation: 'modal',
                animation: 'slide_from_bottom'
              }} 
            />
          </Stack>
          <ShareSheet />
          <CommentSection />
          <GlobalAccountSwitcher />
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
  },
  gestureHandler: {
    flex: 1,
  },
});
