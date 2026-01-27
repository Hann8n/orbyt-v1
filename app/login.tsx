import { useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import { View, Pressable, Text, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import { LinearGradient } from '../src/components/ui/LinearGradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { Loading3FillIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import AuthorItem from '../src/components/ui/AuthorItem';
import { useRouter } from 'expo-router';
import { SavedAccount } from '../src/stores/userStore';
import { useAuth, useAccountManagement } from '../src/stores/userStore';
import { isUserCancellation, getErrorMessage } from '../src/utils/errors/errorHandler';
import { hexToRGBA } from '../src/utils/formatting/colors';

interface LoginScreenProps {
  onLogin?: (handle: string) => Promise<void>;
  onAccountSwitch?: (account: SavedAccount) => Promise<void>;
}

export default function LoginScreen({ onLogin, onAccountSwitch }: LoginScreenProps = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [oauthError, setOAuthError] = useState<string | null>(null);

  // User store hooks
  const { signIn, clearAuthError } = useAuth();

  const { savedAccounts, switchAccount, loadSavedAccounts, checkAccountSessionValidity } =
    useAccountManagement();

  const hasSavedAccounts = savedAccounts.length > 0;

  const handleLogin = async () => {
    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      await signIn('https://bsky.social');

      // Reload accounts to show the new one
      await loadSavedAccounts();

      if (onLogin) {
        await onLogin('oauth-success');
      }

      // Navigate after signing in - Stack.Protected will handle routing
      router.replace('/(tabs)');
    } catch (error) {
      // Don't show errors for user cancellation
      if (isUserCancellation(error)) {
        return;
      }

      const errorMessage = getErrorMessage(error);
      setOAuthError(errorMessage);

      // Show error with app password fallback option
      Alert.alert('Sign-in Failed', errorMessage, [{ text: 'OK', style: 'cancel' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Check for saved accounts on mount
  useEffect(() => {
    const checkSavedAccounts = async () => {
      try {
        // The savedAccounts are now managed by the user store, so we don't need to fetch them here
        // unless we want to re-render the component to show them immediately after login.
        // For now, we'll rely on the user store's initial state.
      } catch (_error) {
        // Silently handle error checking saved accounts
      }
    };
    checkSavedAccounts();
  }, []);

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

      // Navigate after switching account - Stack.Protected will handle routing
      router.replace('/(tabs)');
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

    const signInButtonContent = (
      <View style={styles.buttonContent} pointerEvents="none">
        {isLoading ? (
          <>
            <Loading3FillIcon size={24} color={Colors.black} style={{ marginRight: 8 }} />
            <Text style={styles.blueskyButtonText}>Signing in...</Text>
          </>
        ) : (
          <>
            <Icon
              name="bluesky-icon"
              size={24}
              color={Colors.bluesky}
              style={{ marginRight: 12 }}
            />
            <Text style={styles.blueskyButtonText}>Sign in with Bluesky</Text>
          </>
        )}
      </View>
    );

    return (
      <View
        style={[
          styles.loginButtonsContainer,
          { paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom + 16 : 16 },
        ]}
      >
        {/* Sign in button */}
        <Pressable
          style={[styles.liquidGlassButton, !useLiquidGlass && styles.whiteButton]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {useLiquidGlass ? (
            <>
              <GlassView
                style={styles.glassBackground}
                glassEffectStyle="clear"
                tintColor="rgba(255, 255, 255, 1)"
                isInteractive
              />
              {signInButtonContent}
            </>
          ) : (
            signInButtonContent
          )}
        </Pressable>

        {/* Advanced login link */}
        <View style={styles.manualSignInLink}>
          <Text style={styles.networkSignInText}>
            On another network?{' '}
            <Text
              onPress={() => !isLoading && router.push('/advanced-login')}
              style={[styles.networkSignInLink, isLoading && styles.customPDSButtonDisabled]}
            >
              sign in here
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
    <View
      style={[
        styles.container,
        {
          paddingTop: typeof insets?.top === 'number' ? insets.top : 0,
          paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom : 0,
          justifyContent: hasSavedAccounts ? 'space-between' : 'flex-end',
        },
      ]}
    >
      {/* Logo and App Name */}
      {!hasSavedAccounts && (
        <View style={styles.logoContainer}>
          <View style={styles.logoBackground}>
            <LinearGradient
              colors={[
                'rgba(0, 0, 0, 0)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 0)',
              ]}
              locations={[0, 0.1, 0.9, 1]}
              style={styles.logoGradient}
            >
              <Image
                source={require('../src/assets/orbyt-logo-padded.png')}
                style={styles.logoImage}
                contentFit="contain"
                tintColor={Colors.white}
              />
              <Text style={styles.appName}>orbyt</Text>
            </LinearGradient>
          </View>
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
  );

  return renderContent();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: Colors.black,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 20,
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
  },
  logoBackground: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoGradient: {
    paddingVertical: 30,
    paddingHorizontal: 40,
    alignItems: 'center',
    borderRadius: 25,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  appName: {
    color: Colors.white,
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
    backgroundColor: Colors.white,
  },
  blueskyButtonText: {
    color: Colors.black,
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  customPDSButtonDisabled: {
    opacity: 0.5,
  },
  savedAccountsContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    flex: 1,
  },
  chooseAccountTitle: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
    marginBottom: 8,
    textAlign: 'left',
  },
  chooseAccountSubtitle: {
    color: Colors.lightGray,
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
    backgroundColor: hexToRGBA(Colors.red, 0.1),
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: Colors.red,
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: Colors.gray,
    opacity: 0.3,
  },
  dividerText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    marginHorizontal: 16,
  },
  termsText: {
    color: Colors.gray,
    fontSize: 15,
    fontFamily: 'Figtree-Regular',
    textAlign: 'left',
    lineHeight: 21,
  },
  manualSignInLink: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
  },
  networkSignInText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  networkSignInLink: {
    color: Colors.lightGray,
    textDecorationLine: 'underline',
    fontFamily: 'Figtree-SemiBold',
  },
});
