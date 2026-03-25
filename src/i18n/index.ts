import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales, type Locale } from 'expo-localization';

import en from './locales/en.json';
import { getDateFnsLocaleForLanguage } from './dateFnsLocales';

type TranslationResource = Record<string, unknown>;
type LocaleLoaderKey = 'de' | 'es' | 'es-LA' | 'fr' | 'ja' | 'ko' | 'pt-BR';

const localeLoaders: Record<LocaleLoaderKey, () => Promise<{ default: TranslationResource }>> = {
  de: () => import('./locales/de.json'),
  es: () => import('./locales/es.json'),
  'es-LA': () => import('./locales/es-LA.json'),
  fr: () => import('./locales/fr.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
};

const localeAliasMap: Record<string, LocaleLoaderKey | 'en'> = {
  de: 'de',
  en: 'en',
  es: 'es',
  'es-LA': 'es-LA',
  'es-419': 'es-LA',
  'es-MX': 'es-LA',
  'es-AR': 'es-LA',
  'es-CO': 'es-LA',
  'es-CL': 'es-LA',
  'es-PE': 'es-LA',
  fr: 'fr',
  'fr-FR': 'fr',
  'fr-CA': 'fr',
  ja: 'ja',
  ko: 'ko',
  'pt-BR': 'pt-BR',
  pt: 'pt-BR',
};

const loadedLocales = new Set<string>(['en']);

const resources = {
  en: { translation: en },
};

const SUPPORTED = new Set(Object.keys(localeAliasMap));

/**
 * Resolves the best locale from the device's ranked list.
 * Iterates the full getLocales() list so fallbacks (e.g. Thai → English → Japanese)
 * are respected when the primary language isn't supported.
 */
export function resolveLocale(locales: Locale[] = getLocales()): string {
  for (const locale of locales) {
    if (SUPPORTED.has(locale.languageTag)) return locale.languageTag;
    if (locale.languageCode && SUPPORTED.has(locale.languageCode)) return locale.languageCode;
  }
  return 'en';
}

const deviceLanguage = resolveLocale();

function normalizeLocale(locale: string): LocaleLoaderKey | 'en' {
  return localeAliasMap[locale] ?? 'en';
}

async function ensureLocaleLoaded(locale: string) {
  const normalizedLocale = normalizeLocale(locale);
  if (normalizedLocale === 'en') return;
  if (loadedLocales.has(locale) || loadedLocales.has(normalizedLocale)) return;

  const translation = (await localeLoaders[normalizedLocale]()).default;

  i18n.addResourceBundle(normalizedLocale, 'translation', translation, true, true);
  loadedLocales.add(normalizedLocale);

  if (locale !== normalizedLocale) {
    i18n.addResourceBundle(locale, 'translation', translation, true, true);
    loadedLocales.add(locale);
  }

  const baseLocale = locale.split('-')[0];
  if (!loadedLocales.has(baseLocale) && baseLocale !== 'en') {
    i18n.addResourceBundle(baseLocale, 'translation', translation, true, true);
    loadedLocales.add(baseLocale);
  }
}

/** Returns the date-fns locale for the current i18n language. Use for format(), formatDistanceToNow, etc. */
export function getDateFnsLocale(): import('date-fns').Locale | undefined {
  const lang = i18n.language?.split('-')[0] ?? 'en';
  return getDateFnsLocaleForLanguage(lang);
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  compatibilityJSON: 'v4',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

void (async () => {
  if (deviceLanguage === 'en') return;
  try {
    await ensureLocaleLoaded(deviceLanguage);
    await i18n.changeLanguage(deviceLanguage);
  } catch {
    await i18n.changeLanguage('en');
  }
})();

export default i18n;
