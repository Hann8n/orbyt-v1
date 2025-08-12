import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar, Appearance, AppState, LogBox } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Configure Reanimated logger to disable strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Disable strict mode to suppress warnings from third-party libraries
});

// Ignore multiformats warnings - using broader patterns to catch all variations
LogBox.ignoreLogs([
  'multiformats',
  'Attempted to import the module',
  'which is not listed in the "exports"',
  'Falling back to file-based resolution',
]);
import { NavigationContainer } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import RootNavigator from '../src/navigation/RootNavigator'; // adjust path if needed
import DebugBoundary from './components/ui/DebugBoundary';
import LoginScreen from '../src/screens/LoginScreen';
import { AtprotoService } from '../src/services/api/AtprotoService';
import * as Font from 'expo-font';
import ProfileCache from '../src/services/cache/ProfileCache'; // import ProfileCache
import StatusBarController from '../src/components/ui/StatusBarController';
import { Colors } from './components/ui/UI';
import { useAppStore } from '@stores/appStore';
import { useNavigationUpdate } from '@stores/visibilityStore';


// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes garbage collection time
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

// Force dark mode
Appearance.setColorScheme('dark');

const App: React.FC<{}> = () => {
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
    async function loadFonts() {
      await Font.loadAsync({
        'Firma-Regular': require('./assets/fonts/Firma-Regular.otf'),
        'Firma-Medium': require('./assets/fonts/Firma-Medium.otf'),
        'Firma-SemiBold': require('./assets/fonts/Firma-SemiBold.otf'),
        'Firma-Bold': require('./assets/fonts/Firma-Bold.otf'),
        'Firma-BoldItalic': require('./assets/fonts/Firma-BoldItalic.otf'),
        'Firma-Black': require('./assets/fonts/Firma-Black.otf'),
      });
      setFontsLoaded(true);
    }
    loadFonts();
  }, []);

  // Handle app state changes for memory management
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (appState === 'active' && nextAppState.match(/inactive|background/)) {
        // App has gone to the background - VideoPreloadManager removed
      }
      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [appState]);

  // Manual feed reset function, can be called from anywhere if needed
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

  useEffect(() => {
    async function checkLogin() {
      try {
        const sessionStr = await SecureStore.getItemAsync('session');
        if (sessionStr) {
          const user = await AtprotoService.getCurrentUser();
          if (user) {
            // Cache the user's profile data
            if (user.handle) {
              await ProfileCache.cacheProfiles([user]);
              ProfileCache.setCurrentUserDid(user.did);
            }
            completeLogin();
          } else {
            await SecureStore.deleteItemAsync('session');
            completeLogout();
          }
        } else {
          completeLogout();
        }
      } catch (error: any) {
        console.error('Error verifying session:', error);
        completeLogout();
      } finally {
        setLoading(false);
      }
    }
    checkLogin();
  }, []);

  const handleLogin = async (handle: string, password: string) => {
    try {
      await AtprotoService.login(handle, password, true); // Save account by default
      completeLogin();
      return Promise.resolve();
    } catch (error) {
      console.error('Login error:', error);
      return Promise.reject(error);
    }
  };

  const handleAccountSwitch = async (account: any) => {
    try {
      // The account switching is already handled by AccountManager.switchAccount
      // which calls AtprotoService.login internally
      // Data clearing is now handled in AccountSwitcher component
      completeLogin();
      return Promise.resolve();
    } catch (error) {
      console.error('Account switch error:', error);
      return Promise.reject(error);
    }
  };
  
  const handleLogout = async (clearAllAccounts: boolean = false) => {
    try {
      // Clear any cached state in React Query
      queryClient.clear();
      
      // Clean up app services - VideoPreloadManager removed
      
      // Clear ProfileCache during logout
      ProfileCache.clearCache();
      
      // Log out from the service
      await AtprotoService.logout(clearAllAccounts);
      
      // Update store state to trigger re-render to login screen
      completeLogout();
      
      return Promise.resolve();
    } catch (error) {
      console.error('Logout error:', error);
      return Promise.reject(error);
    }
  };

  if (isLoading || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <StatusBarController />
          <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
              <DebugBoundary label="LoginFlow">
                <LoginScreen onLogin={handleLogin} onAccountSwitch={handleAccountSwitch} />
              </DebugBoundary>
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  }

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
              }
            } catch {}
          }}
        >
          <StatusBarController />
          <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
              <DebugBoundary label="RootNavigator">
                <RootNavigator onLogout={handleLogout} />
              </DebugBoundary>
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
  },
});

export default App;