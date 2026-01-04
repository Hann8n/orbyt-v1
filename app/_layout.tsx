import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar, Appearance, AppState, InteractionManager, Platform } from 'react-native';
import { Stack, useSegments } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
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
import { useUserStore } from '../src/stores/userStore';
import { migrateAsyncStorageToMMKV } from '../src/utils/storage';
import { useBookmarkStore } from '../src/stores/bookmarkStore';
import { CommonErrorHandlers } from '../src/utils/errorHandler';
import { feedService, createQueryKeys } from '../src/services/FeedService';
import ShareSheet from '../src/components/ui/ShareSheet';
import CommentSection from '../src/components/features/comments/CommentSection';
import GlobalAccountSwitcher from '../src/components/ui/GlobalAccountSwitcher';
import { useVisibilityCoreStore } from '../src/core/visibility';
import { queryClient } from '../src/utils/queryClient';
import { QueryErrorBoundary } from '../src/components/ui/QueryErrorBoundary';
import { SessionProvider, useSession } from '../src/context/SessionProvider';

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

// RootNavigator - handles route protection using Stack.Protected
function RootNavigator() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useUserStore(state => state.isAuthenticated);

  return (
    <View style={styles.rootView}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} hidden={false} />
      {!isAuthenticated && (
        <LinearGradient
          colors={['transparent', Colors.black]}
          style={[styles.bottomGradient, { height: 45 + insets.bottom }]}
          pointerEvents="none"
        />
      )}
      <Stack screenOptions={{ headerShown: false }}>
        {/* Protected routes - require authentication */}
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(modals)" />
          <Stack.Screen 
            name="create" 
            options={{ 
              animation: 'fade',
              animationDuration: 200,
            }} 
          />
          <Stack.Screen name="video-editor" />
          <Stack.Screen name="video-processing" />
          <Stack.Screen name="video-trimmer" />
          <Stack.Screen 
            name="post/[id]" 
            options={{ 
              animation: 'fade',
              gestureEnabled: false,
            }} 
          />
          <Stack.Screen name="channel/[id]" />
          <Stack.Screen name="profile/[did]" />
          <Stack.Screen name="chat" />
          <Stack.Screen 
            name="settings" 
            options={{ 
              presentation: 'modal',
              animation: 'slide_from_bottom'
            }} 
          />
          <Stack.Screen 
            name="edit-profile" 
            options={{ 
              presentation: 'modal',
              animation: 'slide_from_bottom'
            }} 
          />
        </Stack.Protected>

        {/* Public routes - accessible without authentication */}
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
          <Stack.Screen name="advanced-login" />
        </Stack.Protected>

        {/* Always accessible routes */}
        <Stack.Screen 
          name="oauth/callback" 
          options={{ 
            animation: 'none',
            gestureEnabled: false,
          }} 
        />
        <Stack.Screen name="index" />
      </Stack>
      {isAuthenticated && <GlobalModals />}
    </View>
  );
}

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
  
  // Inline visibility tracking
  useVisibilityTracking();
  
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
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
    if (!appIsReady) return undefined;

    const currentUser = useUserStore.getState().currentUser;
    if (currentUser?.did) {
      // Defer feed prefetching until after interactions complete
      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        // Prefetch feed in background (non-blocking)
        queryClient.prefetchInfiniteQuery({
          queryKey: createQueryKeys.feed.infinite('following', currentUser.did ?? ''),
          queryFn: ({ pageParam }: { pageParam: string | null }) => feedService.fetchFeed('following', currentUser.did ?? '', pageParam ?? undefined),
          initialPageParam: null as string | null,
          getNextPageParam: (lastPage: { cursor?: string | null }) => lastPage.cursor ?? null,
        }).catch(() => {});
      });

      return () => {
        interactionHandle.cancel();
      };
    }
    return undefined;
  }, [appIsReady]);

  // Determine when app is ready (fonts loaded, initialization complete)
  useEffect(() => {
    if (fontsLoaded && !isInitializing) {
      setAppIsReady(true);
    }
  }, [fontsLoaded, isInitializing]);

  // Hide splash screen when app is ready
  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore errors - splash screen might already be hidden
      });
    }
  }, [appIsReady]);

  // Timeout fallback to ensure splash screen doesn't stay forever
  useEffect(() => {
    const timeout = setTimeout(() => {
      setAppIsReady(true);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  // Show nothing while loading fonts and initializing - splash screen will be visible
  if (isInitializing || !fontsLoaded) {
    return null;
  }

  return (
    <AppProviders>
      <SessionProvider>
        <QueryErrorBoundary level="root">
          <RootNavigator />
        </QueryErrorBoundary>
      </SessionProvider>
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

