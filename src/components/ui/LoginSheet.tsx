import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { NativePressable } from './NativePressable';
import Icon from './Icon';
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
  title,
  description,
  name = 'login-sheet',
  onOpenSignUp,
}) => {
  const { t } = useTranslation();
  const sheetTitle = title ?? t('auth.signIn');
  const sheetDescription = description ?? t('auth.enterHandle');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useSheetPresentation(visible, name);

  const trimmedHandle = handle.trim();
  const canSubmit = trimmedHandle.length > 0 && !isSigningIn;

  const handleSignIn = async () => {
    if (!trimmedHandle) {
      setError(t('auth.pleaseEnterHandle'));
      return;
    }

    // Basic validation for common formats
    if (!trimmedHandle.includes('.') && !trimmedHandle.includes('@')) {
      setError(t('auth.enterFullAddress'));
      return;
    }

    setError(null);
    setIsSigningIn(true);

    try {
      await onSignIn(trimmedHandle);
      TrueSheet.dismiss(name).catch(() => {});
    } catch (err) {
      if (!isUserCancellation(err)) {
        const errorMessage = err instanceof Error ? err.message : t('auth.signInFailed');
        let userFriendlyMessage = t('auth.couldNotConnect', { handle: trimmedHandle });

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          userFriendlyMessage = t('auth.networkErrorConnect', { handle: trimmedHandle });
        } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
          userFriendlyMessage = t('auth.couldNotFindServer', { handle: trimmedHandle });
        } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
          userFriendlyMessage = t('auth.invalidFormat', { handle: trimmedHandle });
        }

        setError(userFriendlyMessage);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const resetAndNotifyDismiss = () => {
    setHandle('');
    setError(null);
    setIsSigningIn(false);
    onDismiss();
  };

  const handleDismissPress = () => {
    TrueSheet.dismiss(name).catch(() => {});
  };

  return (
    <VerticalListSheet
      name={name}
      onDismiss={resetAndNotifyDismiss}
      title={sheetTitle}
      description={sheetDescription}
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
            placeholder={t('auth.handlePlaceholder')}
            accessibilityLabel={t('auth.handleInput')}
            accessibilityHint={t('auth.handleInputHint')}
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
          />
        </View>

        <NativePressable
          style={[authSheetStyles.button, canSubmit && authSheetStyles.buttonActive]}
          onPress={handleSignIn}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('auth.signIn')}
          accessibilityState={{ disabled: !canSubmit }}
        >
          {isSigningIn ? (
            <View style={authSheetStyles.buttonContent}>
              <ActivityIndicator
                size="small"
                color={Colors.neutral[500]}
                style={authSheetStyles.loadingIcon}
              />
              <Text style={authSheetStyles.buttonText}>{t('auth.signingIn')}</Text>
            </View>
          ) : (
            <View style={authSheetStyles.buttonContentRow}>
              <Text
                style={[authSheetStyles.buttonText, canSubmit && authSheetStyles.buttonTextActive]}
              >
                {t('auth.signMeIn')}
              </Text>
              <Icon
                name="arrow_right"
                size={24}
                color={canSubmit ? Colors.neutral[900] : Colors.neutral[500]}
              />
            </View>
          )}
        </NativePressable>

        {onOpenSignUp && (
          <View style={authSheetStyles.footerContainer}>
            <Text style={authSheetStyles.footerText}>{t('auth.needAccount')}</Text>
            <Text
              style={authSheetStyles.footerLink}
              onPress={() => {
                handleDismissPress();
                onOpenSignUp();
              }}
              suppressHighlighting
            >
              {t('auth.createOne')}
            </Text>
          </View>
        )}
      </View>
    </VerticalListSheet>
  );
};

export default LoginSheet;
