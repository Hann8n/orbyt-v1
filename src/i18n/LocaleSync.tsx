import { useEffect } from 'react';
import { useLocales } from 'expo-localization';
import i18n from './index';

/**
 * Syncs device locale to i18n. Mount once inside app tree (e.g. AppProviders).
 * useLocales() re-renders when OS locale changes (e.g. Android per-app language).
 */
export function LocaleSync() {
  const [locale] = useLocales();

  useEffect(() => {
    const code = locale?.languageCode ?? 'en';
    if (i18n.language !== code) {
      i18n.changeLanguage(code);
    }
  }, [locale?.languageCode]);

  return null;
}
