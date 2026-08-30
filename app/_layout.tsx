import '@/i18n';
import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
// Keep local imports where they are; no file moves
import { Colors } from '@/theme';
import { selectIsSessionValid, useUserStore } from '@/stores/userStore';
import { useBookmarkStore } from '@/stores/bookmarkStore';
import { useBookmarksQuery } from '@/hooks/useBookmarksQuery';
import GlobalAccountSwitcher from '@/components/ui/GlobalAccountSwitcher';
import { EmailVerificationModal } from '@/components/ui/EmailVerificationModal';
import { queryClient } from '@/utils/query/queryClient';
import { QueryErrorBoundary } from '@/components/ui/QueryErrorBoundary';
import { useModalStore } from '@/stores/modalStore';
import { dismissAllSheets } from '@/utils/navigation';
import { TabBarProvider } from '@/context/FeedIndicatorContext';
import { seenVideoService } from '@/services/SeenVideoService';
import { storage } from '@/utils/storage/storage';
import { logger } from '@/utils/logger';
import { APP_CONSTANTS } from '@/utils/constants';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { LocaleSync } from '@/i18n/LocaleSync';
import * as Sentry from '@sentry/react-native';
import '@react-native-firebase/app';
import { getAnalytics, logScreenView } from '@react-native-firebase/analytics';
import { useResponsiveTypography } from '@/utils/components/typography';

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: 'https://f2e61d33071557e11913fd3407ba7421@o4510432459096064.ingest.us.sentry.io/4510432460537856',

  sendDefaultPii: true,
  enableLogs: true,
  tracesSampleRate: 1.0,
  enableUserInteractionTracing: true,

  profilesSampleRate: 1.0,
  _experiments: {
    androidProfilingOptions: {
      profileSessionSampleRate: 1.0,
      lifecycle: 'trace',
      startOnAppStart: true,
    },
  },

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  attachViewHierarchy: true,

  integrations: [
    navigationIntegration,
    Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
    }),
    Sentry.feedbackIntegration({
      colorScheme: 'system',
      enableTakeScreenshot: true,
    }),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

const LazyShareSheet = React.lazy(async () => ({
  default: (await import('@/components/ui/share-sheet')).ShareSheet,
}));
const LazyCommentSection = React.lazy(
  () => import('@/components/features/comments/CommentSection')
);

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.setOptions({
  duration: 400,
  fade: true,
});

SplashScreen.preventAutoHideAsync().catch(error => {
  logger.debug('SplashScreen.preventAutoHideAsync failed', { error });
});

// Component to handle bookmarks query inside QueryClientProvider
const BookmarksQueryHandler: React.FC = () => {
  useBookmarksQuery();
  return null;
};

// Consolidated providers wrapper
const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <LocaleSync />
        <BookmarksQueryHandler />
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
  const isAuthenticated = useUserStore(selectIsSessionValid);
  const currentUser = useUserStore(state => state.currentUser);
  const showEmailVerificationModal = useUserStore(state => state.showEmailVerificationModal);
  const setShowEmailVerificationModal = useUserStore(state => state.setShowEmailVerificationModal);
  const [isDeferredModalMountReady, setIsDeferredModalMountReady] = React.useState(false);

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

  useEffect(() => {
    const deferredMount = requestAnimationFrame(() => {
      setIsDeferredModalMountReady(true);
    });

    return () => {
      cancelAnimationFrame(deferredMount);
    };
  }, []);

  const handleCloseEmailModal = () => {
    setShowEmailVerificationModal(false);
  };

  return (
    <>
      {isDeferredModalMountReady && (
        <React.Suspense fallback={null}>
          <LazyShareSheet />
          <LazyCommentSection />
        </React.Suspense>
      )}
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

const cardSlideFromRightOptions = {
  headerShown: false,
  presentation: 'card' as const,
  gestureEnabled: true,
  animation: 'slide_from_right' as const,
};

// RootNavigator - handles route protection using Stack.Protected
// Following Expo Router's recommended authentication pattern
function RootNavigator() {
  const isAuthenticated = useUserStore(selectIsSessionValid);
  const currentUser = useUserStore(state => state.currentUser);
  const resetAllModals = useModalStore(state => state.resetAllModals);

  useEffect(() => {
    if (!isAuthenticated) {
      dismissAllSheets();
      resetAllModals();
    }
  }, [isAuthenticated, resetAllModals]);

  return (
    <View style={styles.rootView}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.black },
          animation: 'fade',
          freezeOnBlur: true,
        }}
      >
        {/* Protected routes - require authentication */}
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          {/* Protected create route - require email confirmation if email exists */}
          <Stack.Protected guard={canAccessCreate(currentUser?.emailConfirmed ?? null)}>
            <Stack.Screen
              name="create"
              options={{
                animation: 'fade',
                animationDuration: 200,
                // Vision Camera + useVideoOutput need a normal lifecycle; stack freezeOnBlur can leave
                // the session in a bad state when returning from post.
                freezeOnBlur: false,
              }}
            />
          </Stack.Protected>
          <Stack.Screen name="video-trimmer" />
          <Stack.Screen
            name="post/[id]"
            options={{
              animation: 'fade',
              gestureEnabled: false,
            }}
          />
          <Stack.Screen name="channel/[id]" options={cardSlideFromRightOptions} />
          <Stack.Screen name="chat/[id]" options={cardSlideFromRightOptions} />
          <Stack.Screen name="chat/requests" options={cardSlideFromRightOptions} />
          <Stack.Screen name="settings" options={modalSlideUpOptions} />
          <Stack.Screen name="edit-profile" options={modalSlideUpOptions} />
          <Stack.Screen name="add-account" options={modalSlideUpOptions} />
          <Stack.Screen
            name="profile-image-viewer"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              animationDuration: 200,
              headerShown: false,
              contentStyle: { backgroundColor: Colors.transparent },
            }}
          />
        </Stack.Protected>

        {/* Public routes - cold auth only; guard flip removes these together (no post-login flash) */}
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" />
          <Stack.Screen name="login-sign-in" options={modalSlideUpOptions} />
          <Stack.Screen name="login-sign-up" options={modalSlideUpOptions} />
        </Stack.Protected>
      </Stack>
      {isAuthenticated && <GlobalModals />}
    </View>
  );
}

