import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import Icon, { Loading3FillIcon } from './Icon';
import { Colors } from './UI';
import VerticalListSheet, { TrueSheet } from './VerticalListSheet';
import { authSheetStyles } from './AuthSheetStyles';
import ErrorMessage from './ErrorMessage';
import { useSheetPresentation } from '../../hooks';
import { isUserCancellation } from '../../utils/errors/errorHandler';

interface LoginSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSignIn: (identifier: string) => Promise<void>;
  title?: string;
  description?: string;
  name?: string;
  /** When set, shows a "Need an account? Create one" link that calls this (e.g. from account switcher). */
  onOpenSignUp?: () => void;
}

const LoginSheet: React.FC<LoginSheetProps> = ({
  visible,
  onDismiss,
  onSignIn,
  title = 'Sign in',
  description = 'Enter your handle to continue',
  name = 'login-sheet',
  onOpenSignUp,
}) => {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useSheetPresentation(visible, name);

  // Memoize computed values to avoid redundant calculations
  const trimmedHandle = useMemo(() => handle.trim(), [handle]);
  const canSubmit = trimmedHandle.length > 0 && !isSigningIn;

  const handleSignIn = useCallback(async () => {
    if (!trimmedHandle) {
      setError('Please enter your handle');
      return;
    }

    // Basic validation for common formats
    if (!trimmedHandle.includes('.') && !trimmedHandle.includes('@')) {
      setError('Enter a full address (e.g. you.orbyt.video)');
      return;
    }

    setError(null);
    setIsSigningIn(true);

    try {
      await onSignIn(trimmedHandle);

      TrueSheet.dismiss(name).catch(() => {});
      onDismiss();
    } catch (err) {
      if (!isUserCancellation(err)) {
        const errorMessage = err instanceof Error ? err.message : 'Sign-in failed';
        let userFriendlyMessage = `Could not connect to ${trimmedHandle}`;

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          userFriendlyMessage = `Network error connecting to ${trimmedHandle}. Please check your internet connection and try again.`;
        } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
          userFriendlyMessage = `Could not find the server for ${trimmedHandle}. Please check it and try again.`;
        } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
          userFriendlyMessage = `Invalid format for ${trimmedHandle}. Try something like you.orbyt.video`;
        }

        setError(userFriendlyMessage);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [trimmedHandle, onSignIn, onDismiss, name]);

  const handleDismiss = useCallback(() => {
    setHandle('');
    setError(null);
    setIsSigningIn(false);
    TrueSheet.dismiss(name).catch(() => {});
    onDismiss();
  }, [onDismiss, name]);

  return (
    <VerticalListSheet
      name={name}
      onDismiss={handleDismiss}
      title={title}
      description={description}
      showCancelButton={false}
      scrollable={false}
    >
      <View>
        <ErrorMessage error={error} />

        <View style={authSheetStyles.inputContainer}>
          <Icon name="at" size={28} color={Colors.black} style={authSheetStyles.inputIcon} />
          <TextInput
            nativeID="login-handle-input"
            style={authSheetStyles.input}
            placeholder="you.orbyt.video"
            placeholderTextColor={Colors.neutral[500]}
            value={handle}
            onChangeText={text => {
              setHandle(text);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            importantForAutofill="yes"
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            editable={!isSigningIn}
            caretHidden={false}
            autoFocus
            accessibilityLabel="Handle input"
            accessibilityHint="Enter your Bluesky or orbyt handle to sign in"
          />
        </View>

        <Pressable
          style={[authSheetStyles.button, canSubmit && authSheetStyles.buttonActive]}
          onPress={handleSignIn}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {isSigningIn ? (
            <View style={authSheetStyles.buttonContent}>
              <Loading3FillIcon
                size={24}
                color={Colors.neutral[500]}
                style={authSheetStyles.loadingIcon}
              />
              <Text style={authSheetStyles.buttonText}>Signing in...</Text>
            </View>
          ) : (
            <View style={authSheetStyles.buttonContentRow}>
              <Text
                style={[authSheetStyles.buttonText, canSubmit && authSheetStyles.buttonTextActive]}
              >
                Sign me in
              </Text>
              <Icon
                name="right_arrow_filled"
                size={24}
                color={canSubmit ? Colors.neutral[900] : Colors.neutral[500]}
              />
            </View>
          )}
        </Pressable>

        {onOpenSignUp && (
          <View style={authSheetStyles.footerContainer}>
            <Text style={authSheetStyles.footerText}>Need an account? </Text>
            <Text
              style={authSheetStyles.footerLink}
              onPress={() => {
                handleDismiss();
                onOpenSignUp();
              }}
              suppressHighlighting
            >
              Create one
            </Text>
          </View>
        )}
      </View>
    </VerticalListSheet>
  );
};

export default LoginSheet;
