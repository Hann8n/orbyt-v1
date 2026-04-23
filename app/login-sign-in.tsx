import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, ActivityIndicator, StyleSheet, Keyboard } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import AuthModalLayout, { AUTH_KEYBOARD_OVERLAP_SIGN_IN } from '@/components/ui/AuthModalLayout';
import AuthorItem from '@/components/ui/AuthorItem';
import Icon from '@/components/ui/Icon';
import { Avatar, Colors } from '@/components/ui/UI';
import { authSheetStyles } from '@/components/ui/AuthSheetStyles';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { SquircleView } from '@/components/ui/Squircle';
import { useAuth } from '@/stores/userStore';
import { isUserCancellation } from '@/utils/errors/errorHandler';
import { logger } from '@/utils/logger';
import { ActorService } from '@/services/api/actor/ActorService';
import type { ProfileViewBasic } from '@/services/api/types';
import { queryKeys } from '@/utils/query/queryKeys';
import {
  getProviderMetadata,
  resolveAppViewDidForBackend,
  normalizeBackendUrl,
} from '@/services/auth';
import { useServiceProviderStore } from '@/stores/serviceProviderStore';
import { FontFamily, Typography } from '@/utils/components/typography';
import { authorListRowStyle } from '@/components/ui/ItemStyles';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;
const SUGGESTION_LIMIT = 8;
const SERVICE_PROVIDER_BANNER_OVERLAP = 8;
/** Leading @ / matched-avatar size in the handle field (Icon + Avatar). */
const LOGIN_AT_ICON_SIZE = 34;

function normalizeSearchTerm(raw: string): string {
  return raw.trim().replace(/^@+/, '');
}

function shouldRunActorSearch(raw: string): boolean {
  const q = normalizeSearchTerm(raw);
  if (q.length < MIN_SEARCH_LENGTH) return false;
  if (raw.includes('://')) return false;
  return true;
}

