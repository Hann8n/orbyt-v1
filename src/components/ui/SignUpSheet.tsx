import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, Linking, ActivityIndicator } from 'react-native';
import VerticalListSheet, { TrueSheet } from './VerticalListSheet';
import { Colors } from './UI';
import Icon from './Icon';
import { useAuth, useAccountManagement } from '../../stores/userStore';
import { checkPdsActive } from '../../services/api/pdsHealth';
import { authSheetStyles } from './AuthSheetStyles';
import ErrorMessage from './ErrorMessage';
import { useSheetPresentation } from '../../hooks';
import { isUserCancellation } from '../../utils/errors/errorHandler';
import { NativePressable } from './NativePressable';
import { SquircleView } from './Squircle';

const DEFAULT_PDS = 'https://bsky.social';

function normalizePds(input: string): string {
  const trimmed = input.trim() || 'bsky.social';
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.toLowerCase().replace(/\/+$/, '');
}

interface SignUpSheetProps {
  visible: boolean;
  onDismiss: () => void;
  name?: string;
}

const SignUpSheet: React.FC<SignUpSheetProps> = ({
  visible,
  onDismiss,
  name = 'sign-up-sheet',
}) => {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const { loadSavedAccounts } = useAccountManagement();
  const [pdsUrl, setPdsUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [canContinue, setCanContinue] = useState(true);

  const checkAbortRef = useRef<AbortController | null>(null);
  const lastKeyRef = useRef('');
  const lastCheckErrorRef = useRef<string | null>(null);

  useSheetPresentation(visible, name);

  useEffect(() => {
    const key = normalizePds(pdsUrl);

    if (key === DEFAULT_PDS) {
      lastKeyRef.current = key;
      lastCheckErrorRef.current = null;
      setError(null);
      setCanContinue(true);
      return;
    }

    if (key === lastKeyRef.current) return;

    lastKeyRef.current = key;
    setCanContinue(false);
    lastCheckErrorRef.current = null;

    checkAbortRef.current?.abort();

    const ac = new AbortController();
    checkAbortRef.current = ac;

    const toCheck = pdsUrl.trim() || 'bsky.social';
    checkPdsActive(toCheck)
      .then(result => {
        if (ac.signal.aborted) return;
        setCanContinue(result.success);
        lastCheckErrorRef.current = result.success ? null : result.error || null;
      })
      .catch(() => {
        if (!ac.signal.aborted) {
          setCanContinue(false);
          lastCheckErrorRef.current = t('auth.couldNotCheckServer');
        }
      });

    return () => {
      ac.abort();
      checkAbortRef.current = null;
    };
  }, [pdsUrl]);

  const handleDismiss = useCallback(() => {
    checkAbortRef.current?.abort();
    setPdsUrl('');
    setError(null);
    setIsSigningUp(false);
    setCanContinue(true);
    lastKeyRef.current = '';
    lastCheckErrorRef.current = null;
    onDismiss();
  }, [onDismiss]);

  const handleSignUp = useCallback(async () => {
    const identifier = normalizePds(pdsUrl);
    setError(null);
    setIsSigningUp(true);
    try {
      await signUp(identifier);
      await loadSavedAccounts();
      TrueSheet.dismiss(name);
    } catch (err) {
      if (!isUserCancellation(err)) {
        setError(t('auth.signUpFailed'));
      }
    } finally {
      setIsSigningUp(false);
    }
  }, [pdsUrl, signUp, loadSavedAccounts, name]);

  const onPress = () => {
    if (isSigningUp) return;
    if (!canContinue) {
      setError(lastCheckErrorRef.current || t('auth.couldNotVerifyServer'));
      return;
    }
    handleSignUp();
  };

  return (
    <VerticalListSheet
      name={name}
      onDismiss={handleDismiss}
      title={t('auth.signUp')}
      description={t('auth.enterAccountProvider')}
      showCancelButton={false}
      scrollable={false}
    >
      <View>
        <ErrorMessage error={error} />

        <SquircleView style={authSheetStyles.inputContainer}>
          <View style={authSheetStyles.inputContent}>
            <Icon
              name="cloud"
              size={28}
              color={Colors.neutral[400]}
              style={authSheetStyles.inputIcon}
            />
            <TextInput
              nativeID="sign-up-pds-input"
              style={authSheetStyles.input}
              placeholder={t('auth.accountProviderPlaceholder')}
              placeholderTextColor={Colors.neutral[500]}
              value={pdsUrl}
              onChangeText={text => {
                setPdsUrl(text);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleSignUp}
              editable={!isSigningUp}
              autoFocus
              accessibilityLabel={t('auth.accountProviderInput')}
              accessibilityHint={t('auth.accountProviderHint')}
            />
          </View>
        </SquircleView>

        <NativePressable
          style={[
            authSheetStyles.button,
            canContinue && !isSigningUp && authSheetStyles.buttonActive,
          ]}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('auth.continueToSignUp')}
          accessibilityState={{ disabled: !canContinue || isSigningUp }}
        >
          {isSigningUp ? (
            <View style={authSheetStyles.buttonContent}>
              <ActivityIndicator
                size="small"
                color={Colors.neutral[500]}
                style={authSheetStyles.loadingIcon}
              />
              <Text style={authSheetStyles.buttonText}>{t('auth.connecting')}</Text>
            </View>
          ) : (
            <View style={authSheetStyles.buttonContentRow}>
              <Text
                style={[
                  authSheetStyles.buttonText,
                  canContinue && authSheetStyles.buttonTextActive,
                ]}
              >
                {t('auth.continueToSignUp')}
              </Text>
              <Icon
                name="arrow_right"
                size={24}
                color={canContinue ? Colors.neutral[900] : Colors.neutral[500]}
              />
            </View>
          )}
        </NativePressable>

        <View style={authSheetStyles.footerContainer}>
          <Text style={authSheetStyles.footerText}>
            {t('auth.orbytTerms')}
            <Text
              style={authSheetStyles.footerLink}
              onPress={() => Linking.openURL('https://getorbyt.com/terms')}
            >
              {t('auth.orbytTermsLink')}
            </Text>
          </Text>
        </View>
      </View>
    </VerticalListSheet>
  );
};

export default SignUpSheet;