export default Sentry.wrap(function RootLayout() {
  const navRef = useNavigationContainerRef();
  useEffect(() => {
    navigationIntegration.registerNavigationContainer(navRef);
  }, [navRef]);

  useEffect(() => {
    return navRef.current?.addListener('state', () => {
      const route = navRef.current?.getCurrentRoute() as { name?: string } | undefined;
      if (route?.name) {
        // Analytics must never break rendering (e.g. Firebase not configured in local dev builds)
        try {
          logScreenView(getAnalytics(), {
            screen_name: route.name,
            screen_class: route.name,
          }).catch(() => {});
        } catch {}
      }
    });
  }, [navRef]);

  useResponsiveTypography();

  const isAuthenticated = useUserStore(selectIsSessionValid);
  const initializeUserState = useUserStore(state => state.initializeUserState);
  const clearBookmarks = useBookmarkStore(state => state.clearBookmarks);
  const isInitializingAuth = useUserStore(state => state.isInitializingAuth);

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setStyle('light');
    }
  }, []);

  useEffect(() => {
    let teardown: (() => void) | null = null;

    const setFocusedFromAppState = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };

    const syncOnlineState = async () => {
      const state = await Network.getNetworkStateAsync();
      onlineManager.setOnline(state.isInternetReachable ?? true);
    };

    setFocusedFromAppState(AppState.currentState);
    const appStateSub = AppState.addEventListener('change', status => {
      setFocusedFromAppState(status);
      if (status === 'active') {
        void syncOnlineState();
      }
    });

    // Set initial online state and let onlineManager handle pausing offline queries
    void syncOnlineState();

    teardown = () => {
      appStateSub.remove();
      teardown = null;
    };

    return teardown;
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const { preloadSpriteSheet } = require('@/components/ui/AnimatedTVStatic');
        const { preloadRocketSpriteSheet } = require('@/components/ui/RocketBackground');
        preloadSpriteSheet().catch(() => {});
        preloadRocketSpriteSheet().catch(() => {});

        await initializeUserState();
      } catch (error) {
        logger.error('[boot] initializeApp failed', error as Error);
      }
    };

    initializeApp();
  }, [initializeUserState]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearBookmarks();
    }
  }, [isAuthenticated, clearBookmarks]);

  useEffect(() => {
    const currentUser = useUserStore.getState().currentUser;
    seenVideoService.setUserDid(currentUser?.did ?? null);

    const unsubscribe = useUserStore.subscribe(state => {
      const currentUser = state.currentUser;
      seenVideoService.setUserDid(currentUser?.did ?? null);
    });

    requestIdleCallback(
      async () => {
        try {
          const lastCleanupKey = 'seen_videos_last_cleanup';
          const lastCleanup = storage.getNumber(lastCleanupKey) ?? 0;
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

          if (lastCleanup < sevenDaysAgo) {
            const deleted = await seenVideoService.cleanupOldEntries(30);
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

  const isAppReady = !isInitializingAuth;

  const didHideSplashRef = React.useRef(false);
  useEffect(() => {
    if (!isAppReady || didHideSplashRef.current) return;
    didHideSplashRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [isAppReady]);

  if (!isAppReady) {
    return null;
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <AppProviders>
        <QueryErrorBoundary level="root">
          <RootNavigator />
        </QueryErrorBoundary>
      </AppProviders>
    </ThemeProvider>
  );
});

const styles = StyleSheet.create({
  rootView: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  gestureHandler: {
    flex: 1,
  },
});
