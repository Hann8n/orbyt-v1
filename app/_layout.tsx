import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Appearance,
  AppState,
  InteractionManager,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { setVideoCacheSizeAsync } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import * as Updates from 'expo-updates';

// Keep local imports where they are; no file moves
import { Colors } from '../src/components/ui/UI';
import { useUserStore } from '../src/stores/userStore';
import { migrateAsyncStorageToMMKV } from '../src/utils/storage';
import { useBookmarkStore } from '../src/stores/bookmarkStore';
import { feedService } from '../src/services/FeedService';
import { queryKeys } from '../src/utils/query/queryKeys';
import ShareSheet from '../src/components/ui/ShareSheet';
import CommentSection from '../src/components/features/comments/CommentSection';
import GlobalAccountSwitcher from '../src/components/ui/GlobalAccountSwitcher';
import { useVisibilityCoreStore } from '../src/core/visibility';
import { queryClient } from '../src/utils/query/queryClient';
import { QueryErrorBoundary } from '../src/components/ui/QueryErrorBoundary';
import { SessionProvider, useSession } from '../src/context/SessionProvider';
import { TabBarProvider } from '../src/context/FeedIndicatorContext';
import { seenVideoService } from '../src/services/SeenVideoService';
import { storage } from '../src/utils/storage/storage';
import { logger } from '../src/utils/logger';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            <TabBarProvider>{children}</TabBarProvider>
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
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={Platform.OS === 'android'}
        hidden={false}
      />
      {!isAuthenticated && (
        <LinearGradient
          colors={['transparent', Colors.black]}
          style={[styles.bottomGradient, { height: 45 + insets.bottom }]}
          pointerEvents="none"
        />
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.black },
          animation: 'slide_from_right',
        }}
      >
        {/* Protected routes - require authentication */}
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="(modals)/feed"
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              gestureEnabled: true,
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="create"
            options={{
              animation: 'fade',
              animationDuration: 200,
            }}
          />
          <Stack.Screen name="video-editor" />
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
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="edit-profile"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
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

// Visibility hook for inline logic - tracks app state only
// Tab/route tracking handled by useVisibilityRouteTracker in individual screens
// With freezeOnBlur: true, route tracking via useIsFocused() correctly handles frozen tabs
const useVisibilityTracking = () => {
  const setAppState = useVisibilityCoreStore(state => state.setAppState);

  useEffect(() => {
    const initialState = AppState.currentState;
    setAppState(initialState);

    const subscription = AppState.addEventListener('change', nextState => {
      setAppState(nextState);
    });

    return () => subscription.remove();
  }, [setAppState]);
};

export default function RootLayout() {
  // Inline visibility tracking
  useVisibilityTracking();

  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const initializeUserState = useUserStore(state => state.initializeUserState);
  const loadBookmarks = useBookmarkStore(state => state.loadBookmarks);
  const clearBookmarks = useBookmarkStore(state => state.clearBookmarks);

  const [isInitializing, setIsInitializing] = useState(true);
  // Fallback flag so we can force readiness after a timeout without setting state in effects
  const [fallbackReady, setFallbackReady] = useState(false);
  const appIsReady = useMemo(
    () => fallbackReady || !isInitializing,
    [fallbackReady, isInitializing]
  );

  // Set Android navigation bar button style (light)
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }
  }, []);

  // Check for OTA updates on app load
  useEffect(() => {
    const checkForUpdates = async () => {
      if (__DEV__) {
        // Updates are disabled in development mode
        return;
      }

      try {
        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          // Reload the app to apply the update
          // Note: This will only happen on the next app launch after the update is downloaded
          // To apply immediately, you can call Updates.reloadAsync() here, but it will
          // interrupt the user's current session
          logger?.info?.('OTA update downloaded and will be applied on next app restart');
        }
      } catch (error) {
        // Log but don't block app initialization if update check fails
        logger?.warn?.('Failed to check for OTA updates', { error });
      }
    };

    checkForUpdates();
  }, []);

  // Parallel initialization: fonts and auth state load simultaneously
  useEffect(() => {
    const initializeApp = async () => {
      // Set video cache size FIRST, before any video players can be created
      // This must happen before any components using expo-video mount
      // Using default 1GB cache size (expo-video default)
      try {
        await setVideoCacheSizeAsync(1024 * 1024 * 1024); // 1GB (default)
      } catch (error) {
        // If this fails, it's non-critical - app will use default cache settings
        // Log but don't block initialization
        console.warn('Failed to set video cache size:', error);
      }

      // Migrate AsyncStorage to MMKV (one-time migration)
      await migrateAsyncStorageToMMKV();

      // Initialize user state
      await initializeUserState();

      setIsInitializing(false);
    };

    initializeApp();
  }, [initializeUserState]);

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

  // Initialize seen video service and subscribe to user changes
  useEffect(() => {
    // Initialize with current user
    const currentUser = useUserStore.getState().currentUser;
    seenVideoService.setUserDid(currentUser?.did ?? null);

    // Subscribe to user changes (account switching)
    const unsubscribe = useUserStore.subscribe(state => {
      const currentUser = state.currentUser;
      seenVideoService.setUserDid(currentUser?.did ?? null);
    });

    // Run cleanup on app start (defer to avoid blocking startup)
    InteractionManager.runAfterInteractions(async () => {
      try {
        // Check last cleanup time (store in MMKV)
        const lastCleanupKey = 'seen_videos_last_cleanup';
        const lastCleanup = storage.getNumber(lastCleanupKey) ?? 0;
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        if (lastCleanup < sevenDaysAgo) {
          const deleted = await seenVideoService.cleanupOldEntries(30); // 30 day retention
          storage.set(lastCleanupKey, Date.now());
          logger?.info?.(`Cleaned up ${deleted} old seen video entries`);
        }
      } catch (error) {
        logger?.warn?.('Failed to cleanup seen videos', { error });
      }
    });

    return unsubscribe;
  }, []);

  // Prefetch feed in background after app is fully ready and interactions complete
  useEffect(() => {
    if (!appIsReady) return undefined;

    const currentUser = useUserStore.getState().currentUser;
    if (currentUser?.did) {
      // Defer feed prefetching until after interactions complete
      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        // Prefetch feed in background (non-blocking)
        queryClient
          .prefetchInfiniteQuery({
            queryKey: queryKeys.feed.infinite('following', currentUser.did ?? ''),
            queryFn: ({ pageParam }: { pageParam: string | null }) =>
              feedService.fetchFeed('following', currentUser.did ?? '', pageParam ?? undefined),
            initialPageParam: null as string | null,
            getNextPageParam: (lastPage: { cursor?: string | null }) => lastPage.cursor ?? null,
          })
          .catch(() => {});
      });

      return () => {
        interactionHandle.cancel();
      };
    }
    return undefined;
  }, [appIsReady]);

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
      setFallbackReady(true);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  // Show nothing while initializing - splash screen will be visible
  if (isInitializing) {
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
  toastWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  toast: {
    backgroundColor: Colors.white,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    maxWidth: undefined,
    alignSelf: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  toastText: {
    color: Colors.black,
    fontSize: 17,
    fontFamily: 'Figtree-Bold',
    textAlign: 'center',
  },
  toastAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    position: 'absolute',
    top: 6,
    left: 6,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarSpinner: {
    position: 'absolute',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
});
