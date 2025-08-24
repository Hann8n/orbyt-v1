import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, PlusIcon, AtLineIcon } from '../components/ui/Icon';
import { Colors, Avatar } from '../components/ui/UI';
import AccountManager from '../services/storage/AccountManager';
import AccountSwitcher from '../components/features/profile/AccountSwitcher';
import { SavedAccount } from '../services/storage/AccountManager';
import { useOAuth } from '../services/auth';
import AtprotoService from '../services/api/AtprotoService';

interface LoginScreenProps {
  onLogin: (handle: string) => Promise<void>;
  onAccountSwitch?: (account: SavedAccount) => Promise<void>;
}

export default function LoginScreen({ onLogin, onAccountSwitch }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState<boolean>(false);
  const [hasSavedAccounts, setHasSavedAccounts] = useState<boolean>(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [oauthError, setOAuthError] = useState<string | null>(null);

  // OAuth hook
  const { signIn: oauthSignIn, isSigningIn: isOAuthSigningIn, error: oauthHookError } = useOAuth();

  const handleLogin = async () => {
    console.log(`[LoginScreen] handleLogin called`);
    console.log(`[LoginScreen] Current state:`, { 
      hasPassword: false 
    });

    setIsLoading(true);
    setOAuthError(null);

    try {
      // Sign in with Bluesky OAuth
      console.log(`[LoginScreen] Starting Bluesky OAuth flow`);
      try {
        await oauthSignIn('https://bsky.social');
        console.log(`[LoginScreen] OAuth sign-in completed, calling onLogin`);
        await onLogin('oauth-success');
      } catch (oauthError) {
        // Check if this is a user cancellation vs actual error
        const errorMessage = oauthError instanceof Error ? oauthError.message : 'OAuth login failed';
        const isUserCancellation = errorMessage.includes('cancelled') || 
                                  errorMessage.includes('Authentication was cancelled') ||
                                  errorMessage.includes('user_cancelled');
        
        if (isUserCancellation) {
          // User cancelled - don't show error, just log it
          console.log('[LoginScreen] User cancelled OAuth flow');
        } else {
          // Actual error - show to user
          setOAuthError(errorMessage);
          Alert.alert(
            'OAuth Login Failed',
            'OAuth login failed. Please try again.',
            [{ text: 'OK' }]
          );
        }
        return;
      }
    } catch (error) {
      Alert.alert('login failed', (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Check for saved accounts on mount
  useEffect(() => {
    const checkSavedAccounts = async () => {
      try {
        const accounts = await AccountManager.getSavedAccounts();
        setSavedAccounts(accounts);
        setHasSavedAccounts(accounts.length > 0);

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
    setSwitchingAccount(account.id);
    try {
      // All accounts are now OAuth-only
      try {
        await AccountManager.switchAccount(account.id);
        if (onAccountSwitch) {
          await onAccountSwitch(account);
        }
      } catch (oauthError) {
        // OAuth session might be expired, try to re-authenticate
        console.warn('OAuth session expired, re-authenticating:', oauthError);
        try {
          await oauthSignIn(account.handle);
          // Update the account to reflect the new OAuth session
          const oauthService = (await import('../services/auth')).AtProtoOAuthService.getInstance();
          const session = await oauthService.getCurrentSession();
          if (session) {
            // Get updated profile information
            const userProfile = await AtprotoService.getCurrentUser();
            await AccountManager.saveOAuthAccount(
              session, 
              userProfile?.displayName || account.displayName, 
              userProfile?.avatar || account.avatar,
              userProfile?.handle || account.handle
            );
          }
          if (onAccountSwitch) {
            await onAccountSwitch(account);
          }
        } catch (reAuthError) {
          // Check if this is a user cancellation vs actual error
          const errorMessage = reAuthError instanceof Error ? reAuthError.message : 'OAuth re-authentication failed';
          const isUserCancellation = errorMessage.includes('cancelled') || 
                                    errorMessage.includes('Authentication was cancelled') ||
                                    errorMessage.includes('user_cancelled');
          
          if (!isUserCancellation) {
            Alert.alert(
              'OAuth Re-authentication Failed', 
              'Please try signing in manually with OAuth.'
            );
          }
        }
      }
    } catch (error) {
      Alert.alert('login failed', (error as Error).message);
    } finally {
      setSwitchingAccount(null);
    }
  };

  const handleCreateAccount = () => {
    Linking.openURL('https://bsky.app');
  };

  const renderLoginButton = () => (
    <TouchableOpacity
      style={[
        styles.loginButton, 
        isLoading && styles.loginButtonLoading
      ]}
      onPress={handleLogin}
      disabled={isLoading}
    >
      {isLoading ? (
        <View style={styles.buttonContent}>
          <ActivityIndicator color={Colors.black} size="small" style={{ marginRight: 8 }} />
          <Text style={styles.loginButtonText}>
            Signing in...
          </Text>
        </View>
      ) : (
        <View style={styles.buttonContent}>
          <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />
          <Text style={styles.loginButtonText}>
            Sign in with Bluesky
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

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
              key={account.id}
              style={[
                styles.accountItem,
                index === 0 && styles.firstAccountItem,
                index === savedAccounts.length - 1 && styles.lastAccountItem
              ]}
              onPress={() => handleSavedAccountLogin(account)}
              disabled={switchingAccount === account.id}
              activeOpacity={0.8}
            >
              {switchingAccount === account.id ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={Colors.white} size="small" />
                  <Text style={styles.loadingText}>
                    Signing in to <Text style={styles.loadingAccountName}>{account.displayName || account.handle}</Text>
                  </Text>
                </View>
              ) : (
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
                      {account.displayName || 'User'}
                    </Text>
                    <Text style={styles.accountHandle}>
                      @{account.handle}
                    </Text>
                  </View>
                  <View style={styles.accountArrow}>
                    <Icon name="chevron-right" size={20} color={Colors.gray} />
                  </View>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.divider} />
      </View>
      
      {renderLoginButton()}
    </View>
  );

  const renderManualLogin = () => (
    <View style={styles.formContainer}>
      {oauthError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{oauthError}</Text>
        </View>
      )}

      {renderLoginButton()}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { 
        paddingTop: insets.top,
        paddingBottom: insets.bottom 
      }]}
    >
      {hasSavedAccounts ? renderSavedAccounts() : renderManualLogin()}

      {/* Account Switcher Modal */}
      <AccountSwitcher
        visible={showAccountSwitcher}
        onDismiss={() => setShowAccountSwitcher(false)}
        onAccountSwitch={handleAccountSwitch}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
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
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginBottom: 20,
    paddingHorizontal: 20,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.black,
    fontSize: 16,
    height: '100%',
    fontFamily: 'Firma-SemiBold',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    padding: 12,
    position: 'absolute',
    right: 8,
    height: '100%',
    justifyContent: 'center',
  },
  loginButton: {
    backgroundColor: Colors.white,
    width: '100%',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  loginButtonDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.darkGray,
  },
  loginButtonLoading: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: Colors.black,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  loginButtonTextDisabled: {
    color: Colors.gray,
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
    borderRadius: 20,
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
    borderRadius: 20,
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
    borderRadius: 20,
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
    borderRadius: 8,
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

});