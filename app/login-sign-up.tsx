import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import AuthModalLayout, { AUTH_KEYBOARD_OVERLAP_SIGN_UP } from '@/components/ui/AuthModalLayout';
import { Colors } from '@/components/ui/UI';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/stores/userStore';
import { checkPdsActive } from '@/services/api/pdsHealth';
import { AUTH_INPUT_CONTENT_PADDING_START, authSheetStyles } from '@/components/ui/AuthSheetStyles';
import { SHEET_STYLES } from '@/utils/components/truesheet';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { SquircleView } from '@/components/ui/Squircle';
import { isUserCancellation } from '@/utils/errors/errorHandler';
import { posthog } from '@/config/posthog';

const DEFAULT_PDS = 'https://bsky.social';

function normalizePds(input: string): string {
  const trimmed = input.trim() || 'bsky.social';
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.toLowerCase().replace(/\/+$/, '');
}

export default function LoginSignUpModal() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const [pdsUrl, setPdsUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [canContinue, setCanContinue] = useState(true);

  const checkAbortRef = useRef<AbortController | null>(null);
  const lastKeyRef = useRef('');
  const lastCheckErrorRef = useRef<string | null>(null);

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
  }, [pdsUrl, t]);

  const handleSignUp = useCallback(async () => {
    const identifier = normalizePds(pdsUrl);
    setError(null);
    setIsSigningUp(true);
    try {
      await signUp(identifier);
      posthog.capture('user_signed_up', {
        pds: identifier,
      });
    } catch (err) {
      if (!isUserCancellation(err)) {
        setError(t('auth.signUpFailed'));
      }
    } finally {
      setIsSigningUp(false);
    }
  }, [pdsUrl, signUp, t]);

  const onPress = () => {
    if (isSigningUp) return;
    if (!canContinue) {
      setError(lastCheckErrorRef.current || t('auth.couldNotVerifyServer'));
      return;
    }
    handleSignUp();
  };

  const stickyFooter = (
    <View style={styles.stickyFooterStack}>
      <Text style={[authSheetStyles.footerText, styles.termsAboveCta]}>
        {t('auth.orbytTerms')}
        <Text
          style={authSheetStyles.footerLink}
          onPress={() => Linking.openURL('https://getorbyt.com/terms')}
        >
          {t('auth.orbytTermsLink')}
        </Text>
      </Text>
      <SquircleNativePressable
        style={[
          authSheetStyles.button,
          styles.stickyCta,
          canContinue && !isSigningUp && authSheetStyles.buttonActive,
        ]}
        onPress={onPress}
        disabled={!canContinue || isSigningUp}
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
              style={[authSheetStyles.buttonText, canContinue && authSheetStyles.buttonTextActive]}
            >
              {t('auth.continueToSignUp')}
            </Text>
            <Icon
              name="arrow_right"
              size={24}
              color={canContinue ? Colors.neutral[975] : Colors.neutral[500]}
            />
          </View>
        )}
      </SquircleNativePressable>
    </View>
  );

  const fixedBody = (
    <>
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
            onSubmitEditing={onPress}
            editable={!isSigningUp}
            autoFocus
            accessibilityLabel={t('auth.accountProviderInput')}
            accessibilityHint={t('auth.accountProviderHint')}
          />
        </View>
      </SquircleView>

      {error ? (
        <View style={styles.errorBelowInput}>
          <ErrorMessage error={error} />
        </View>
      ) : null}

      <Text style={styles.descriptionBelowField}>{t('auth.enterAccountProvider')}</Text>
    </>
  );

  return (
    <AuthModalLayout
      title={t('auth.signUp')}
      fixedBody={fixedBody}
      keyboardOverlapSpace={AUTH_KEYBOARD_OVERLAP_SIGN_UP}
      stickyFooter={stickyFooter}
    >
      {null}
    </AuthModalLayout>
  );
}

const styles = StyleSheet.create({
  stickyFooterStack: {
    alignSelf: 'stretch',
    width: '100%',
  },
  termsAboveCta: {
    textAlign: 'center',
    marginBottom: 12,
  },
  stickyCta: {
    marginTop: 0,
    marginBottom: 0,
  },
  errorBelowInput: {
    marginTop: 8,
  },
  descriptionBelowField: {
    ...SHEET_STYLES.descriptionText,
    marginLeft: AUTH_INPUT_CONTENT_PADDING_START,
    marginTop: 12,
    alignSelf: 'stretch',
  },
});
