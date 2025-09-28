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
  Image,
  ScrollView,
  Linking,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, PlusIcon, AtLineIcon } from '../src/components/ui/Icon';
import { Colors, Avatar } from '../src/components/ui/UI';
import { AnimatedStarsBackground } from '../src/components/ui';
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
  const [username, setUsername] = useState<string>('');
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [showCustomPDS, setShowCustomPDS] = useState<boolean>(false);

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
    loadSavedAccounts 
  } = useAccountManagement();

  const hasSavedAccounts = savedAccounts.length > 0;

  const handleLogin = async () => {
    if (showCustomPDS && !username.trim()) {
      Alert.alert('Error', 'Please enter your username or handle');
      return;
    }

    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      if (showCustomPDS) {
        // For custom PDS, use the username input
        if (DEBUG) console.log('[LoginScreen] handleLogin: custom PDS login begin');
        const identifier = await PDSDiscoveryService.prepareIdentifier(username.trim());
        await signIn(identifier);
        if (DEBUG) console.log('[LoginScreen] handleLogin: custom PDS login success');
      } else {
        // For Bluesky login, use the default Bluesky PDS
        // This will open the Bluesky OAuth flow without requiring a specific handle
        if (DEBUG) console.log('[LoginScreen] handleLogin: Bluesky OAuth login begin');
        await signIn('https://bsky.social');
        if (DEBUG) console.log('[LoginScreen] handleLogin: Bluesky OAuth login success');
      }
      
      // Reload accounts to show the new one (same as AccountSwitcher)
      await loadSavedAccounts();
      if (DEBUG) console.log('[LoginScreen] handleLogin: success, accounts reloaded');
      
      await onLogin('oauth-success');
    } catch (error) {
      // Check if this is a user cancellation vs actual error
      const errorMessage = error instanceof Error ? error.message : 'OAuth login failed';
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('Authentication was cancelled') ||
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        setOAuthError(errorMessage);
        Alert.alert(
          'OAuth Sign-in Failed',
          showCustomPDS 
            ? 'Failed to sign in with custom PDS. Please check your username and try again.'
            : 'Failed to sign in with Bluesky. Please try again.',
          [{ text: 'OK' }]
        );
      }
      if (DEBUG) console.log('[LoginScreen] handleLogin: error', errorMessage);
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
    try {
      await switchAccount(account.did);
      if (onAccountSwitch) {
        await onAccountSwitch(account);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Account switch failed';
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('Authentication was cancelled') ||
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        Alert.alert(
          'Account Switch Failed', 
          'Please try signing in again.'
        );
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

      {/* Username input for custom PDS */}
      {showCustomPDS && (
        <View style={styles.inputContainer}>
          <Icon name="at" size={20} color={Colors.gray} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter your username or handle"
            placeholderTextColor={Colors.gray}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            editable={!isLoading}
          />
        </View>
      )}

      {/* Sign in button */}
      <TouchableOpacity
        style={styles.liquidGlassButton}
        onPress={handleLogin}
        disabled={isLoading || (showCustomPDS && !username.trim())}
        activeOpacity={0.8}
      >
        <BlurView
          intensity={20}
          tint="light"
          style={styles.blurContainer}
        >
          <LinearGradient
            colors={
              showCustomPDS && !username.trim()
                ? ['rgba(128, 128, 128, 0.3)', 'rgba(128, 128, 128, 0.1)']
                : showCustomPDS
                ? ['rgba(3, 133, 255, 0.8)', 'rgba(3, 133, 255, 0.6)']
                : ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.7)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.glassGradient}
          >
            <View style={styles.glassOverlay}>
              {isLoading ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator 
                    color={showCustomPDS ? Colors.white : Colors.black} 
                    size="small" 
                    style={{ marginRight: 8 }} 
                  />
                  <Text style={[
                    showCustomPDS ? styles.loginButtonText : styles.blueskyButtonText,
                    showCustomPDS && !username.trim() && styles.disabledText
                  ]}>
                    Signing in...
                  </Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  {!showCustomPDS && <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />}
                  <Text style={[
                    showCustomPDS ? styles.loginButtonText : styles.blueskyButtonText,
                    showCustomPDS && !username.trim() && styles.disabledText
                  ]}>
                    {showCustomPDS ? 'Sign In' : 'Sign in with Bluesky'}
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
        onPress={() => setShowCustomPDS(!showCustomPDS)}
        disabled={isLoading}
      >
        {showCustomPDS ? (
          <Text style={styles.customPDSTextButtonText}>Back</Text>
        ) : (
          <Text style={styles.customPDSTextButtonText}>Custom PDS</Text>
        )}
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
            <Image source={require('../src/assets/logo.png')} style={styles.logo} />
            <Text style={styles.appName}>orbyt</Text>
          </View>
        )}

        {hasSavedAccounts ? renderSavedAccounts() : renderManualLogin()}

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
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: 24,
    paddingHorizontal: 20,
    height: 56,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.black,
    fontSize: 16,
    height: '100%',
    fontFamily: 'Firma-Medium',
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
  disabledText: {
    opacity: 0.6,
  },
  loginButtonLoading: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-Bold',
  },
  blueskyButton: {
    backgroundColor: Colors.white,
    width: '100%',
    borderRadius: BORDER_RADIUS.MEDIUM,
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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