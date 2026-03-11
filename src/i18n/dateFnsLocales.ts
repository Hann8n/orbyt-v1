import type { Locale } from 'date-fns';
import { es } from 'date-fns/locale';
import { ja } from 'date-fns/locale';

/**
 * date-fns locale map for supported app languages.
 * Add one entry per supported locale; 'en' uses date-fns default (undefined).
 * Align with app.json expo-localization supportedLocales.
 */
const DATE_FNS_LOCALE_MAP: Record<string, Locale> = {
  es,
  ja,
};

/** Returns the date-fns locale for a given language code, or undefined for English (date-fns default). */
export function getDateFnsLocaleForLanguage(lang: string): Locale | undefined {
  return lang === 'en' ? undefined : DATE_FNS_LOCALE_MAP[lang];
}
