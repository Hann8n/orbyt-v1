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
import { Colors, Avatar } from '../components/ui/UI';
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
                <View style={styles.accountButtonContent}>
                  <View style={styles.avatarContainer}>
                    <Avatar
                      uri={account.avatar}
                      type="profile"
                      size={40}
                    />
                  </View>
                  <Text style={[
                    styles.accountButtonText,
                    account.isActive && { 
                      color: Colors.white, 
                      fontWeight: '600', 
                      fontFamily: 'Firma-Bold' 
                    }
                  ]}>
                    {account.displayName || account.handle}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.manualLoginButton}
            onPress={() => setShowManualLogin(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.manualLoginText}>Add Account</Text>
            <Icon name="user-plus" size={20} color={Colors.lightGray} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );

  const renderManualLogin = () => (
    <View style={styles.formContainer}>
      <View style={styles.inputContainer}>
        {handle.includes('@') ? (
          <MailLineIcon size={20} color={Colors.darkGray} style={styles.inputIcon} />
        ) : (
          <AtLineIcon size={20} color={Colors.darkGray} style={styles.inputIcon} />
        )}
        <TextInput
          style={styles.input}
          placeholder="bluesky handle or email"
          placeholderTextColor={Colors.darkGray}
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance="light"
          keyboardType="ascii-capable"
          textContentType="username"
        />
      </View>

      <View style={styles.inputContainer}>
        <Key2LineIcon size={20} color={Colors.darkGray} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="password"
          placeholderTextColor={Colors.darkGray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          keyboardAppearance="light"
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
            color={Colors.darkGray}
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
            you'll need an app password to login
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
            <Icon name="left_arrow_filled" size={24} color={Colors.lightGray} style={styles.backIcon} />
            <Text style={styles.backToAccountsText}>Back</Text>
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
    backgroundColor: Colors.darkGray,
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
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
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
    backgroundColor: Colors.darkGray,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  activeAccountItem: {
    backgroundColor: Colors.darkGray,
  },
  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    marginRight: 12,
  },
  accountButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'left',
    fontFamily: 'Firma-SemiBold',
    paddingLeft: 8,
    flex: 1,
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
    color: Colors.white,
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

});