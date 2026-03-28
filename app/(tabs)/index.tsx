import { Redirect } from 'expo-router';

/**
 * Legacy `(tabs)/index` segment: home tab folder was renamed to `home` so the stack root `index`
 * would not duplicate the tab name. Deep links, `router.replace('/(tabs)')`, and persisted state
 * may still resolve to `index`; redirect keeps those paths valid.
 */
export default function LegacyTabsIndexRedirect() {
  return <Redirect href="/(tabs)/home" />;
}
