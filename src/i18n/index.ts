import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ptBR from './locales/pt-BR.json';
import { getDateFnsLocaleForLanguage } from './dateFnsLocales';

const resources = {
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  'fr-FR': { translation: fr },
  'fr-CA': { translation: fr },
  ja: { translation: ja },
  ko: { translation: ko },
  'pt-BR': { translation: ptBR },
  pt: { translation: ptBR },
};
const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';

/** Returns the date-fns locale for the current i18n language. Use for format(), formatDistanceToNow, etc. */
export function getDateFnsLocale(): import('date-fns').Locale | undefined {
  const lang = i18n.language?.split('-')[0] ?? 'en';
  return getDateFnsLocaleForLanguage(lang);
}

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage,
  fallbackLng: 'en',
  compatibilityJSON: 'v4',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