export default function LoginSignInModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const isAddAccount = pathname.includes('add-account');
  const signUpRoute = isAddAccount ? '/add-account-sign-up' : '/login-sign-up';

  const { signIn } = useAuth();

  const sheetTitle = t('auth.signIn');

  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const selectedServiceProvider = useServiceProviderStore(state => state.selectedServiceProvider);
  const providerMetadata = getProviderMetadata(selectedServiceProvider);
  const showProviderDomain =
    providerMetadata.domain.toLowerCase() !== providerMetadata.displayName.toLowerCase();
  /** Row chosen from the list — keeps avatar stable while debounce / query key catch up. */
  const [pickedActor, setPickedActor] = useState<ProfileViewBasic | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(handle), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [handle]);

  useEffect(() => {
    if (!pickedActor) return;
    const typed = normalizeSearchTerm(handle).toLowerCase();
    if (typed !== pickedActor.handle.toLowerCase()) {
      setPickedActor(null);
    }
  }, [handle, pickedActor]);

  const searchTerm = normalizeSearchTerm(debouncedSearch);
  const searchEnabled = shouldRunActorSearch(debouncedSearch);

  const { data: searchResult, isFetching: isSearchFetching } = useQuery({
    queryKey: queryKeys.auth.publicActorSearch(searchTerm.toLowerCase()),
    queryFn: () => ActorService.searchActorsPublic(searchTerm, { limit: SUGGESTION_LIMIT }),
    enabled: searchEnabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const suggestions = searchResult?.profiles ?? [];

  const matchedActor = useMemo(() => {
    const target = normalizeSearchTerm(handle).toLowerCase();
    if (!target) return undefined;
    if (pickedActor && pickedActor.handle.toLowerCase() === target) {
      return pickedActor;
    }
    return suggestions.find(a => a.handle.toLowerCase() === target);
  }, [handle, suggestions, pickedActor]);

  const filteredSuggestions = useMemo(() => {
    if (!matchedActor) return suggestions;
    return suggestions.filter(a => a.did !== matchedActor.did);
  }, [suggestions, matchedActor]);

  const trimmedHandle = handle.trim();
  const canSubmit = trimmedHandle.length > 0 && !isSigningIn;
  /** Exact profile match in the handle field (avatar in header / picked row / typed full handle). */
  const hasResolvedProfileMatch = !!matchedActor;
  /** Teal “active” look only when there is a resolved match; tap still works whenever `canSubmit`. */
  const signInCtaPrimary = canSubmit && hasResolvedProfileMatch;

  const handlePickSuggestion = useCallback((picked: string, actor: ProfileViewBasic) => {
    setHandle(picked);
    setDebouncedSearch(picked);
    setPickedActor(actor);
    setError(null);
    Keyboard.dismiss();
  }, []);

  const handleSignIn = async () => {
    if (!trimmedHandle) {
      setError(t('auth.pleaseEnterHandle'));
      return;
    }

    if (!trimmedHandle.includes('.') && !trimmedHandle.includes('@')) {
      setError(t('auth.enterFullAddress'));
      return;
    }

    setError(null);
    setIsSigningIn(true);

    try {
      const backend = normalizeBackendUrl(selectedServiceProvider);
      const appViewDid = await resolveAppViewDidForBackend(backend);
      await signIn(trimmedHandle, { backend, appViewDid });
      if (isAddAccount) {
        router.dismissTo('/(tabs)/home');
      }
    } catch (err) {
      if (!isUserCancellation(err)) {
        const errorMessage = err instanceof Error ? err.message : t('auth.signInFailed');
        logger.error('[LoginSignIn] signIn failed', err, { handle: trimmedHandle, errorMessage });
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

  const stickyFooter = (
    <>
      <View style={styles.signUpLinkWrap}>
        <Text style={styles.signUpText}>
          {t('auth.needAccount')}
          <Text
            suppressHighlighting
            onPress={() => !isSigningIn && router.push(signUpRoute)}
            style={[styles.signUpLink, isSigningIn && styles.signUpLinkDisabled]}
          >
            {t('auth.signUpHere')}
          </Text>
        </Text>
      </View>
      <SquircleNativePressable
        style={[
          authSheetStyles.button,
          styles.stickyCta,
          signInCtaPrimary && authSheetStyles.buttonActive,
        ]}
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
              style={[
                authSheetStyles.buttonText,
                signInCtaPrimary && authSheetStyles.buttonTextActive,
              ]}
            >
              {t('auth.signMeIn')}
            </Text>
            <Icon
              name="arrow_right"
              size={24}
              color={signInCtaPrimary ? Colors.neutral[975] : Colors.neutral[500]}
            />
          </View>
        )}
      </SquircleNativePressable>
    </>
  );

  const showSuggestions = searchEnabled && (filteredSuggestions.length > 0 || isSearchFetching);

  const fixedBody = (
    <>
      <View style={styles.inputWithProviderStack}>
        <SquircleView style={[authSheetStyles.inputContainer, styles.primaryInputContainer]}>
          <View style={authSheetStyles.inputContent}>
            {matchedActor ? (
              <Avatar
                uri={matchedActor.avatar}
                type="profile"
                size={LOGIN_AT_ICON_SIZE}
                showRing={false}
                style={authSheetStyles.inputIcon}
              />
            ) : (
              <Icon
                name="at"
                size={LOGIN_AT_ICON_SIZE}
                color={Colors.neutral[975]}
                style={authSheetStyles.inputIcon}
              />
            )}
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
            {isSearchFetching ? (
              <ActivityIndicator
                size="small"
                color={Colors.neutral[500]}
                style={styles.inputSpinner}
              />
            ) : null}
          </View>
        </SquircleView>
        <SquircleNativePressable
          style={[styles.serviceProviderBar, styles.serviceProviderBarAttached]}
          onPress={() => router.push('/service-provider-select?target=serviceProvider')}
          disabled={isSigningIn}
          accessibilityRole="button"
          accessibilityLabel={t('auth.accountProviderInput')}
        >
          <View style={styles.serviceProviderBarContent}>
            <View style={styles.serviceProviderTextGroup}>
              <View style={styles.serviceProviderValueRow}>
                {providerMetadata.iconName ? (
                  <View style={styles.serviceProviderInlineLogoWrap}>
                    <Icon name={providerMetadata.iconName} size={14} color={Colors.neutral[200]} />
                  </View>
                ) : null}
                <Text style={styles.serviceProviderValue} numberOfLines={1}>
                  {providerMetadata.displayName}
                </Text>
                {showProviderDomain ? (
                  <Text style={styles.serviceProviderDomain} numberOfLines={1}>
                    {`\u2022 ${providerMetadata.domain}`}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.serviceProviderEdit}>{t('common.switch')}</Text>
          </View>
        </SquircleNativePressable>
      </View>
      {error ? (
        <View style={styles.errorBelowSearch}>
          <ErrorMessage error={error} />
        </View>
      ) : null}
    </>
  );

  return (
    <AuthModalLayout
      title={sheetTitle}
      fixedBody={fixedBody}
      keyboardOverlapSpace={AUTH_KEYBOARD_OVERLAP_SIGN_IN}
      stickyFooter={stickyFooter}
    >
      {showSuggestions ? (
        <View style={styles.suggestionsWrap} accessibilityRole="list">
          {filteredSuggestions.map(actor => (
            <AuthorItem
              key={actor.did}
              handle={actor.handle}
              did={actor.did}
              displayName={actor.displayName}
              avatar={actor.avatar}
              size="large"
              showArrow={false}
              showFollowButton={false}
              backgroundColor={Colors.transparent}
              textColor={Colors.neutral[50]}
              nameFontWeight="Figtree-SemiBold"
              customFontSize={16}
              showRing={false}
              skipServerProfileData
              style={authorListRowStyle}
              onPress={() => handlePickSuggestion(actor.handle, actor)}
            />
          ))}
        </View>
      ) : null}
    </AuthModalLayout>
  );
}

const styles = StyleSheet.create({
  inputWithProviderStack: {
    gap: 2,
    overflow: 'visible',
  },
  primaryInputContainer: {
    marginBottom: 0,
    zIndex: 2,
  },
  serviceProviderBar: {
    marginBottom: 0,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[925],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[800],
  },
  serviceProviderBarAttached: {
    marginTop: -SERVICE_PROVIDER_BANNER_OVERLAP,
    marginHorizontal: -2,
    zIndex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.neutral[800],
  },
  serviceProviderBarContent: {
    minHeight: 34 + SERVICE_PROVIDER_BANNER_OVERLAP,
    paddingHorizontal: 18,
    paddingTop: 5 + SERVICE_PROVIDER_BANNER_OVERLAP,
    paddingBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceProviderTextGroup: {
    flex: 1,
    paddingRight: 8,
  },
  serviceProviderValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  serviceProviderInlineLogoWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceProviderValue: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.semibold,
  },
  serviceProviderDomain: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.medium,
  },
  serviceProviderEdit: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.medium,
    paddingLeft: 4,
  },
  stickyCta: {
    marginTop: 0,
    marginBottom: 0,
  },
  inputSpinner: {
    marginRight: 8,
  },
  errorBelowSearch: {
    marginTop: 8,
  },
  signUpLinkWrap: {
    marginTop: 0,
    marginBottom: 6,
    alignItems: 'center',
  },
  signUpText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  signUpLink: {
    color: Colors.neutral[200],
    fontFamily: FontFamily.bold,
  },
  signUpLinkDisabled: {
    opacity: 0.5,
  },
  suggestionsWrap: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
});
