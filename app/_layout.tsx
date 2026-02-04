import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar, Appearance, AppState, Platform } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
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
import { LinearGradient } from '../src/components/ui/LinearGradient';

// Keep local imports where they are; no file moves
import { Colors } from '../src/theme';
import { useUserStore } from '../src/stores/userStore';
import { migrateAsyncStorageToMMKV } from '../src/utils/storage';
import { useBookmarkStore } from '../src/stores/bookmarkStore';
import { ShareSheet } from '../src/components/ui/share-sheet';
import CommentSection from '../src/components/features/comments/CommentSection';
import GlobalAccountSwitcher from '../src/components/ui/GlobalAccountSwitcher';
import EmailVerificationModal from '../src/components/ui/EmailVerificationModal';
import { useVisibilityCoreStore } from '../src/core/visibility';
import { queryClient } from '../src/utils/query/queryClient';
import { QueryErrorBoundary } from '../src/components/ui/QueryErrorBoundary';
import { SessionProvider, useSession } from '../src/context/SessionProvider';
import { SplashScreenController } from '../src/components/ui/SplashScreenController';
import { TabBarProvider } from '../src/context/FeedIndicatorContext';
import { OverlayLayoutProvider } from '../src/context/OverlayLayoutContext';
import { seenVideoService } from '../src/services/SeenVideoService';
import { storage } from '../src/utils/storage/storage';
import { logger } from '../src/utils/logger';
import { APP_CONSTANTS } from '../src/utils/constants';

// Configure Reanimated logger to disable strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

// Configure splash screen animation options
SplashScreen.setOptions({
  duration: 400,
  fade: true,
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
            <TabBarProvider>
              <OverlayLayoutProvider>{children}</OverlayLayoutProvider>
            </TabBarProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
};

// Global modals component
const GlobalModals: React.FC = () => {
  const isFeedModal = usePathname() === '/(modals)/feed';
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const currentUser = useUserStore(state => state.currentUser);
  const showEmailVerificationModal = useUserStore(state => state.showEmailVerificationModal);
  const setShowEmailVerificationModal = useUserStore(state => state.setShowEmailVerificationModal);

  // Reset modal flag when user/DID changes (account switch) or email gets verified
  const prevDid = React.useRef(currentUser?.did);

  useEffect(() => {
    if (prevDid.current !== currentUser?.did) {
      prevDid.current = currentUser?.did;
      setShowEmailVerificationModal(false);
    }

    if (currentUser?.emailConfirmed === true) {
      // Reset flag if email gets confirmed
      setShowEmailVerificationModal(false);
    }
  }, [currentUser?.emailConfirmed, currentUser?.did, setShowEmailVerificationModal]);

  const handleCloseEmailModal = () => {
    setShowEmailVerificationModal(false);
  };

  return (
    <>
      <ShareSheet />
      {!isFeedModal && <CommentSection />}
      <GlobalAccountSwitcher />
      {isAuthenticated && (
        <EmailVerificationModal
          visible={showEmailVerificationModal}
          onClose={handleCloseEmailModal}
        />
      )}
    </>
  );
};

const canAccessCreate = (emailConfirmed: boolean | undefined | null) =>
  emailConfirmed === undefined || emailConfirmed !== false;

const modalSlideUpOptions = {
  presentation: 'modal' as const,
  animation: 'slide_from_bottom' as const,
};

// Initial route settings for Expo Router
export const unstable_settings = {
  // Ensure Stack.Protected redirects to login when unauthenticated
  initialRouteName: '(tabs)',
};

// RootNavigator - handles route protection using Stack.Protected
// Following Expo Router's recommended authentication pattern
function RootNavigator() {
  const { session, isLoading } = useSession();
  const insets = useSafeAreaInsets();
  const currentUser = useUserStore(state => state.currentUser);
  const modalProfileEnabled = useUserStore(state => state.modalProfileEnabled);

  // Don't render navigation until auth state is determined
  // This prevents the login screen from flashing before session is restored
  if (isLoading) {
    return null;
  }

  return (
    <View style={styles.rootView}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={Platform.OS === 'android'}
        hidden={false}
      />
      {!session && (
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
          animation: 'fade',
          freezeOnBlur: true,
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
          {/* Protected create route - require email confirmation if email exists */}
          <Stack.Protected guard={canAccessCreate(currentUser?.emailConfirmed ?? null)}>
            <Stack.Screen
              name="create"
              options={{
                animation: 'fade',
                animationDuration: 200,
              }}
            />
          </Stack.Protected>
          {__DEV__ && <Stack.Screen name="video-editor" />}
          <Stack.Screen name="video-trimmer" />
          <Stack.Screen
            name="post/[id]"
            options={{
              animation: 'fade',
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="channel/[id]"
            options={{
              headerShown: false,
              presentation: modalProfileEnabled ? 'modal' : 'card',
              gestureEnabled: true,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="profile/[did]"
            options={{
              headerShown: false,
              presentation: modalProfileEnabled ? 'modal' : 'card',
              gestureEnabled: true,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="chat/[id]"
            options={{
              headerShown: false,
              presentation: 'card',
              gestureEnabled: true,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen name="settings" options={modalSlideUpOptions} />
          <Stack.Screen name="edit-profile" options={modalSlideUpOptions} />
        </Stack.Protected>

        {/* Public routes - accessible without authentication */}
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
          <Stack.Screen
            name="advanced-login"
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
        </Stack.Protected>

        {/* OAuth callback - always accessible for deep link handling */}
        <Stack.Screen
          name="oauth/callback"
          options={{
            animation: 'none',
            gestureEnabled: false,
          }}
        />
      </Stack>
      {!!session && <GlobalModals />}
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

  // Set Android navigation bar button style (light)
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }
  }, []);

  // Initialize app - run in parallel, don't block rendering
  // Splash screen is controlled by SessionProvider.isLoading (auth state only)
  useEffect(() => {
    const initializeApp = async () => {
      // Preload sprite sheet for TV static animation (non-blocking)
      const { preloadSpriteSheet } = require('../src/components/ui/AnimatedTVStatic');
      preloadSpriteSheet().catch(() => {});

      // Migrate AsyncStorage to MMKV (one-time migration)
      await migrateAsyncStorageToMMKV();

      // Initialize user state - this sets isInitializingAuth which controls splash screen
      await initializeUserState();
    };

    initializeApp();
  }, [initializeUserState]);

  // Load bookmarks when user is authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      clearBookmarks();
      return;
    }

    // Defer until interactions complete (service already checks authentication state)
    const id = requestIdleCallback(
      () => {
        loadBookmarks().catch(() => {});
      },
      { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
    );

    return () => cancelIdleCallback(id);
  }, [isAuthenticated, loadBookmarks, clearBookmarks]);

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
    requestIdleCallback(
      async () => {
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
      },
      { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
    );

    return unsubscribe;
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <AppProviders>
        <SessionProvider>
          <SplashScreenController />
          <QueryErrorBoundary level="root">
            <RootNavigator />
          </QueryErrorBoundary>
        </SessionProvider>
      </AppProviders>
    </ThemeProvider>
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
