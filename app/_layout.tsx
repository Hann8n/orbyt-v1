import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar, Appearance, AppState, InteractionManager, Platform } from 'react-native';
import { Stack, Redirect, usePathname, useSegments } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { setVideoCacheSizeAsync } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';

// Keep local imports where they are; no file moves
import { Colors } from '../src/components/ui/UI';
import { useAppStore } from '../src/stores/appStore';
import { useAuth, useAccountManagement, useUserStore } from '../src/stores/userStore';
import { migrateAsyncStorageToMMKV } from '../src/utils/storage';
import { useBookmarkStore } from '../src/stores/bookmarkStore';
import { CommonErrorHandlers } from '../src/utils/errorHandler';
import { feedService, createQueryKeys } from '../src/services/FeedService';
import ShareSheet from '../src/components/ui/ShareSheet';
import CommentSection from '../src/components/features/comments/CommentSection';
import GlobalAccountSwitcher from '../src/components/ui/GlobalAccountSwitcher';
import LoginScreen from './login';
import { useVisibilityCoreStore } from '../src/core/visibility';
import { queryClient } from '../src/utils/queryClient';

// Configure Reanimated logger to disable strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

// Prevent the splash screen from auto-hiding before we're ready
SplashScreen.preventAutoHideAsync();

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

// Consolidated providers wrapper
const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={styles.gestureHandler}>
          <KeyboardProvider>
            {children}
          </KeyboardProvider>
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

// Visibility hook for inline logic - tracks app state and active tab
const useVisibilityTracking = () => {
  const setAppState = useVisibilityCoreStore((state) => state.setAppState);
  const setActiveTab = useVisibilityCoreStore((state) => state.setActiveTab);
  const segments = useSegments();

  useEffect(() => {
    const initialState = AppState.currentState;
    setAppState(initialState);

    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => subscription.remove();
  }, [setAppState]);

  // Track active tab from segments
  useEffect(() => {
    const normalizedSegments = Array.from(segments);
    let activeTab: string | null = null;
    
    // Extract tab name from segments: (tabs)/index -> 'index', (tabs)/explore -> 'explore', etc.
    if (normalizedSegments.length >= 2 && normalizedSegments[0] === '(tabs)') {
      activeTab = normalizedSegments[1];
    } else if (normalizedSegments.length === 1 && normalizedSegments[0] === '(tabs)') {
      // Default to 'index' if we're at tabs root
      activeTab = 'index';
    }
    
    setActiveTab(activeTab);
  }, [segments, setActiveTab]);
};

