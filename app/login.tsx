import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BLUR_INTENSITY, BORDER_RADIUS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path, Rect, Defs, Mask } from 'react-native-svg';
import { Colors } from '@/theme';
import AuthorItem from '@/components/ui/AuthorItem';
import type { SavedAccount } from '@/stores/userStore';
import {
  AuthFlowError,
  useAuth,
  useAccountManagement,
  isIosLiquidGlassAvailable,
} from '@/stores/userStore';
import type { ProfileViewWithOrbyt } from '@/services/api/types';
import { hydrateAccountsWithCachedProfiles } from '@/utils/atproto/accountSwitching';
import { hexToRGBA } from '@/utils/formatting/colors';
import RocketBackground from '@/components/ui/RocketBackground';
import { isUserCancellation } from '@/utils/errors/errorHandler';
import { posthog } from '@/config/posthog';
import { FontFamily, Typography } from '@/utils/components/typography';

// Login logo: PNG 4x on Android (avoids SVG stroke clipping), SVG on iOS
const orbytLogoLoginPng = require('@/assets/orbyt-logo-login.png');

const ACCOUNTS_SCROLL_MAX_HEIGHT = 340;

const LOGIN_LOGO_SIZE = 120;

function OrbytLoginMark({ size }: { size: number }) {
  return Platform.OS === 'android' ? (
    <Image source={orbytLogoLoginPng} style={{ width: size, height: size }} contentFit="contain" />
  ) : (
    <Svg width={size} height={size} viewBox="32 32 960 960">
      <Defs>
        <Mask id="cutout-mask-login">
          <Rect x="65" y="65" width="894" height="894" fill="white" />
          <Path
            fill="black"
            fillOpacity={0.9}
            fillRule="evenodd"
            d="M349 129.3c-23.9 5.4-36.8 31.5-26.1 53.2 8 16.2 25.2 24.4 42.1 20.1 7.4-1.9 5.3-3.4 18.5 13.9 10.3 13.6 33.6 44.2 36.7 48.4 3.5 4.6 3.5 4.6-1.1 8.9-5.9 5.6-14.1 16.9-19 26-5 9.4-3.4 8.6-22.1 10.2-136.2 11.1-177 34.7-192.6 111.5-16.5 81.2-16.5 193.6.1 276.7 10.5 52.9 39.8 83.7 89.3 93.9 6 1.3 6 1.3 2.5 8.8-18.4 39.4-5.4 73.1 30 78.1 24.5 3.5 32.3-1.8 73.7-50 20.8-24.3 16.8-22.1 37-20.5 50.9 4.1 138.2 4.1 189 0 20.2-1.6 16.2-3.8 37 20.5 41.4 48.2 49.2 53.5 73.7 50 35.4-5 48.4-38.7 30-78.1-3.5-7.5-3.5-7.5 2.5-8.8 49.5-10.2 78.8-41 89.3-93.9 16.6-83.1 16.6-195.5.1-276.7C824 344.7 783.2 321.1 647 310c-18.7-1.6-17.1-.8-22.1-10.2-4.9-9.1-13.1-20.4-19-26-4.6-4.3-4.6-4.3-1.1-8.9 3.1-4.2 26.4-34.8 36.7-48.4 13.2-17.3 11.1-15.8 18.5-13.9 41.5 10.6 64.2-49.2 26.3-69.3-32-17.1-68 17.2-51.7 49.3 3.1 6.1 3.1 6.1-11.8 25.5-8.2 10.7-20 26-26.1 34.1-11.1 14.8-11.1 14.8-14.7 12.6-44.5-26.5-94.5-26.5-139 0-3.6 2.2-3.6 2.2-14.7-12.6-6.1-8.1-17.9-23.4-26.1-34.1-14.9-19.4-14.9-19.4-11.8-25.5 13.8-27.1-11.7-59.8-41.4-53.3m249.3 243.2C752 381.3 773.8 399.3 781.1 523c5.8 98.9-9.4 168.3-41.5 189.8-59.5 39.8-394.7 39.8-454.2 0-32.1-21.5-47.3-90.9-41.5-189.8 7.7-130.5 28.8-144.8 226.1-152.4 19.3-.8 104.3.5 128.3 1.9Z"
          />
          <Rect
            fill="black"
            fillOpacity={0.9}
            x="372"
            y="482"
            width="82"
            height="136"
            rx="41"
            ry="41"
          />
          <Rect
            fill="black"
            fillOpacity={0.9}
            x="570"
            y="482"
            width="82"
            height="136"
            rx="41"
            ry="41"
          />
        </Mask>
      </Defs>
      <Path
        mask="url(#cutout-mask-login)"
        fill={Colors.neutral[50]}
        stroke={Colors.neutral[50]}
        strokeWidth="65"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M349 129.3c-23.9 5.4-36.8 31.5-26.1 53.2 8 16.2 25.2 24.4 42.1 20.1 7.4-1.9 5.3-3.4 18.5 13.9 10.3 13.6 33.6 44.2 36.7 48.4 3.5 4.6 3.5 4.6-1.1 8.9-5.9 5.6-14.1 16.9-19 26-5 9.4-3.4 8.6-22.1 10.2-136.2 11.1-177 34.7-192.6 111.5-16.5 81.2-16.5 193.6.1 276.7 10.5 52.9 39.8 83.7 89.3 93.9 6 1.3 6 1.3 2.5 8.8-18.4 39.4-5.4 73.1 30 78.1 24.5 3.5 32.3-1.8 73.7-50 20.8-24.3 16.8-22.1 37-20.5 50.9 4.1 138.2 4.1 189 0 20.2-1.6 16.2-3.8 37 20.5 41.4 48.2 49.2 53.5 73.7 50 35.4-5 48.4-38.7 30-78.1-3.5-7.5-3.5-7.5 2.5-8.8 49.5-10.2 78.8-41 89.3-93.9 16.6-83.1 16.6-195.5.1-276.7C824 344.7 783.2 321.1 647 310c-18.7-1.6-17.1-.8-22.1-10.2-4.9-9.1-13.1-20.4-19-26-4.6-4.3-4.6-4.3-1.1-8.9 3.1-4.2 26.4-34.8 36.7-48.4 13.2-17.3 11.1-15.8 18.5-13.9 41.5 10.6 64.2-49.2 26.3-69.3-32-17.1-68 17.2-51.7 49.3 3.1 6.1 3.1 6.1-11.8 25.5-8.2 10.7-20 26-26.1 34.1-11.1 14.8-11.1 14.8-14.7 12.6-44.5-26.5-94.5-26.5-139 0-3.6 2.2-3.6 2.2-14.7-12.6-6.1-8.1-17.9-23.4-26.1-34.1-14.9-19.4-14.9-19.4-11.8-25.5 13.8-27.1-11.7-59.8-41.4-53.3Z"
      />
    </Svg>
  );
}

