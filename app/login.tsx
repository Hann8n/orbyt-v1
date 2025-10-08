import React, { useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, PlusIcon, AtLineIcon } from '../src/components/ui/Icon';
import { Colors, Avatar } from '../src/components/ui/UI';
import { AnimatedStarsBackground, AnimatedTV, CustomPDSInputSheet } from '../src/components/ui';
import { SavedAccount } from '../src/stores/userStore';
import { useAuth, useAccountManagement } from '../src/stores/userStore';
import { useGlobalAccountSwitcher } from '../src/hooks/useGlobalModals';
import { PDSDiscoveryService } from '../src/services/PDSDiscoveryService';

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
    checkAccountSessionValidity,
    clearCorruptedSessions
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
      const errorMessage = error instanceof Error ? error.message : 'OAuth login failed';
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        console.error('[LoginScreen] OAuth login failed:', errorMessage);
        setOAuthError(errorMessage);
        Alert.alert(
          'Sign-in Failed',
          'Failed to sign in with Bluesky. Please try again.',
          [{ text: 'OK' }]
        );
      }
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
      console.error('[LoginScreen] Custom PDS OAuth login failed:', error);
      // Re-throw the error so the CustomPDSInputSheet can handle it
      throw error;
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
    
    try {
      // Skip session validation for now - go straight to account switching
      // This will help us see if the issue is in validation or switching
      console.log('[LoginScreen] Attempting direct account switch...');
      
      await switchAccount(account.did);
      console.log('[LoginScreen] Account switch successful');
      
      if (onAccountSwitch) {
        await onAccountSwitch(account);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Account switch failed';
      console.error('[LoginScreen] Account switch failed with error:', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        accountHandle: account.handle,
        accountDid: account.did,
        accountPds: account.pdsUrl
      });
      
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        // Check if this is a session corruption issue
        if (errorMessage.includes('Session expired') || errorMessage.includes('Unable to restore session')) {
          Alert.alert(
            'Session Issue', 
            `There's an issue with the saved session for @${account.handle}. This can happen after app updates or device changes.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Clear & Sign In', 
                onPress: async () => {
                  try {
                    await clearCorruptedSessions();
                    handleLogin();
                  } catch (clearError) {
                    console.error('[LoginScreen] Failed to clear corrupted sessions:', clearError);
                    handleLogin();
                  }
                }
              }
            ]
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
                onPress: () => {
                  // Trigger a fresh OAuth flow
                  handleLogin();
                }
              }
            ]
          );
        }
      }
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
            <TouchableOpacity
                              key={account.did}
              style={[
                styles.accountItem,
                index === 0 && styles.firstAccountItem,
                index === savedAccounts.length - 1 && styles.lastAccountItem
              ]}
              onPress={() => handleSavedAccountLogin(account)}
              // disabled={switchingAccount === account.id} // This state is no longer needed
              activeOpacity={0.8}
            >
              {/* {switchingAccount === account.id ? ( // This state is no longer needed
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={Colors.white} size="small" />
                  <Text style={styles.loadingText}>
                    Signing in to <Text style={styles.loadingAccountName}>{account.displayName || account.handle}</Text>
                  </Text>
                </View>
              ) : ( */}
                <View style={styles.accountButtonContent}>
                  <View style={styles.avatarContainer}>
                    <Avatar
                      uri={account.avatar}
                      type="profile"
                      size={48}
                    />
                  </View>
                  <View style={styles.accountInfoContainer}>
                    <Text style={styles.accountDisplayName}>
                      {account.displayName || account.handle || 'User'}
                    </Text>
                    <Text style={styles.accountHandle}>
                      @{account.handle}
                    </Text>
                  </View>
                  <View style={styles.accountArrow}>
                    <Icon name="chevron-right" size={20} color={Colors.gray} />
                  </View>
                </View>
              {/* )} */}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.divider} />
      </View>
      
    </View>
  );

  const renderManualLogin = () => (
    <View style={styles.formContainer}>
      {oauthError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{oauthError}</Text>
        </View>
      )}

      {/* Sign in button */}
      <TouchableOpacity
        style={styles.liquidGlassButton}
        onPress={handleLogin}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        <BlurView
          intensity={20}
          tint="light"
          style={styles.blurContainer}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.7)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.glassGradient}
          >
            <View style={styles.glassOverlay}>
              {isLoading ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator 
                    color={Colors.black} 
                    size="small" 
                    style={{ marginRight: 8 }} 
                  />
                  <Text style={styles.blueskyButtonText}>
                    Signing in...
                  </Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />
                  <Text style={styles.blueskyButtonText}>
                    Sign in with Bluesky
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </BlurView>
      </TouchableOpacity>

      {/* Custom PDS text button */}
      <TouchableOpacity
        style={styles.customPDSTextButton}
        onPress={() => setShowCustomPDSSheet(true)}
        disabled={isLoading}
      >
        <Text style={styles.customPDSTextButtonText}>Custom Login</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AnimatedStarsBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { 
          paddingTop: insets.top,
          paddingBottom: insets.bottom 
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

        {hasSavedAccounts ? renderSavedAccounts() : renderManualLogin()}

        {/* Custom PDS Input Sheet */}
        <CustomPDSInputSheet
          visible={showCustomPDSSheet}
          onDismiss={() => setShowCustomPDSSheet(false)}
          onSignIn={handleCustomPDSSignIn}
          title="Custom Login"
          name="login-custom-pds"
        />

      </KeyboardAvoidingView>
    </AnimatedStarsBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
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
    fontFamily: 'Firma-Black',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 40,
  },
  liquidGlassButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginTop: 8,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  blurContainer: {
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
  },
  glassGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  glassOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 'auto',
    marginBottom: 40,
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
    marginBottom: 24,
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
    marginBottom: 16,
  },
  accountsListContent: {
    paddingBottom: 16,
    paddingTop: 8,
  },
  accountItem: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },

  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    marginRight: 12,
  },
  accountInfoContainer: {
    flex: 1,
    paddingLeft: 8,
  },
  accountButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'left',
    fontFamily: 'Firma-SemiBold',
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
  accountDisplayName: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-Bold',
    marginBottom: 2,
  },
  accountHandle: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  accountArrow: {
    marginLeft: 8,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
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