export default function RootLayout() {
  // Use individual selectors to prevent unnecessary re-renders
  const fontsLoaded = useAppStore(state => state.fontsLoaded);
  const setFontsLoaded = useAppStore(state => state.setFontsLoaded);
  const insets = useSafeAreaInsets();
  
  // Inline visibility tracking
  useVisibilityTracking();
  
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const isAuthenticating = useUserStore(state => state.isAuthenticating);
  const signIn = useUserStore(state => state.signIn);
  const signOut = useUserStore(state => state.signOut);
  const switchAccount = useUserStore(state => state.switchAccount);
  const initializeUserState = useUserStore(state => state.initializeUserState);
  const loadBookmarks = useBookmarkStore(state => state.loadBookmarks);
  const clearBookmarks = useBookmarkStore(state => state.clearBookmarks);
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [appIsReady, setAppIsReady] = useState(false);

  // Set Android navigation bar to dark theme
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync(Colors.black).catch(() => {});
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }
  }, []);

  // Parallel initialization: fonts and auth state load simultaneously
  useEffect(() => {
    const initializeApp = async () => {
      // Migrate AsyncStorage to MMKV (one-time migration)
      await migrateAsyncStorageToMMKV();
      
      // Run font loading and user initialization in parallel
      const [fontsResult] = await Promise.allSettled([
        Font.loadAsync({
          'Firma-Regular': require('../src/assets/fonts/Firma-Regular.otf'),
          'Firma-Medium': require('../src/assets/fonts/Firma-Medium.otf'),
          'Firma-SemiBold': require('../src/assets/fonts/Firma-SemiBold.otf'),
          'Firma-Bold': require('../src/assets/fonts/Firma-Bold.otf'),
          'Firma-BoldItalic': require('../src/assets/fonts/Firma-BoldItalic.otf'),
          'Firma-Black': require('../src/assets/fonts/Firma-Black.otf'),
          'CriteriaCF-ExtraBold': require('../src/assets/fonts/CriteriaCF-ExtraBold.otf'),
        }),
        initializeUserState(),
      ]);

      // Set fonts loaded regardless of success
      setFontsLoaded(true);
      if (fontsResult.status === 'rejected') {
        CommonErrorHandlers.cache(fontsResult.reason);
      }

      setIsInitializing(false);
    };

    initializeApp();
  }, [initializeUserState, setFontsLoaded]);

  // Initialize video cache after app is ready and interactions complete
  // This prevents view hierarchy conflicts when videos are already active
  useEffect(() => {
    if (!appIsReady) return;

    // Defer video cache initialization until after interactions complete
    const interactionHandle = InteractionManager.runAfterInteractions(async () => {
      try {
        await setVideoCacheSizeAsync(500 * 1024 * 1024);
      } catch (error) {
        console.warn('Failed to set video cache size:', error);
        // Non-critical error - app will continue to work with default cache settings
      }
    });

    return () => {
      interactionHandle.cancel();
    };
  }, [appIsReady]);

  // Load bookmarks when user is authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      clearBookmarks();
      return;
    }
    
    if (!appIsReady) return;
    
    // Defer until interactions complete (service already checks authentication state)
    const handle = InteractionManager.runAfterInteractions(() => {
      loadBookmarks().catch(() => {});
    });
    
    return () => handle.cancel();
  }, [isAuthenticated, appIsReady, loadBookmarks, clearBookmarks]);

  // Prefetch feed in background after app is fully ready and interactions complete
  useEffect(() => {
    if (!appIsReady) return;

    const currentUser = useUserStore.getState().currentUser;
    if (currentUser?.did) {
      // Defer feed prefetching until after interactions complete
      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        // Prefetch feed in background (non-blocking)
        queryClient.prefetchInfiniteQuery({
          queryKey: createQueryKeys.feed.infinite('following', currentUser.did),
          queryFn: ({ pageParam }) => feedService.fetchFeed('following', currentUser.did, pageParam as string),
          initialPageParam: null,
          getNextPageParam: (lastPage) => lastPage.cursor,
        }).catch(() => {});
      });

      return () => {
        interactionHandle.cancel();
      };
    }
  }, [appIsReady]);

  // Determine when app is ready (fonts loaded, initialization complete, auth state determined)
  useEffect(() => {
    const checkAppReady = () => {
      // App is ready when fonts are loaded, initialization is complete, and auth state is determined
      if (fontsLoaded && !isInitializing && !isAuthenticating) {
        setAppIsReady(true);
      }
    };
    checkAppReady();
  }, [fontsLoaded, isInitializing, isAuthenticating]);

  // Hide splash screen when app is ready and layout is complete
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  // Timeout fallback to ensure splash screen doesn't stay forever
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!appIsReady) {
        // Force app ready state and hide splash after 5 seconds as fallback
        // This ensures the app always renders even if something goes wrong
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [appIsReady]);

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

  // Show nothing while loading - splash screen will be visible
  if (isInitializing || isAuthenticating || !fontsLoaded) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <AppProviders>
        <View style={styles.rootView} onLayout={onLayoutRootView}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} hidden={false} />
          <LinearGradient
            colors={['transparent', Colors.black]}
            style={[styles.bottomGradient, { height: 45 + insets.bottom }]}
            pointerEvents="none"
          />
          <LoginScreen onLogin={handleLogin} onAccountSwitch={handleAccountSwitch} />
        </View>
      </AppProviders>
    );
  }

  return (
    <AppProviders>
      <View style={styles.rootView} onLayout={onLayoutRootView}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} hidden={false} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(modals)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen 
            name="oauth/callback" 
            options={{ 
              headerShown: false,
              animation: 'none',
              gestureEnabled: false,
            }} 
          />
          <Stack.Screen 
            name="video-trimmer" 
            options={{ 
              headerShown: false,
              animation: 'fade',
              gestureEnabled: false,
            }} 
          />
          <Stack.Screen name="video-editor" options={{ headerShown: false }} />
          <Stack.Screen name="video-processing" options={{ headerShown: false }} />
          <Stack.Screen 
            name="post/[id]" 
            options={{ 
              headerShown: false,
              animation: 'fade',
              gestureEnabled: false,
            }} 
          />
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
          <Stack.Screen 
            name="edit-profile" 
            options={{ 
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom'
            }} 
          />
        </Stack>
        <GlobalModals />
      </View>
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  rootView: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  gestureHandler: {
    flex: 1,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

