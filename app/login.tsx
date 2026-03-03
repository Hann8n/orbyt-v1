import { useState, useCallback, useMemo } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path, Rect, Defs, Mask } from 'react-native-svg';
import { Colors } from '../src/theme';
import AuthorItem from '../src/components/ui/AuthorItem';
import type { SavedAccount } from '../src/stores/userStore';
import { useAuth, useAccountManagement } from '../src/stores/userStore';
import { hexToRGBA } from '../src/utils/formatting/colors';
import RocketBackground from '../src/components/ui/RocketBackground';
import SignUpSheet from '../src/components/ui/SignUpSheet';
import LoginSheet from '../src/components/ui/LoginSheet';

// Login logo: PNG 4x on Android (avoids SVG stroke clipping), SVG on iOS
const orbytLogoLoginPng = require('../src/assets/orbyt-logo-login.png');
const atSignSky = require('../src/assets/at-sign-sky.png');

interface LoginScreenProps {
  onAccountSwitch?: (account: SavedAccount) => Promise<void>;
}

export default function LoginScreen({ onAccountSwitch }: LoginScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [showSignUpSheet, setShowSignUpSheet] = useState<boolean>(false);
  const [showLoginSheet, setShowLoginSheet] = useState<boolean>(false);

  // User store hooks
  const { signIn, clearAuthError } = useAuth();

  const { savedAccounts, switchAccount, loadSavedAccounts, checkAccountSessionValidity } =
    useAccountManagement();

  const handleLoginSignIn = useCallback(
    async (identifier: string) => {
      await signIn(identifier);
      await loadSavedAccounts();
    },
    [signIn, loadSavedAccounts]
  );

  const hasSavedAccounts = savedAccounts.length > 0;
  const loginButtonsInsetStyle = useMemo(
    () => ({
      paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom + 16 : 16,
    }),
    [insets?.bottom]
  );
  const containerInsetStyle = useMemo(
    () => ({
      paddingTop: typeof insets?.top === 'number' ? insets.top : 0,
      paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom : 0,
    }),
    [insets?.top, insets?.bottom]
  );

  const handleSavedAccountLogin = async (account: SavedAccount) => {
    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      // First check if the account has a valid session
      const hasValidSession = await checkAccountSessionValidity(account.did);

      if (!hasValidSession) {
        setIsLoading(false);

        Alert.alert(
          'Session Expired',
          `Your session for @${account.handle} has expired. You need to sign in again.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign In',
              onPress: async () => {
                // Use the account's original identifier for re-authentication
                await signIn(account.originalIdentifier);
                await loadSavedAccounts();
              },
            },
          ]
        );
        return;
      }

      // Session is valid, proceed with account switch
      await switchAccount(account.did);

      if (onAccountSwitch) {
        await onAccountSwitch(account);
      }

      // Stack.Protected automatically redirects when session is set
      // No manual navigation needed
    } catch (error) {
      setIsLoading(false);
      const errorMessage = error instanceof Error ? error.message : 'Account switch failed';

      const isUserCancellation =
        errorMessage.includes('cancelled') || errorMessage.includes('user_cancelled');

      if (!isUserCancellation) {
        // Check if this is a session corruption issue
        if (
          errorMessage.includes('Session expired') ||
          errorMessage.includes('Unable to restore session') ||
          errorMessage.includes('oauth_reauth_required') ||
          errorMessage.includes('No session available')
        ) {
          Alert.alert(
            'Session Issue',
            `There's an issue with the saved session for @${account.handle}. This can happen after app updates or device changes.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign In',
                onPress: async () => {
                  // Use the account's original identifier for re-authentication
                  await signIn(account.originalIdentifier);
                  await loadSavedAccounts();
                },
              },
            ]
          );
        } else if (
          errorMessage.includes('Network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ETIMEDOUT')
        ) {
          // Network error
          Alert.alert(
            'Network Error',
            `Unable to connect to the server. Please check your internet connection and try again.`,
            [{ text: 'OK' }]
          );
        } else if (errorMessage.includes('rate limit') || errorMessage.includes('Rate Limit')) {
          // Rate limit error
          Alert.alert(
            'Rate Limit Exceeded',
            `Too many login attempts. Please wait a few minutes and try again.`,
            [{ text: 'OK' }]
          );
        } else {
          // Show detailed error information for debugging
          Alert.alert(
            'Account Switch Failed',
            `Failed to switch to @${account.handle}.\n\nError: ${errorMessage}\n\nPlease try signing in again.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign In',
                onPress: async () => {
                  // Use the account's original identifier for re-authentication
                  await signIn(account.originalIdentifier);
                  await loadSavedAccounts();
                },
              },
            ]
          );
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderSavedAccounts = () => (
    <View style={styles.savedAccountsContainer}>
      <View style={styles.headerSection}>
        <Text style={styles.chooseAccountTitle}>Choose an Account</Text>
        <Text style={styles.chooseAccountSubtitle}>
          Select an account to continue or sign in with a new one
        </Text>
      </View>

      <View style={styles.accountsSection}>
        <ScrollView
          style={styles.accountsList}
          contentContainerStyle={styles.accountsListContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          overScrollMode="always"
          scrollEventThrottle={16}
          decelerationRate="normal"
        >
          {savedAccounts.map((account, index) => (
            <AuthorItem
              key={account.did}
              handle={account.handle}
              did={account.did}
              displayName={account.displayName || account.handle || 'User'}
              avatar={account.avatar}
              onPress={() => handleSavedAccountLogin(account)}
              size="large"
              showArrow={true}
              style={[
                index === 0 && styles.firstAccountItem,
                index === savedAccounts.length - 1 && styles.lastAccountItem,
              ]}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );

  const renderLoginButtons = () => {
    const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
    const textColor = useLiquidGlass ? '#fff' : Colors.black;
    const buttonTextStyle = useLiquidGlass
      ? styles.blueskyButtonTextGlass
      : styles.blueskyButtonText;

    const signInButtonContent = (
      <View style={styles.buttonContent} pointerEvents="none">
        {isLoading ? (
          <>
            <ActivityIndicator size="small" color={textColor} style={styles.loadingIcon} />
            <Text style={buttonTextStyle}>Signing in...</Text>
          </>
        ) : (
          <>
            <Image source={atSignSky} style={styles.atSignImage} />
            <Text style={buttonTextStyle}>Sign in with your handle</Text>
          </>
        )}
      </View>
    );

    return (
      <View style={[styles.loginButtonsContainer, loginButtonsInsetStyle]}>
        {/* Sign in button */}
        <Pressable
          style={[styles.liquidGlassButton, !useLiquidGlass && styles.whiteButton]}
          onPress={() => !isLoading && setShowLoginSheet(true)}
          disabled={isLoading}
        >
          {useLiquidGlass ? (
            <>
              <GlassView
                style={styles.glassBackground}
                glassEffectStyle="clear"
                tintColor="rgba(255, 255, 255, 0)"
                isInteractive
              />
              {signInButtonContent}
            </>
          ) : (
            signInButtonContent
          )}
        </Pressable>

        {/* Sign up link */}
        <View style={styles.manualSignInLink}>
          <Text style={styles.networkSignInText}>
            Need an account?{' '}
            <Text
              suppressHighlighting
              onPress={() => !isLoading && setShowSignUpSheet(true)}
              style={[styles.networkSignInLink, isLoading && styles.signUpLinkDisabled]}
            >
              Sign up here.
            </Text>
          </Text>
        </View>
      </View>
    );
  };

  const renderManualLogin = () => (
    <View style={styles.formContainer}>
      {oauthError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{oauthError}</Text>
        </View>
      )}

      {renderLoginButtons()}
    </View>
  );

  const renderContent = () => (
    <View style={styles.backgroundImage}>
      <StatusBar hidden />
      {!hasSavedAccounts && <RocketBackground />}
      <View
        style={[
          styles.container,
          containerInsetStyle,
          hasSavedAccounts
            ? styles.containerWithSavedAccounts
            : styles.containerWithoutSavedAccounts,
        ]}
      >
        {/* Logo and App Name */}
        {!hasSavedAccounts && (
          <View style={styles.logoContainer}>
            {Platform.OS === 'android' ? (
              <Image source={orbytLogoLoginPng} style={styles.logoImage} contentFit="contain" />
            ) : (
              <Svg width={120} height={120} viewBox="32 32 960 960">
                <Defs>
                  <Mask id="cutout-mask-75">
                    <Rect x="65" y="65" width="894" height="894" fill="white" />
                    <Path
                      fill="black"
                      fillOpacity={0.9}
                      fillRule="evenodd"
                      d="M349 129.3c-23.9 5.4-36.8 31.5-26.1 53.2 8 16.2 25.2 24.4 42.1 20.1 7.4-1.9 5.3-3.4 18.5 13.9 10.3 13.6 33.6 44.2 36.7 48.4 3.5 4.6 3.5 4.6-1.1 8.9-5.9 5.6-14.1 16.9-19 26-5 9.4-3.4 8.6-22.1 10.2-136.2 11.1-177 34.7-192.6 111.5-16.5 81.2-16.5 193.6.1 276.7 10.5 52.9 39.8 83.7 89.3 93.9 6 1.3 6 1.3 2.5 8.8-18.4 39.4-5.4 73.1 30 78.1 24.5 3.5 32.3-1.8 73.7-50 20.8-24.3 16.8-22.1 37-20.5 50.9 4.1 138.2 4.1 189 0 20.2-1.6 16.2-3.8 37 20.5 41.4 48.2 49.2 53.5 73.7 50 35.4-5 48.4-38.7 30-78.1-3.5-7.5-3.5-7.5 2.5-8.8 49.5-10.2 78.8-41 89.3-93.9 16.6-83.1 16.6-195.5.1-276.7C824 344.7 783.2 321.1 647 310c-18.7-1.6-17.1-.8-22.1-10.2-4.9-9.1-13.1-20.4-19-26-4.6-4.3-4.6-4.3-1.1-8.9 3.1-4.2 26.4-34.8 36.7-48.4 13.2-17.3 11.1-15.8 18.5-13.9 41.5 10.6 64.2-49.2 26.3-69.3-32-17.1-68 17.2-51.7 49.3 3.1 6.1 3.1 6.1-11.8 25.5-8.2 10.7-20 26-26.1 34.1-11.1 14.8-11.1 14.8-14.7 12.6-44.5-26.5-94.5-26.5-139 0-3.6 2.2-3.6 2.2-14.7-12.6-6.1-8.1-17.9-23.4-26.1-34.1-14.9-19.4-14.9-19.4-11.8-25.5 13.8-27.1-11.7-59.8-41.4-53.3m249.3 243.2C752 381.3 773.8 399.3 781.1 523c5.8 98.9-9.4 168.3-41.5 189.8-59.5 39.8-394.7 39.8-454.2 0-32.1-21.5-47.3-90.9-41.5-189.8 7.7-130.5 28.8-144.8 226.1-152.4 19.3-.8 104.3.5 128.3 1.9Z"
                    />
                    <Rect
                      fill="black"
                      fillOpacity={0.9}
                      x="372"
                      y="482"
                      width="82"
                      height="136"
                      rx="41"
                      ry="41"
                    />
                    <Rect
                      fill="black"
                      fillOpacity={0.9}
                      x="570"
                      y="482"
                      width="82"
                      height="136"
                      rx="41"
                      ry="41"
                    />
                  </Mask>
                </Defs>
                <Path
                  mask="url(#cutout-mask-75)"
                  fill={Colors.neutral[50]}
                  stroke={Colors.neutral[50]}
                  strokeWidth="65"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  d="M349 129.3c-23.9 5.4-36.8 31.5-26.1 53.2 8 16.2 25.2 24.4 42.1 20.1 7.4-1.9 5.3-3.4 18.5 13.9 10.3 13.6 33.6 44.2 36.7 48.4 3.5 4.6 3.5 4.6-1.1 8.9-5.9 5.6-14.1 16.9-19 26-5 9.4-3.4 8.6-22.1 10.2-136.2 11.1-177 34.7-192.6 111.5-16.5 81.2-16.5 193.6.1 276.7 10.5 52.9 39.8 83.7 89.3 93.9 6 1.3 6 1.3 2.5 8.8-18.4 39.4-5.4 73.1 30 78.1 24.5 3.5 32.3-1.8 73.7-50 20.8-24.3 16.8-22.1 37-20.5 50.9 4.1 138.2 4.1 189 0 20.2-1.6 16.2-3.8 37 20.5 41.4 48.2 49.2 53.5 73.7 50 35.4-5 48.4-38.7 30-78.1-3.5-7.5-3.5-7.5 2.5-8.8 49.5-10.2 78.8-41 89.3-93.9 16.6-83.1 16.6-195.5.1-276.7C824 344.7 783.2 321.1 647 310c-18.7-1.6-17.1-.8-22.1-10.2-4.9-9.1-13.1-20.4-19-26-4.6-4.3-4.6-4.3-1.1-8.9 3.1-4.2 26.4-34.8 36.7-48.4 13.2-17.3 11.1-15.8 18.5-13.9 41.5 10.6 64.2-49.2 26.3-69.3-32-17.1-68 17.2-51.7 49.3 3.1 6.1 3.1 6.1-11.8 25.5-8.2 10.7-20 26-26.1 34.1-11.1 14.8-11.1 14.8-14.7 12.6-44.5-26.5-94.5-26.5-139 0-3.6 2.2-3.6 2.2-14.7-12.6-6.1-8.1-17.9-23.4-26.1-34.1-14.9-19.4-14.9-19.4-11.8-25.5 13.8-27.1-11.7-59.8-41.4-53.3Z"
                />
              </Svg>
            )}
            <Text style={styles.appName}>orbyt</Text>
          </View>
        )}

        {hasSavedAccounts ? (
          <>
            {renderSavedAccounts()}
            <View>
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.divider} />
              </View>
              {renderLoginButtons()}
            </View>
          </>
        ) : (
          renderManualLogin()
        )}
      </View>
    </View>
  );

  return (
    <>
      {renderContent()}
      <SignUpSheet visible={showSignUpSheet} onDismiss={() => setShowSignUpSheet(false)} />
      <LoginSheet
        visible={showLoginSheet}
        onDismiss={() => setShowLoginSheet(false)}
        onSignIn={handleLoginSignIn}
        title="Sign in"
      />
    </>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  containerWithSavedAccounts: {
    justifyContent: 'space-between',
    backgroundColor: Colors.black,
  },
  containerWithoutSavedAccounts: {
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay.black50,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 20,
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  appName: {
    color: Colors.neutral[50],
    fontSize: 42,
    fontFamily: 'Figtree-Black',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  loginButtonsContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  liquidGlassButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.FULL,
    marginTop: 8,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 56,
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  whiteButton: {
    backgroundColor: Colors.neutral[50],
  },
  blueskyButtonText: {
    color: Colors.black,
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  blueskyButtonTextGlass: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  signUpLinkDisabled: {
    opacity: 0.5,
  },
  savedAccountsContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    flex: 1,
  },
  chooseAccountTitle: {
    color: Colors.neutral[50],
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
    marginBottom: 8,
    textAlign: 'left',
  },
  chooseAccountSubtitle: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    textAlign: 'left',
    lineHeight: 22,
  },
  headerSection: {
    marginBottom: 32,
  },
  accountsSection: {
    flex: 1,
  },
  accountsList: {
    flex: 1,
  },
  accountsListContent: {
    paddingTop: 8,
  },

  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: hexToRGBA(Colors.coral[500], 0.1),
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: Colors.coral[500],
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIcon: {
    marginRight: 8,
  },
  atSignImage: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  firstAccountItem: {
    marginTop: 0,
  },
  lastAccountItem: {
    marginBottom: 0,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
    marginHorizontal: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.neutral[500],
    opacity: 0.3,
  },
  dividerText: {
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    marginHorizontal: 16,
  },
  manualSignInLink: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
  },
  networkSignInText: {
    color: Colors.neutral[200],
    fontSize: 15,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  networkSignInLink: {
    color: Colors.neutral[200],
    fontFamily: 'Figtree-Bold',
  },
});
