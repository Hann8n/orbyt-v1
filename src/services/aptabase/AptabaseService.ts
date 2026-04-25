import * as Application from 'expo-application';
import Aptabase, { trackEvent } from '@aptabase/react-native';

const APTABASE_APP_KEY = 'A-US-7117173342';
const appVersion =
  Application.nativeApplicationVersion ?? Application.applicationVersion ?? 'unknown';

let hasInitialized = false;

export const initializeAptabase = () => {
  if (hasInitialized) {
    return;
  }

  hasInitialized = true;

  Aptabase.init(APTABASE_APP_KEY, {
    appVersion,
  });

  trackEvent('app_started', {
    appVersion,
  });
};

export const trackAptabaseEvent = (
  eventName: string,
  properties?: Record<string, string | number>
) => {
  trackEvent(eventName, properties);
};

export const disposeAptabase = () => {
  if (!hasInitialized) {
    return;
  }

  Aptabase.dispose();
  hasInitialized = false;
};
