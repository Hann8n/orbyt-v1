import i18n from './index';

export type TranslationMap = Record<string, string> | null | undefined;

function normalizeLocaleTag(locale: string): string {
  return locale.replace(/_/g, '-').trim();
}

function getLocaleCandidates(locale: string): string[] {
  const normalizedLocale = normalizeLocaleTag(locale);
  const baseLanguage = normalizedLocale.split('-')[0];

  if (!baseLanguage || baseLanguage === normalizedLocale) {
    return [normalizedLocale];
  }

  return [normalizedLocale, baseLanguage];
}

/**
 * Resolve localized API text with exact locale -> base language -> fallback value.
 */
export function resolveLocalizedText(
  fallbackValue: string | null | undefined,
  translations?: TranslationMap,
  locale?: string
): string | null {
  if (!translations || Object.keys(translations).length === 0) {
    return fallbackValue ?? null;
  }

  const activeLocale = locale || i18n.resolvedLanguage || i18n.language || 'en';
  const candidates = getLocaleCandidates(activeLocale);

  for (const candidate of candidates) {
    const value = translations[candidate];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return fallbackValue ?? null;
}

export function getCurrentLocaleTag(): string {
  return normalizeLocaleTag(i18n.resolvedLanguage || i18n.language || 'en');
}