interface LoginScreenProps {
  onAccountSwitch?: (account: SavedAccount) => Promise<void>;
}

interface AccountRow extends SavedAccount {
  cachedProfile?: ProfileViewWithOrbyt;
}

export default function LoginScreen({ onAccountSwitch }: LoginScreenProps = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const { signIn, clearAuthError } = useAuth();

  const { savedAccounts, switchAccount, loadSavedAccounts } = useAccountManagement();

  const hasSavedAccounts = savedAccounts.length > 0;

  const loadAccounts = useCallback(async () => {
    const base = savedAccounts.map(account => ({ ...account }));
    setAccounts(base);
    try {
      const withProfiles = await hydrateAccountsWithCachedProfiles(savedAccounts);
      setAccounts(withProfiles);
    } catch {
      void 0;
    }
  }, [savedAccounts]);

  useEffect(() => {
    if (savedAccounts.length > 0) {
      void loadAccounts();
    } else {
      setAccounts([]);
    }
  }, [savedAccounts, loadAccounts]);
  const loginButtonsInsetStyle = useMemo(
    () => ({
      paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom + 16 : 16,
    }),
    [insets]
  );
  const containerInsetStyle = useMemo(
    () => ({
      paddingTop: typeof insets?.top === 'number' ? insets.top : 0,
      paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom : 0,
    }),
    [insets]
  );

  const handleSavedAccountLogin = async (account: SavedAccount) => {
    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      await switchAccount(account.did);
      posthog.identify(account.did, {
        $set: { handle: account.handle },
      });
      posthog.capture('account_switched', {
        did: account.did,
        handle: account.handle,
      });
      if (onAccountSwitch) {
        await onAccountSwitch(account);
      }
    } catch (error) {
      setIsLoading(false);
      if (isUserCancellation(error)) return;

      if (error instanceof AuthFlowError && error.kind === 'reauth_required') {
        try {
          await signIn(account.originalIdentifier);
          await switchAccount(account.did);
          if (onAccountSwitch) {
            await onAccountSwitch(account);
          }
          await loadSavedAccounts();
        } catch {
          Alert.alert(t('auth.networkError'), t('auth.networkErrorMessage'), [
            { text: t('common.ok') },
          ]);
        }
        return;
      }

      Alert.alert(t('auth.networkError'), t('auth.networkErrorMessage'), [
        { text: t('common.ok') },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderSavedAccountsBottom = () => (
    <View style={styles.savedAccountsBottom}>
      <ScrollView
        style={styles.accountsScroll}
        contentContainerStyle={styles.accountsScrollContent}
        showsVerticalScrollIndicator={
          accounts.length >= SCROLL_INDICATOR_CONSTANTS.LOGIN_ACCOUNTS_MIN_ITEMS
        }
        bounces={accounts.length >= SCROLL_INDICATOR_CONSTANTS.LOGIN_ACCOUNTS_MIN_ITEMS}
        overScrollMode="always"
        scrollEventThrottle={16}
        decelerationRate="normal"
        keyboardShouldPersistTaps="handled"
      >
        {accounts.map(account => {
          const displayName =
            account.cachedProfile?.displayName ||
            account.displayName ||
            account.handle ||
            t('profile.userFallback');
          const handle = account.cachedProfile?.handle || account.handle;

          return (
            <AuthorItem
              key={account.id}
              handle={handle}
              did={account.did}
              displayName={displayName}
              avatar={account.cachedProfile?.avatar ?? account.avatar}
              onPress={() => {
                if (!isLoading) {
                  void handleSavedAccountLogin(account);
                }
              }}
              size="large"
              showArrow={true}
              arrowStyle="option"
              backgroundBlurIntensity={BLUR_INTENSITY.ACCOUNT_CARD}
            />
          );
        })}
      </ScrollView>

      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>{t('common.or')}</Text>
        <View style={styles.divider} />
      </View>

      {renderLoginButtons()}
    </View>
  );

  const renderLoginButtons = () => {
    const useLiquidGlassSignIn = isIosLiquidGlassAvailable;

    const signInButtonContent = (
      <View style={styles.buttonContent} pointerEvents="none">
        {isLoading ? (
          <>
            <ActivityIndicator
              size="small"
              color={Colors.neutral[975]}
              style={styles.loadingIcon}
            />
            <Text style={styles.blueskyButtonText}>{t('auth.signingIn')}</Text>
          </>
        ) : (
          <Text style={styles.blueskyButtonText}>{t('auth.signInWithHandle')}</Text>
        )}
      </View>
    );

    return (
      <View style={[styles.loginButtonsContainer, loginButtonsInsetStyle]}>
        <SquircleNativePressable
          style={[styles.signInWithHandleButton, !useLiquidGlassSignIn && styles.whiteButton]}
          onPress={() => !isLoading && router.push('/login-sign-in')}
          disabled={isLoading}
        >
          {useLiquidGlassSignIn ? (
            <>
              <GlassView
                style={[StyleSheet.absoluteFillObject, styles.signInGlassUnderlay]}
                glassEffectStyle="clear"
                tintColor={Colors.neutral[50]}
                isInteractive
              />
              {signInButtonContent}
            </>
          ) : (
            signInButtonContent
          )}
        </SquircleNativePressable>

        <View style={styles.manualSignInLink}>
          <Text style={styles.networkSignInText}>
            {t('auth.needAccount')}
            <Text
              suppressHighlighting
              onPress={() => !isLoading && router.push('/login-sign-up')}
              style={[styles.networkSignInLink, isLoading && styles.signUpLinkDisabled]}
            >
              {t('auth.signUpHere')}
            </Text>
          </Text>
        </View>
      </View>
    );
  };

  const renderManualLogin = () => (
    <View style={styles.formContainer}>
      {oauthError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{oauthError}</Text>
        </View>
      )}

      {renderLoginButtons()}
    </View>
  );

  const renderLoginLogo = () => (
    <View style={styles.logoContainer}>
      <OrbytLoginMark size={LOGIN_LOGO_SIZE} />
    </View>
  );

  const renderContent = () => (
    <View style={styles.backgroundImage}>
      <StatusBar hidden />
      <RocketBackground />
      <View
        style={[
          styles.container,
          containerInsetStyle,
          hasSavedAccounts
            ? styles.containerWithSavedAccounts
            : styles.containerWithoutSavedAccounts,
        ]}
      >
        {hasSavedAccounts ? (
          <>
            {renderLoginLogo()}
            <View style={styles.savedAccountsSpacer} />
            {renderSavedAccountsBottom()}
          </>
        ) : (
          <>
            {renderLoginLogo()}
            {renderManualLogin()}
          </>
        )}
      </View>
    </View>
  );

  return renderContent();
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  containerWithSavedAccounts: {
    flex: 1,
    backgroundColor: Colors.overlay.black50,
  },
  containerWithoutSavedAccounts: {
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay.black50,
  },
  savedAccountsSpacer: {
    flex: 1,
    minHeight: 0,
  },
  savedAccountsBottom: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 20,
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  loginButtonsContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  signInWithHandleButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.FULL,
    marginTop: 8,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: Colors.neutral[975],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 56,
  },
  whiteButton: {
    backgroundColor: Colors.neutral[50],
  },
  signInGlassUnderlay: {
    borderRadius: BORDER_RADIUS.FULL,
  },
  blueskyButtonText: {
    color: Colors.neutral[975],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.bold,
  },
  signUpLinkDisabled: {
    opacity: 0.5,
  },
  accountsScroll: {
    maxHeight: ACCOUNTS_SCROLL_MAX_HEIGHT,
    width: '100%',
  },
  accountsScrollContent: {
    paddingBottom: 4,
  },

  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: hexToRGBA(Colors.coral[500], 0.1),
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: Colors.coral[500],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIcon: {
    marginRight: 8,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 28,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.neutral[500],
    opacity: 0.3,
  },
  dividerText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.medium,
    marginHorizontal: 16,
  },
  manualSignInLink: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
  },
  networkSignInText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: Typography.lineHeights.body,
  },
  networkSignInLink: {
    color: Colors.neutral[200],
    fontFamily: FontFamily.bold,
  },
});
