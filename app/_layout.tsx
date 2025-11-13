import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar, Appearance, AppState } from 'react-native';
import { Stack, Redirect, usePathname, useSegments } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Keep local imports where they are; no file moves
import { Colors } from '../src/components/ui/UI';
import { Loading3FillIcon } from '../src/components/ui/Icon';
import { useAppStore } from '../src/stores/appStore';
import { useAuth, useAccountManagement, useUserStore, useProfilePrecache } from '../src/stores/userStore';
import { QUERY_CONSTANTS } from '../src/utils/constants';
import { CommonErrorHandlers } from '../src/utils/errorHandler';
import ShareSheet from '../src/components/ui/ShareSheet';
import CommentSection from '../src/components/features/comments/CommentSection';
import GlobalAccountSwitcher from '../src/components/ui/GlobalAccountSwitcher';
import LoginScreen from './login';
import { useVisibilityCoreStore } from '../src/core/visibility';

// Configure Reanimated logger to disable strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});


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

// Consolidated providers wrapper
const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={styles.gestureHandler}>
          {children}
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
};

// Global modals component
const GlobalModals: React.FC = () => {
  return (
    <>
      <ShareSheet />
      <CommentSection />
      <GlobalAccountSwitcher />
    </>
  );
};

// Visibility hook for inline logic
const useVisibilityTracking = () => {
  const setAppState = useVisibilityCoreStore((state) => state.setAppState);
  const setActiveTabSegment = useVisibilityCoreStore((state) => state.setActiveTabSegment);
  const segments = useSegments();

  useEffect(() => {
    const initialState = AppState.currentState;
    setAppState(initialState);

    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => subscription.remove();
  }, [setAppState]);

  useEffect(() => {
    const normalizedSegments = Array.from(segments);
    let tabSegment: string | null = null;
    if (normalizedSegments.length >= 2 && normalizedSegments[0] === '(tabs)') {
      tabSegment = normalizedSegments[1];
    }
    setActiveTabSegment(tabSegment);
  }, [segments, setActiveTabSegment]);
};

export default function RootLayout() {
  // Use individual selectors to prevent unnecessary re-renders
  const fontsLoaded = useAppStore(state => state.fontsLoaded);
  const setFontsLoaded = useAppStore(state => state.setFontsLoaded);
  
  // Inline visibility tracking
  useVisibilityTracking();
  
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const isAuthenticating = useUserStore(state => state.isAuthenticating);
  const signIn = useUserStore(state => state.signIn);
  const signOut = useUserStore(state => state.signOut);
  const switchAccount = useUserStore(state => state.switchAccount);
  const initializeUserState = useUserStore(state => state.initializeUserState);
  
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Precache current user profile on app launch
  useProfilePrecache();

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
    const initializeApp = async () => {
      try {
        await initializeUserState();
        
        // Initialize services
        try {
          const AtprotoService = (await import('../src/services/api/AtprotoService')).default;
          await AtprotoService.initializeServices();
        } catch (error) {
          // Silent - services will work without this optimization
        }
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
        <Loading3FillIcon size={48} color={Colors.white} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppProviders>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} hidden={false} />
        <LoginScreen onLogin={handleLogin} onAccountSwitch={handleAccountSwitch} />
      </AppProviders>
    );
  }

  return (
    <AppProviders>
      <StatusBar barStyle="light-content" backgroundColor={Colors.black} hidden={false} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(modals)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="insights" options={{ headerShown: false }} />
        <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="channel/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[did]" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen 
          name="settings" 
          options={{ 
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom'
          }} 
        />
      </Stack>
      <GlobalModals />
    </AppProviders>
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
