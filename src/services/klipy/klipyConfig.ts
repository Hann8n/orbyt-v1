import { getLocales } from 'expo-localization';

import { KlipyService } from './KlipyService';

const KLIPY_BASE_URL = 'https://api.klipy.com';
const KLIPY_APP_KEY =
  ((typeof process !== 'undefined' &&
    (process as { env?: Record<string, string> }).env?.EXPO_PUBLIC_KLIPY_APP_KEY) as
    | string
    | undefined) || 'mxu0qQJj0SZVNXlwUEecUkT5K0zYwBRHLkXWsFOytxzi1JU0S11VpEZiJZ0AIun6';

let klipyInstance: KlipyService | null = null;

export function getKlipyService(): KlipyService {
  if (!klipyInstance) {
    klipyInstance = new KlipyService({ baseUrl: KLIPY_BASE_URL, appKey: KLIPY_APP_KEY });
  }
  return klipyInstance;
}

/** Device locale in xx_YY format for Klipy API (docs.klipy.com). */
export function getKlipyLocale(): string {
  const tag = getLocales()[0]?.languageTag;
  if (!tag) return 'en_US';
  return tag.replace(/-/g, '_');
}
