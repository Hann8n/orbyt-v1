import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';
import ptBR from './locales/pt-BR.json';
import { getDateFnsLocaleForLanguage } from './dateFnsLocales';

const resources = {
  en: { translation: en },
  es: { translation: es },
  ja: { translation: ja },
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
