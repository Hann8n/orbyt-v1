import type { Locale } from 'date-fns';
import { de } from 'date-fns/locale';
import { es } from 'date-fns/locale';
import { fr } from 'date-fns/locale';
import { ja } from 'date-fns/locale';
import { ko } from 'date-fns/locale';
import { ptBR } from 'date-fns/locale';

/**
 * date-fns locale map for supported app languages.
 * Add one entry per supported locale; 'en' uses date-fns default (undefined).
 * Align with app.json expo-localization supportedLocales.
 */
const DATE_FNS_LOCALE_MAP: Record<string, Locale> = {
  de,
  es,
  fr,
  ja,
  ko,
  pt: ptBR,
};

/** Returns the date-fns locale for a given language code, or undefined for English (date-fns default). */
export function getDateFnsLocaleForLanguage(lang: string): Locale | undefined {
  return lang === 'en' ? undefined : DATE_FNS_LOCALE_MAP[lang];
}
