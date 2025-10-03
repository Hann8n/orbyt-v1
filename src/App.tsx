import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar, Appearance, AppState, LogBox } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';

// Local imports
import LoginScreen from '../app/login';
import { AtprotoService } from './services/api/AtprotoService';
import ProfileCache from './services/cache/ProfileCache';
import StatusBarController from './components/ui/StatusBarController';
import { Colors } from './components/ui/UI';
import { useAppStore } from './stores/appStore';
import { useAuth, useAccountManagement, useUserStore, useProfilePrecache } from './stores/userStore';
import { QUERY_CONSTANTS, STORAGE_KEYS, ERROR_MESSAGES } from './utils/constants';
import { CommonErrorHandlers } from './utils/errorHandler';
import { AtProtoOAuthService } from './services/auth';
import ShareSheet from './components/ui/ShareSheet';
import CommentSection from './components/features/comments/CommentSection';

// Configure Reanimated logger to disable strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

// Ignore multiformats warnings - using broader patterns to catch all variations
LogBox.ignoreLogs([
  'multiformats',
  'Attempted to import the module',
  'which is not listed in the "exports"',
  'Falling back to file-based resolution',
]);

// Create a client
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

// Force dark mode
Appearance.setColorScheme('dark');

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

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const { 
    fontsLoaded, 
    appState,
    setFontsLoaded,
    setAppState,
  } = useAppStore();
  
  const { 
    isAuthenticated, 
    isAuthenticating, 
    signIn, 
    signOut, 
    restoreSession 
  } = useAuth();
  
  const { 
    switchAccount, 
    loadSavedAccounts 
  } = useAccountManagement();
  
  const { initializeUserState } = useUserStore();
  
  // Precache current user profile on app launch
  useProfilePrecache();
  
  // Add initialization state
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Load fonts
  useEffect(() => {
    const loadFonts = async () => {
      try {
        await Font.loadAsync({
          'Firma-Regular': require('./assets/fonts/Firma-Regular.otf'),
          'Firma-Medium': require('./assets/fonts/Firma-Medium.otf'),
          'Firma-SemiBold': require('./assets/fonts/Firma-SemiBold.otf'),
          'Firma-Bold': require('./assets/fonts/Firma-Bold.otf'),
          'Firma-BoldItalic': require('./assets/fonts/Firma-BoldItalic.otf'),
          'Firma-Black': require('./assets/fonts/Firma-Black.otf'),
        });
        setFontsLoaded(true);
      } catch (error) {
        CommonErrorHandlers.cache(error);
        setFontsLoaded(true); // Continue without fonts
      }
    };
    
    loadFonts();
  }, [setFontsLoaded]);

  // Handle app state changes for memory management
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (appState === 'active' && nextAppState.match(/inactive|background/)) {
        // App has gone to the background
      }
      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [appState, setAppState]);

  // Initialize user state on app start
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initializeUserState();
      } catch (error) {
        console.error('[App] Error initializing user state:', error);
        CommonErrorHandlers.api(error);
      } finally {
        setIsInitializing(false);
      }
    };
    
    initializeApp();
  }, [initializeUserState]);

  // Manual feed reset function
  const resetFeeds = () => {
    try {
      queryClient.removeQueries({ 
        queryKey: ['feed'],
        exact: false 
      });
    } catch (error) {
      console.error('Error resetting feeds:', error);
    }
  };

  const handleLogin = async (handle: string) => {
    try {
      // If OAuth flow already succeeded, do not attempt another sign-in
      if (handle === 'oauth-success') {
        return Promise.resolve();
      }
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
      // Clear any cached state in React Query
      queryClient.clear();
      
      // Sign out using the user store
      await signOut(clearAllAccounts);
      
      return Promise.resolve();
    } catch (error) {
      CommonErrorHandlers.logout(error);
      return Promise.reject(error);
    }
  };

  // Loading state - show loading screen during initialization, font loading, or authentication
  if (isInitializing || isAuthenticating || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  // Login state
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

  // Main app
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <StatusBarController />
        <GestureHandlerRootView style={styles.gestureHandler}>

          <ShareSheet />
          <CommentSection />
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
};

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

export default App;