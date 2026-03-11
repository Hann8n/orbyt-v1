import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import i18n, { resolveLocale } from './index';

const applyLocale = () => {
  const resolved = resolveLocale(getLocales());
  if (i18n.language !== resolved) i18n.changeLanguage(resolved);
};

/**
 * Syncs device locale to i18n. Mount once inside app tree (e.g. AppProviders).
 * On Android, users can change language in Settings without restarting — AppState
 * re-runs getLocales() on foreground per Expo docs.
 */
export function LocaleSync() {
  useEffect(() => {
    applyLocale();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') applyLocale();
    });
    return () => subscription.remove();
  }, []);
  return null;
}
