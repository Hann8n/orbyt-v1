import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, ActivityIndicator, StyleSheet, Keyboard } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import AuthModalLayout, { AUTH_KEYBOARD_OVERLAP_SIGN_IN } from '@/components/ui/AuthModalLayout';
import {
  RICH_TEXT_SEARCH_AUTHOR_ITEM_DEFAULTS,
  RICH_TEXT_SEARCH_AUTHOR_ITEM_STYLE,
} from '@/components/ui/usersearch';
import AuthorItem from '@/components/ui/AuthorItem';
import Icon from '@/components/ui/Icon';
import { Avatar, Colors } from '@/components/ui/UI';
import { AUTH_INPUT_CONTENT_PADDING_START, authSheetStyles } from '@/components/ui/AuthSheetStyles';
import { itemSizeConfig } from '@/components/ui/ItemStyles';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { SquircleView } from '@/components/ui/Squircle';
import { useAuth } from '@/stores/userStore';
import { isUserCancellation } from '@/utils/errors/errorHandler';
import { posthog } from '@/config/posthog';
import { ActorService } from '@/services/api/actor/ActorService';
import type { ProfileViewBasic } from '@/services/api/types';
import { queryKeys } from '@/utils/query/queryKeys';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;
const SUGGESTION_LIMIT = 8;

/** Leading @ / matched-avatar size in the handle field (Icon + Avatar). */
const LOGIN_AT_ICON_SIZE = 34;

/**
 * Align list avatar center with the field @/avatar. Scroll content is already inset by the modal
 * gutter, so only use in-field offsets + icon/avatar geometry (not `AUTH_MODAL_HORIZONTAL_GUTTER`).
 */
const SIGN_IN_SUGGESTION_PADDING_LEFT =
  AUTH_INPUT_CONTENT_PADDING_START + LOGIN_AT_ICON_SIZE / 2 - itemSizeConfig.large.avatarSize / 2;

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

  const { signIn } = useAuth();

  const sheetTitle = isAddAccount ? t('auth.addAccount') : t('auth.signIn');

  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
      await signIn(trimmedHandle);
      posthog.identify(trimmedHandle, {
        $set: { handle: trimmedHandle },
        $set_once: { first_sign_in_date: new Date().toISOString() },
      });
      posthog.capture('user_signed_in', {
        handle: trimmedHandle,
        is_add_account: isAddAccount,
      });
      if (isAddAccount) {
        router.dismissTo('/(tabs)/home');
      }
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

  const stickyFooter = (
    <>
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
      <SquircleView style={authSheetStyles.inputContainer}>
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
              {...RICH_TEXT_SEARCH_AUTHOR_ITEM_DEFAULTS}
              handle={actor.handle}
              did={actor.did}
              displayName={actor.displayName}
              avatar={actor.avatar}
              showRing={false}
              skipServerProfileData
              style={[RICH_TEXT_SEARCH_AUTHOR_ITEM_STYLE, styles.signInSuggestionAuthorAlign]}
              onPress={() => handlePickSuggestion(actor.handle, actor)}
            />
          ))}
        </View>
      ) : null}
    </AuthModalLayout>
  );
}

const styles = StyleSheet.create({
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
  suggestionsWrap: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
  /** Overrides symmetric `paddingHorizontal` so avatar center lines up with @ (see `SIGN_IN_SUGGESTION_PADDING_LEFT`). */
  signInSuggestionAuthorAlign: {
    paddingLeft: SIGN_IN_SUGGESTION_PADDING_LEFT,
    paddingRight: 12,
  },
});
