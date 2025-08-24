import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar, Appearance, AppState, LogBox } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { NavigationContainer } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as Font from 'expo-font';

// Local imports
import RootNavigator from './navigation/RootNavigator';
import LoginScreen from './screens/LoginScreen';
import { AtprotoService } from './services/api/AtprotoService';
import ProfileCache from './services/cache/ProfileCache';
import StatusBarController from './components/ui/StatusBarController';
import { Colors } from './components/ui/UI';
import { useAppStore } from './stores/appStore';
import { useNavigationUpdate } from './stores/visibilityStore';
import { QUERY_CONSTANTS, STORAGE_KEYS, ERROR_MESSAGES } from './utils/constants';
import { CommonErrorHandlers } from './utils/errorHandler';
import AccountManager from './services/storage/AccountManager';
import { AtProtoOAuthService } from './services/auth';

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
    isLoggedIn, 
    isLoading, 
    fontsLoaded, 
    appState,
    setLoggedIn,
    setLoading,
    setFontsLoaded,
    setAppState,
    completeLogin,
    completeLogout
  } = useAppStore();
  const updateNavigation = useNavigationUpdate();

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

  // Check login status
  useEffect(() => {
    const checkLogin = async () => {
      try {
        setLoading(true);
        
        // First check for saved accounts
        const savedAccounts = await AccountManager.getSavedAccounts();
        const activeAccount = await AccountManager.getActiveAccount();
        
        if (activeAccount && savedAccounts.length > 0) {
          console.log('[App] Found active account:', activeAccount.did);
          
          // Try to restore OAuth session for the active account
          const oauthService = AtProtoOAuthService.getInstance();
          try {
            console.log('[App] Attempting to restore OAuth session for DID:', activeAccount.did);
            await oauthService.restoreSession(activeAccount.did);
            console.log('[App] OAuth session restored successfully, completing login');
            completeLogin();
            return;
          } catch (error) {
            console.warn('[App] OAuth session restoration failed for active account:', error);
            // Don't clear the account, just let user re-authenticate
            await oauthService.signOut();
          }
        }
        
        // No valid session found, user needs to log in
        console.log('[App] No valid session found, user needs to log in');
        completeLogout();
      } catch (error: any) {
        console.error('[App] Error during login check:', error);
        CommonErrorHandlers.api(error);
        completeLogout();
      } finally {
        setLoading(false);
      }
    };
    
    checkLogin();
  }, [completeLogin, completeLogout, setLoading]);

  const handleLogin = async (handle: string) => {
    console.log(`[App] handleLogin called with:`, { 
      handle: `"${handle}"`
    });

    try {
      // OAuth authentication - the OAuth session should already be established
      console.log(`[App] Using OAuth authentication - session should already be established`);
      // For OAuth, the session is managed by the OAuth service
      // We just need to verify it exists
      const oauthService = AtProtoOAuthService.getInstance();
      const session = await oauthService.getCurrentSession();
      
      if (!session) {
        throw new Error('OAuth session not found');
      }
      
      console.log(`[App] OAuth session verified for DID: ${session.did}`);
      
      // Save the account to AccountManager with profile information
      try {
        // Get the user's profile information to get handle and display name
        const userProfile = await oauthService.getCurrentUserProfile();
        if (userProfile) {
          console.log(`[App] Saving OAuth account with profile:`, {
            did: session.did,
            handle: userProfile.handle,
            displayName: userProfile.displayName,
            avatar: userProfile.avatar
          });
          
          await AccountManager.saveOAuthAccount(
            session,
            userProfile.displayName,
            userProfile.avatar,
            userProfile.handle
          );
          
          // Cache the user's profile data
          if (userProfile.handle) {
            await ProfileCache.cacheProfiles([userProfile]);
            ProfileCache.setCurrentUserDid(userProfile.did);
          }
        } else {
          console.warn(`[App] Could not fetch user profile, saving account with basic info`);
          await AccountManager.saveOAuthAccount(session);
        }
      } catch (accountSaveError) {
        console.error(`[App] Failed to save account:`, accountSaveError);
        // Don't fail the login if account saving fails
      }
      
      completeLogin();
      return Promise.resolve();
    } catch (error) {
      console.error(`[App] Login failed:`, error);
      CommonErrorHandlers.login(error);
      return Promise.reject(error);
    }
  };

  const handleAccountSwitch = async (account: any) => {
    try {
      completeLogin();
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
      
      // Clear ProfileCache during logout
      ProfileCache.clearCache();
      
      // Log out from the service
      await AtprotoService.logout(clearAllAccounts);
      
      // Update store state to trigger re-render to login screen
      completeLogout();
      
      return Promise.resolve();
    } catch (error) {
      CommonErrorHandlers.logout(error);
      return Promise.reject(error);
    }
  };

  // Loading state
  if (isLoading || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  // Login state
  if (!isLoggedIn) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <StatusBarController />
          <GestureHandlerRootView style={styles.gestureHandler}>
            <BottomSheetModalProvider>
              <LoginScreen onLogin={handleLogin} onAccountSwitch={handleAccountSwitch} />
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  }

  // Main app
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer
          onStateChange={(state) => {
            try {
              const getActiveRouteName = (navState: any): string | undefined => {
                if (!navState) return undefined;
                let route = navState.routes?.[navState.index ?? 0];
                while (route?.state && route.state.routes) {
                  route = route.state.routes[route.state.index ?? 0];
                }
                return route?.name;
              };

              const routeName = getActiveRouteName(state) || state?.routes?.[state?.index ?? 0]?.name;
              if (routeName) {
                updateNavigation(routeName);
                try {
                  console.log('[Navigation]', routeName);
                } catch {}
              }
            } catch {}
          }}
        >
          <StatusBarController />
          <GestureHandlerRootView style={styles.gestureHandler}>
            <BottomSheetModalProvider>
              <RootNavigator onLogout={handleLogout} />
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </NavigationContainer>
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