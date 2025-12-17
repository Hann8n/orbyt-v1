import React, { useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, PlusIcon, AtLineIcon, Loading3FillIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import { 
  AnimatedTV, 
  CustomPDSInputSheet
} from '../src/components/ui';
import AuthorItem from '../src/components/ui/AuthorItem';
import { SavedAccount } from '../src/stores/userStore';
import { useAuth, useAccountManagement } from '../src/stores/userStore';
import { useGlobalAccountSwitcher } from '../src/hooks/useGlobalModals';
import { PDSDiscoveryService } from '../src/services/PDSDiscoveryService';
import { isUserCancellation, getErrorMessage, shouldShowError } from '../src/utils/errorHandler';

interface LoginScreenProps {
  onLogin: (handle: string) => Promise<void>;
  onAccountSwitch?: (account: SavedAccount) => Promise<void>;
}

export default function LoginScreen({ onLogin, onAccountSwitch }: LoginScreenProps) {
  const DEBUG = __DEV__ && false;
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [showCustomPDSSheet, setShowCustomPDSSheet] = useState<boolean>(false);

  // User store hooks
  const { 
    isAuthenticating, 
    authError, 
    signIn, 
    clearAuthError 
  } = useAuth();
  
  const { 
    savedAccounts, 
    switchAccount,
    loadSavedAccounts,
    checkAccountSessionValidity
  } = useAccountManagement();

  const hasSavedAccounts = savedAccounts.length > 0;

  const handleLogin = async () => {
    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      console.log('[LoginScreen] Starting OAuth login');
      await signIn('https://bsky.social');
      
      // Reload accounts to show the new one
      await loadSavedAccounts();
      console.log('[LoginScreen] OAuth login successful');
      
      await onLogin('oauth-success');
    } catch (error) {
      // Don't show errors for user cancellation
      if (isUserCancellation(error)) {
        console.log('[LoginScreen] User cancelled OAuth login');
        return;
      }
      
      const errorMessage = getErrorMessage(error);
      console.error('[LoginScreen] OAuth login failed:', errorMessage);
      setOAuthError(errorMessage);
      
      // Show error with app password fallback option
      Alert.alert(
        'Sign-in Failed',
        errorMessage,
        [
          { text: 'OK', style: 'cancel' },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomPDSSignIn = async (identifier: string) => {
    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      console.log('[LoginScreen] Starting custom PDS OAuth login for:', identifier);
      await signIn(identifier);
      
      // Reload accounts to show the new one
      await loadSavedAccounts();
      console.log('[LoginScreen] Custom PDS OAuth login successful');
      
      await onLogin('oauth-success');
    } catch (error) {
      // Don't show errors for user cancellation
      if (isUserCancellation(error)) {
        console.log('[LoginScreen] User cancelled custom PDS login');
        return;
      }
      
      const errorMessage = getErrorMessage(error);
      console.error('[LoginScreen] Custom PDS OAuth login failed:', errorMessage);
      
      // Show error with app password fallback option
      Alert.alert(
        'Custom PDS Sign-in Failed',
        errorMessage,
        [
          { text: 'OK', style: 'cancel' },
        ]
      );
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
      } catch (error) {
        // Silently handle error checking saved accounts
      }
    };
    checkSavedAccounts();
  }, []);

  const handleAccountSwitch = async (account: SavedAccount) => {
    if (onAccountSwitch) {
      await onAccountSwitch(account);
    }
  };

  const handleSavedAccountLogin = async (account: SavedAccount) => {
    console.log('[LoginScreen] Starting account login for:', account.handle, 'DID:', account.did);
    setIsLoading(true);
    
    try {
      // First check if the account has a valid session
      console.log('[LoginScreen] Checking session validity before switching...');
      const hasValidSession = await checkAccountSessionValidity(account.did);
      
      if (!hasValidSession) {
        console.log('[LoginScreen] No valid session found for account');
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
              }
            },
          ]
        );
        return;
      }
      
      // Session is valid, proceed with account switch
      console.log('[LoginScreen] Session is valid, proceeding with account switch');
      await switchAccount(account.did);
      console.log('[LoginScreen] Account switch successful');
      
      if (onAccountSwitch) {
        await onAccountSwitch(account);
      }
    } catch (error) {
      setIsLoading(false);
      const errorMessage = error instanceof Error ? error.message : 'Account switch failed';
      console.error('[LoginScreen] Account switch failed with error:', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        accountHandle: account.handle,
        accountDid: account.did,
        originalIdentifier: account.originalIdentifier
      });
      
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        // Check if this is a session corruption issue
        if (errorMessage.includes('Session expired') || 
            errorMessage.includes('Unable to restore session') || 
            errorMessage.includes('oauth_reauth_required') ||
            errorMessage.includes('No session available')) {
          
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
                }
              },
            ]
          );
        } else if (errorMessage.includes('Network') || 
                  errorMessage.includes('fetch') || 
                  errorMessage.includes('ENOTFOUND') ||
                  errorMessage.includes('ETIMEDOUT')) {
          
          // Network error
          Alert.alert(
            'Network Error', 
            `Unable to connect to the server. Please check your internet connection and try again.`,
            [{ text: 'OK' }]
          );
        } else if (errorMessage.includes('rate limit') || 
                  errorMessage.includes('Rate Limit')) {
          
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
                }
              },
            ]
          );
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = () => {
    Linking.openURL('https://bsky.app');
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
              displayName={account.displayName || account.handle || 'User'}
              avatar={account.avatar}
              onPress={() => handleSavedAccountLogin(account)}
              size="large"
              showArrow={true}
              style={[
                index === 0 && styles.firstAccountItem,
                index === savedAccounts.length - 1 && styles.lastAccountItem
              ]}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );

  const renderLoginButtons = () => {
    const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
    
    const buttonContent = (
      <View style={styles.buttonContent} pointerEvents="none">
        {isLoading ? (
          <>
            <Loading3FillIcon 
              size={24} 
              color={Colors.black} 
              style={{ marginRight: 8 }} 
            />
            <Text style={styles.blueskyButtonText}>
              Signing in...
            </Text>
          </>
        ) : (
          <>
            <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />
            <Text style={styles.blueskyButtonText}>
              Sign in with Bluesky
            </Text>
          </>
        )}
      </View>
    );
    
    return (
      <View style={[styles.loginButtonsContainer, { paddingBottom: Math.max(20, typeof insets?.bottom === 'number' ? insets.bottom : 0) }]}>
        {/* Sign in button */}
        <TouchableOpacity
          style={[styles.liquidGlassButton, !useLiquidGlass && styles.whiteButton]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {useLiquidGlass ? (
            <>
              <GlassView
                style={styles.glassBackground}
                glassEffectStyle="clear"
                tintColor="rgba(255, 255, 255, 1)"
                isInteractive
              />
              {buttonContent}
            </>
          ) : (
            buttonContent
          )}
        </TouchableOpacity>

        {/* Custom PDS text button */}
        <TouchableOpacity
          style={styles.customPDSTextButton}
          onPress={() => setShowCustomPDSSheet(true)}
          disabled={isLoading}
          delayLongPress={500}
        >
          <Text style={styles.customPDSTextButtonText}>Custom Login</Text>
        </TouchableOpacity>
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { 
        paddingTop: typeof insets?.top === 'number' ? insets.top : 0,
        paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom : 0
      }]}
    >
      {/* Logo and App Name */}
      {!hasSavedAccounts && (
        <View style={styles.logoContainer}>
          <View style={styles.logoBackground}>
            <LinearGradient
              colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0)']}
              locations={[0, 0.1, 0.9, 1]}
              style={styles.logoGradient}
            >
              <AnimatedTV size={120} />
              <Text style={styles.appName}>orbyt</Text>
            </LinearGradient>
          </View>
        </View>
      )}

      {hasSavedAccounts ? (
        <>
          {renderSavedAccounts()}
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>
          {renderLoginButtons()}
        </>
      ) : renderManualLogin()}

      {/* Custom PDS Input Sheet */}
      <CustomPDSInputSheet
        visible={showCustomPDSSheet}
        onDismiss={() => setShowCustomPDSSheet(false)}
        onSignIn={handleCustomPDSSignIn}
        title="Custom Login"
        name="login-custom-pds"
      />
    </KeyboardAvoidingView>
  );

  return renderContent();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
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
    shadowColor: '#000',
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
  appName: {
    color: Colors.white,
    fontSize: 42,
    fontWeight: 'bold',
    fontFamily: 'CriteriaCF-ExtraBold',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 40,
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
    marginBottom: 16,
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
    fontFamily: 'Firma-Bold',
  },
  customPDSTextButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  customPDSTextButtonText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    textAlign: 'center',
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
    fontFamily: 'Firma-Bold',
    marginBottom: 8,
    textAlign: 'left',
  },
  chooseAccountSubtitle: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textAlign: 'left',
    lineHeight: 22,
  },
  headerSection: {
    marginBottom: 32,
  },
  accountsSection: {
    flex: 1,
  },
  savedAccountsTitle: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'Firma-Bold',
  },
  accountsList: {
    flex: 1,
  },
  accountsListContent: {
    paddingTop: 8,
  },


  manualLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.darkGray,
  },

  manualLoginText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  backToAccountsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.darkGray,
  },
  backIcon: {
    marginRight: 12,
  },
  backToAccountsText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  loadingText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginLeft: 12,
  },
  buttonLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLoadingText: {
    color: Colors.black,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginLeft: 12,
  },
  loadingAccountName: {
    color: Colors.white,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
  },

  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
  oauthInfoContainer: {
    marginBottom: 24,
  },
  oauthInfoText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  createAccountLink: {
    marginTop: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  createAccountText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  createAccountLinkText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textDecorationLine: 'underline',
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
    fontFamily: 'Firma-Medium',
    marginHorizontal: 16,
  },
  pdsButton: {
    backgroundColor: Colors.darkGray,
    marginTop: 12,
  },
  pdsButtonText: {
    color: Colors.white,
  },
  

});