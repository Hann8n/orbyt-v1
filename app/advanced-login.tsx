import { useState, useCallback } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { Loading3FillIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import { useAuth, useAccountManagement } from '../src/stores/userStore';

export default function AdvancedLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const { loadSavedAccounts } = useAccountManagement();
  const [username, setUsername] = useState('');
  const [pdsError, setPdsError] = useState<string | null>(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isValidatingPds, setIsValidatingPds] = useState(false);

  const handleUsernameLogin = useCallback(async () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setPdsError('Please enter your username or handle');
      return;
    }

    // Basic validation for common formats
    if (!trimmedUsername.includes('.') && !trimmedUsername.includes('@')) {
      setPdsError('Please enter a full handle (e.g., user.domain.com) or email');
      return;
    }

    setPdsError(null);
    setIsAddingAccount(true);
    setIsValidatingPds(true);

    try {
      // @atproto/oauth-client-expo handles identifier normalization (handles, emails, URLs)
      await signIn(trimmedUsername);

      // Reload accounts to show the new one
      await loadSavedAccounts();

      // Navigate to home on success - use replace to avoid back navigation issues
      // The app will automatically show the main screen when authentication state changes
      router.replace('/(tabs)');
    } catch (error) {
      // Check if this is a user cancellation vs actual error
      const errorMessage = error instanceof Error ? error.message : 'OAuth sign-in failed';
      const isUserCancellation =
        errorMessage.includes('cancelled') ||
        errorMessage.includes('Authentication was cancelled') ||
        errorMessage.includes('user_cancelled');

      if (!isUserCancellation) {
        // More specific error messages based on common issues
        let userFriendlyMessage = `Could not connect to ${trimmedUsername}`;

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          userFriendlyMessage = `Network error connecting to ${trimmedUsername}. Please check your internet connection and try again.`;
        } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
          userFriendlyMessage = `Could not find the server for ${trimmedUsername}. Please check the handle and try again.`;
        } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
          userFriendlyMessage = `Invalid handle format: ${trimmedUsername}. Please enter a valid handle (e.g., user.domain.com).`;
        }

        setPdsError(userFriendlyMessage);
      }
    } finally {
      setIsAddingAccount(false);
      setIsValidatingPds(false);
    }
  }, [username, signIn, router, loadSavedAccounts]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[
        styles.container,
        {
          paddingTop: typeof insets?.top === 'number' ? insets.top : 0,
          paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom : 0,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Network{'\n'}sign in</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.usernameInputContainer}>
          {pdsError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{pdsError}</Text>
            </View>
          )}

          <View style={styles.inputContainer}>
            <Icon name="at" size={28} color={Colors.black} style={styles.inputIcon} />
            <TextInput
              nativeID="advanced-login-username-input"
              style={styles.input}
              placeholder="username"
              placeholderTextColor={Colors.gray}
              value={username}
              onChangeText={text => {
                setUsername(text);
                if (pdsError) setPdsError(null); // Clear error when user starts typing
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              returnKeyType="go"
              onSubmitEditing={handleUsernameLogin}
              editable={!isAddingAccount && !isValidatingPds}
              caretHidden={false}
              autoFocus
            />
          </View>

          <Pressable
            style={[
              styles.loginButton,
              username.trim() && !isAddingAccount && !isValidatingPds && styles.loginButtonActive,
            ]}
            onPress={handleUsernameLogin}
            disabled={!username.trim() || isAddingAccount || isValidatingPds}
          >
            {isAddingAccount || isValidatingPds ? (
              <View style={styles.buttonContent}>
                <Loading3FillIcon size={24} color={Colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.loginButtonText}>
                  {isValidatingPds ? 'Connecting...' : 'Signing in...'}
                </Text>
              </View>
            ) : (
              <View style={styles.buttonContentRow}>
                <Text
                  style={[
                    styles.loginButtonText,
                    username.trim() &&
                      !isAddingAccount &&
                      !isValidatingPds &&
                      styles.loginButtonTextActive,
                  ]}
                >
                  Sign me in
                </Text>
                <Icon
                  name="right_arrow_filled"
                  size={24}
                  color={
                    username.trim() && !isAddingAccount && !isValidatingPds
                      ? Colors.darkGray
                      : Colors.gray
                  }
                />
              </View>
            )}
          </Pressable>

          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>By signing in you are agreeing to the</Text>
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://getorbyt.com/terms.html')}
            >
              orbyt terms of use
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
    minHeight: 64,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 32,
    fontFamily: 'Firma-SemiBold',
    textAlign: 'left',
    paddingLeft: 20,
    lineHeight: 40,
    letterSpacing: 0.15,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  usernameInputContainer: {
    paddingTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BORDER_RADIUS.FULL,
    marginBottom: 4,
    paddingHorizontal: 20,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.black,
    fontSize: 20,
    height: '100%',
    fontFamily: 'Firma-Medium',
    letterSpacing: 0.25,
  },
  loginButton: {
    backgroundColor: Colors.lightGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    flexDirection: 'row',
    minHeight: 64,
  },
  loginButtonActive: {
    backgroundColor: Colors.green,
  },
  loginButtonText: {
    color: Colors.gray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  loginButtonTextActive: {
    color: Colors.darkGray,
  },
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: Colors.red,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
  termsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 20,
    paddingLeft: 20,
  },
  termsText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    lineHeight: 20,
  },
  termsLink: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    textDecorationLine: 'underline',
    lineHeight: 20,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
});
