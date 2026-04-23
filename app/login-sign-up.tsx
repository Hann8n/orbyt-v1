import { useState, useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View, Text, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import AuthModalLayout, { AUTH_KEYBOARD_OVERLAP_SIGN_UP } from '@/components/ui/AuthModalLayout';
import { Colors } from '@/components/ui/UI';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/stores/userStore';
import { checkPdsActive } from '@/services/api/pdsHealth';
import { authSheetStyles } from '@/components/ui/AuthSheetStyles';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { NativePressable } from '@/components/ui/NativePressable';
import { isUserCancellation } from '@/utils/errors/errorHandler';
import {
  getProviderMetadata,
  normalizeBackendUrl,
  resolveAppViewDidForBackend,
} from '@/services/auth';
import { useServiceProviderStore } from '@/stores/serviceProviderStore';
import { FontFamily, Typography } from '@/utils/components/typography';

export default function LoginSignUpModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const isAddAccount = pathname.includes('add-account');
  const { signUp } = useAuth();
  const selectedServiceProvider = useServiceProviderStore(state => state.selectedServiceProvider);
  const selectedPdsBackend = useServiceProviderStore(state => state.selectedPdsBackend);
  const providerMetadata = getProviderMetadata(selectedServiceProvider);
  const pdsMetadata = getProviderMetadata(selectedPdsBackend);
  const isPdsSameAsProvider =
    normalizeBackendUrl(selectedPdsBackend) === normalizeBackendUrl(selectedServiceProvider);
  const showProviderDomain =
    providerMetadata.domain.toLowerCase() !== providerMetadata.displayName.toLowerCase();
  const showPdsDomain = pdsMetadata.domain.toLowerCase() !== pdsMetadata.displayName.toLowerCase();
  const [error, setError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [isCheckingProvider, setIsCheckingProvider] = useState(true);
  const checkSeq = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const currentSeq = ++checkSeq.current;

    const checkProvider = async () => {
      setError(null);
      setIsCheckingProvider(true);
      setCanContinue(false);

      const checkResult = await checkPdsActive(selectedPdsBackend);
      if (!isMounted || currentSeq !== checkSeq.current) return;

      setIsCheckingProvider(false);
      if (checkResult.success) {
        setCanContinue(true);
        return;
      }

      setCanContinue(false);
      setError(checkResult.error || t('auth.couldNotVerifyServer'));
    };

    void checkProvider();

    return () => {
      isMounted = false;
    };
  }, [selectedPdsBackend, t]);

  const handleSignUp = useCallback(async () => {
    const backend = normalizeBackendUrl(selectedPdsBackend);
    if (!canContinue) {
      setError(t('auth.couldNotVerifyServer'));
      return;
    }
    setError(null);
    setIsSigningUp(true);
    try {
      const checkResult = await checkPdsActive(backend);
      if (!checkResult.success) {
        setError(checkResult.error || t('auth.couldNotVerifyServer'));
        return;
      }
      const appViewDid = await resolveAppViewDidForBackend(backend);
      await signUp(backend, { backend, appViewDid });
      if (isAddAccount) {
        router.dismissTo('/(tabs)/home');
      }
    } catch (err) {
      if (!isUserCancellation(err)) {
        setError(t('auth.signUpFailed'));
      }
    } finally {
      setIsSigningUp(false);
    }
  }, [canContinue, selectedPdsBackend, signUp, t]);

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
          canContinue && !isSigningUp && !isCheckingProvider && authSheetStyles.buttonActive,
        ]}
        onPress={handleSignUp}
        disabled={!canContinue || isSigningUp || isCheckingProvider}
        accessibilityRole="button"
        accessibilityLabel={t('auth.continueToSignUp')}
        accessibilityState={{ disabled: !canContinue || isSigningUp || isCheckingProvider }}
      >
        {isSigningUp || isCheckingProvider ? (
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
      <View style={styles.flowLead}>
        <Text style={styles.flowIntroTitle}>{t('auth.signUpFlowTitle')}</Text>
        <Text style={styles.flowIntroText}>{t('auth.signUpFlowIntro')}</Text>
      </View>
      <View style={styles.stepsGroup}>
        <NativePressable
          style={styles.stepCard}
          onPress={() => router.push('/service-provider-select?target=serviceProvider')}
          disabled={isSigningUp}
          accessibilityRole="button"
          accessibilityLabel={t('auth.accountProviderInput')}
        >
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <View style={styles.stepHeaderTextGroup}>
              <Text style={styles.stepTitle}>{t('auth.accountProviderInput')}</Text>
              <Text style={styles.stepDescription}>{t('auth.signUpProviderStepHint')}</Text>
            </View>
          </View>
          <View style={styles.stepValueRow}>
            {providerMetadata.iconName ? (
              <View style={styles.serviceProviderInlineLogoWrap}>
                <Icon name={providerMetadata.iconName} size={18} color={Colors.neutral[50]} />
              </View>
            ) : null}
            <View style={styles.stepValueTextGroup}>
              <Text style={styles.serviceProviderValue} numberOfLines={1}>
                {providerMetadata.displayName}
              </Text>
              {showProviderDomain ? (
                <Text style={styles.serviceProviderDomain} numberOfLines={1}>
                  {`\u2022 ${providerMetadata.domain}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.inlineSwitchChip}>
              <Text style={styles.inlineSwitchText}>{t('common.switch')}</Text>
              <Icon name="arrow_right" size={14} color={Colors.neutral[300]} />
            </View>
          </View>
        </NativePressable>
        <NativePressable
          style={styles.stepCard}
          onPress={() => router.push('/service-provider-select?target=pds')}
          disabled={isSigningUp}
          accessibilityRole="button"
          accessibilityLabel={t('auth.pdsBackendInput')}
        >
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <View style={styles.stepHeaderTextGroup}>
              <Text style={styles.stepTitle}>{t('auth.pdsBackendInput')}</Text>
              <Text style={styles.stepDescription}>
                {isPdsSameAsProvider
                  ? t('auth.signUpPdsStepHintSynced')
                  : t('auth.signUpPdsStepHint')}
              </Text>
            </View>
          </View>
          <View style={styles.stepValueRow}>
            {pdsMetadata.iconName ? (
              <View style={styles.serviceProviderInlineLogoWrap}>
                <Icon name={pdsMetadata.iconName} size={18} color={Colors.neutral[50]} />
              </View>
            ) : null}
            <View style={styles.stepValueTextGroup}>
              <Text style={styles.serviceProviderValue} numberOfLines={1}>
                {pdsMetadata.displayName}
              </Text>
              {showPdsDomain ? (
                <Text style={styles.serviceProviderDomain} numberOfLines={1}>
                  {`\u2022 ${pdsMetadata.domain}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.inlineSwitchChip}>
              <Text style={styles.inlineSwitchText}>{t('common.switch')}</Text>
              <Icon name="arrow_right" size={14} color={Colors.neutral[300]} />
            </View>
          </View>
        </NativePressable>
      </View>
      <View style={styles.statusWrap}>
        <Text
          style={[
            styles.statusText,
            canContinue && !isCheckingProvider ? styles.statusTextSuccess : styles.statusTextMuted,
          ]}
        >
          {isCheckingProvider
            ? t('auth.signUpCheckingServer')
            : canContinue
              ? t('auth.signUpServerVerified')
              : t('auth.couldNotVerifyServer')}
        </Text>
      </View>
      {error ? (
        <View style={styles.errorOnlyContainer}>
          <ErrorMessage error={error} />
        </View>
      ) : null}
      <Text style={styles.descriptionBelowField}>{t('auth.signUpFlowFooter')}</Text>
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
  errorOnlyContainer: {
    marginTop: 8,
  },
  flowLead: {
    width: '100%',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  flowIntroTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    lineHeight: Typography.lineHeights.subtitle,
    fontFamily: FontFamily.semibold,
  },
  flowIntroText: {
    marginTop: 3,
    color: Colors.neutral[300],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.regular,
  },
  stepsGroup: {
    gap: 8,
  },
  descriptionBelowField: {
    ...authSheetStyles.footerText,
    marginTop: 12,
    textAlign: 'left',
    color: Colors.neutral[400],
  },
  stepCard: {
    width: '100%',
    borderRadius: 12,
    marginBottom: 0,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[925],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[800],
  },
  stepHeader: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: Colors.neutral[850],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
    fontFamily: FontFamily.bold,
  },
  stepHeaderTextGroup: {
    flex: 1,
    paddingHorizontal: 10,
  },
  stepTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.semibold,
  },
  stepDescription: {
    marginTop: 1,
    color: Colors.neutral[300],
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
    fontFamily: FontFamily.medium,
  },
  stepValueRow: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.neutral[800],
    backgroundColor: Colors.neutral[900],
  },
  stepValueTextGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  serviceProviderInlineLogoWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceProviderValue: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.semibold,
  },
  serviceProviderDomain: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.medium,
    flexShrink: 1,
  },
  inlineSwitchChip: {
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  inlineSwitchText: {
    color: Colors.neutral[300],
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
    fontFamily: FontFamily.semibold,
  },
  statusWrap: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[800],
    backgroundColor: Colors.neutral[925],
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusText: {
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
    fontFamily: FontFamily.medium,
  },
  statusTextMuted: {
    color: Colors.neutral[300],
  },
  statusTextSuccess: {
    color: Colors.teal[300],
  },
});
