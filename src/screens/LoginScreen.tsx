import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, PlusIcon, AtLineIcon, MailLineIcon, Key2LineIcon } from '../components/ui/Icon';
import { Colors } from '../components/ui/UI';
import AccountManager from '../services/storage/AccountManager';
import AccountSwitcher from '../components/features/profile/AccountSwitcher';
import { SavedAccount } from '../services/storage/AccountManager';

interface LoginScreenProps {
  onLogin: (handle: string, password: string) => Promise<void>;
  onAccountSwitch?: (account: SavedAccount) => Promise<void>;
}

export default function LoginScreen({ onLogin, onAccountSwitch }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [handle, setHandle] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [secureTextEntry, setSecureTextEntry] = useState<boolean>(true);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState<boolean>(false);
  const [hasSavedAccounts, setHasSavedAccounts] = useState<boolean>(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [showManualLogin, setShowManualLogin] = useState<boolean>(false);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!handle || !password) {
      Alert.alert('error', 'please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await onLogin(handle, password);
    } catch (error) {
      Alert.alert('login failed', (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const openAppPasswordsPage = () => {
    Linking.openURL('https://bsky.app/settings/app-passwords');
  };

  // Check for saved accounts on mount
  useEffect(() => {
    const checkSavedAccounts = async () => {
      try {
        const accounts = await AccountManager.getSavedAccounts();
        setSavedAccounts(accounts);
        setHasSavedAccounts(accounts.length > 0);
        // If no saved accounts, show manual login by default
        if (accounts.length === 0) {
          setShowManualLogin(true);
        }
      } catch (error) {
        console.error('Error checking saved accounts:', error);
        setShowManualLogin(true);
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
      await AccountManager.switchAccount(account.id);
      if (onAccountSwitch) {
        await onAccountSwitch(account);
      }
    } catch (error) {
      Alert.alert('login failed', (error as Error).message);
    } finally {
      setSwitchingAccount(null);
    }
  };

  const renderSavedAccounts = () => (
    <View style={styles.savedAccountsContainer}>
      <View style={styles.accountsListWrapper}>
        <ScrollView 
          style={styles.accountsList} 
          contentContainerStyle={styles.accountsListContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {savedAccounts.map((account) => (
            <TouchableOpacity
              key={account.id}
              style={[
                styles.accountItem,
                account.isActive && styles.activeAccountItem
              ]}
              onPress={() => handleSavedAccountLogin(account)}
              disabled={switchingAccount === account.id}
              activeOpacity={0.7}
            >
              {switchingAccount === account.id ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={Colors.white} size="small" />
                  <Text style={styles.loadingText}>
                    logging in <Text style={styles.loadingAccountName}>{account.displayName || account.handle}</Text>
                  </Text>
                </View>
              ) : (
                <>
                  {account.avatar ? (
                    <Image source={{ uri: account.avatar }} style={styles.accountAvatar} />
                  ) : (
                    <View style={styles.accountAvatarPlaceholder}>
                      <Icon name="user" size={20} color={Colors.gray} />
                    </View>
                  )}
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountDisplayName}>
                      {account.displayName || account.handle}
                    </Text>
                    <Text style={styles.accountHandle}>@{account.handle}</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.manualLoginButton}
            onPress={() => setShowManualLogin(true)}
            activeOpacity={0.7}
          >
            <View style={styles.manualLoginIcon}>
              <PlusIcon size={16} color={Colors.lightGray} strokeWidth={2.0} />
            </View>
            <Text style={styles.manualLoginText}>login with different account</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );

  const renderManualLogin = () => (
    <View style={styles.formContainer}>
      <View style={styles.inputContainer}>
        {handle.includes('@') ? (
          <MailLineIcon size={20} color={Colors.gray} style={styles.inputIcon} />
        ) : (
          <AtLineIcon size={20} color={Colors.gray} style={styles.inputIcon} />
        )}
        <TextInput
          style={styles.input}
          placeholder="bluesky handle or email"
          placeholderTextColor={Colors.gray}
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance="dark"
          keyboardType="ascii-capable"
          textContentType="username"
        />
      </View>

      <View style={styles.inputContainer}>
        <Key2LineIcon size={20} color={Colors.gray} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="password"
          placeholderTextColor={Colors.gray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          keyboardAppearance="dark"
          keyboardType="ascii-capable"
          textContentType="oneTimeCode"
        />
        <TouchableOpacity
          onPress={(e) => {
            e.preventDefault();
            setSecureTextEntry(!secureTextEntry);
          }}
          style={styles.eyeIcon}
          activeOpacity={1}
        >
          <Icon
            name={secureTextEntry ? 'eye-closed' : 'eye'}
            size={20}
            color={Colors.gray}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[
          styles.loginButton, 
          (!handle || !password) && styles.loginButtonDisabled,
          isLoading && styles.loginButtonLoading
        ]}
        onPress={handleLogin}
        disabled={isLoading || !handle || !password}
      >
        {isLoading ? (
          <View style={styles.buttonLoadingContainer}>
            <ActivityIndicator color={Colors.white} size="small" />
            <Text style={styles.buttonLoadingText}>logging in...</Text>
          </View>
        ) : (
          <Text style={[
            styles.loginButtonText,
            (!handle || !password) && styles.loginButtonTextDisabled
          ]}>
            login
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.appPasswordContainer}>
        <Text style={styles.appPasswordText}>
          you need an app password to login.
        </Text>
        <Text style={[styles.appPasswordText, styles.appPasswordLink]} onPress={openAppPasswordsPage}>
          create one here
        </Text>
      </View>

      {hasSavedAccounts && (
        <TouchableOpacity
          style={styles.backToAccountsButton}
          onPress={() => setShowManualLogin(false)}
          activeOpacity={0.7}
        >
          <BackArrowIcon size={16} color={Colors.lightGray} style={styles.backIcon} />
          <Text style={styles.backToAccountsText}>back to saved accounts</Text>
        </TouchableOpacity>
      )}
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
      <View style={styles.logoContainer}>
        <Image
          source={require('../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>orbyt</Text>
      </View>

      {hasSavedAccounts && !showManualLogin ? renderSavedAccounts() : renderManualLogin()}

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
    marginBottom: 48,
    paddingTop: 20,
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
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: 16,
    marginBottom: 20,
    paddingHorizontal: 20,
    height: 56,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.white,
    fontSize: 16,
    height: '100%',
    fontFamily: 'Firma-Regular',
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
            backgroundColor: Colors.darkGray,
    height: 56,
    width: '100%',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  loginButtonDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.darkGray,
    borderColor: Colors.gray,
  },
  loginButtonLoading: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: Colors.lightGray,
    fontSize: 17,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
  },
  loginButtonTextDisabled: {
    color: Colors.gray,
  },
  appPasswordContainer: {
    marginBottom: 24,
  },
  appPasswordText: {
    color: Colors.gray,
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'Firma-Regular',
    lineHeight: 20,
  },
  appPasswordLink: {
    color: Colors.lightGray,
    textDecorationLine: 'underline',
    fontFamily: 'Firma-Medium',
  },
  savedAccountsContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 8,
    paddingTop: 0,
  },
  savedAccountsTitle: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'Firma-Bold',
  },
  accountsListWrapper: {
    flex: 1,
    minHeight: 0,
    marginBottom: 8,
  },
  accountsList: {
    flexGrow: 1,
    minHeight: 0,
    maxHeight: undefined,
  },
  accountsListContent: {
    paddingTop: 0,
    paddingBottom: 8,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: Colors.darkGray,
    borderWidth: 1,
    borderColor: Colors.gray,
    borderRadius: 14,
  },
  activeAccountItem: {
    borderColor: Colors.white,
    borderWidth: 2,
    backgroundColor: Colors.darkGray,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  accountAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: Colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  accountInfo: {
    flex: 1,
  },
  accountDisplayName: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
    fontFamily: 'Firma-Bold',
  },
  accountHandle: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  manualLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    backgroundColor: 'transparent',
  },
  manualLoginIcon: {
    marginRight: 16,
  },
  manualLoginText: {
    color: Colors.lightGray,
    fontSize: 17,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
  },
  backToAccountsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    backgroundColor: 'transparent',
  },
  backIcon: {
    marginRight: 12,
  },
  backToAccountsText: {
    color: Colors.lightGray,
    fontSize: 17,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
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
    color: Colors.white,
    fontSize: 17,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginLeft: 12,
  },
  loadingAccountName: {
    color: Colors.white,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
  },

});