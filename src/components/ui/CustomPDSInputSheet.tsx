import React, { useState, useCallback } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { View, Text, Pressable, StyleSheet, TextInput, Linking } from 'react-native';
import Icon, { Loading3FillIcon } from './Icon';
import { Colors } from './UI';
import VerticalListSheet from './VerticalListSheet';

interface CustomPDSInputSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSignIn: (identifier: string) => Promise<void>;
  title?: string;
  name?: string;
}

const CustomPDSInputSheet: React.FC<CustomPDSInputSheetProps> = ({
  visible,
  onDismiss,
  onSignIn,
  title = 'Custom Login',
  name = 'custom-pds-input',
}) => {
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
      await onSignIn(trimmedUsername);

      // Close the sheet on success
      onDismiss();
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
  }, [username, onSignIn, onDismiss]);

  const handleDismiss = useCallback(async () => {
    setUsername('');
    setPdsError(null);
    setIsAddingAccount(false);
    setIsValidatingPds(false);
    onDismiss();
  }, [onDismiss]);

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={handleDismiss}
      title={title}
      showCancelButton={false}
      name={name}
      scrollable={false}
      contentBottomPadding={0}
    >
      <View style={styles.usernameInputContainer}>
        {pdsError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{pdsError}</Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Icon name="at" size={28} color={Colors.black} style={styles.inputIcon} />
          <TextInput
            nativeID="pds-username-input"
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
              <Loading3FillIcon size={24} color={Colors.gray} style={{ marginRight: 8 }} />
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
            onPress={() => Linking.openURL('https://getorbyt.com/terms')}
          >
            orbyt terms of use
          </Text>
        </View>
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  usernameInputContainer: {
    paddingHorizontal: 20,
    paddingBottom: 0,
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
    fontFamily: 'Figtree-Medium',
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
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: Colors.gray,
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
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
    fontFamily: 'Figtree-Medium',
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
    fontFamily: 'Figtree-Regular',
    lineHeight: 20,
  },
  termsLink: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
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

export default CustomPDSInputSheet;
