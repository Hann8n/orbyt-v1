import { Redirect } from 'expo-router';

import { selectIsSessionValid, useUserStore } from '@/stores/userStore';

/** Unknown or malformed deep links go to the app's start screen instead of a developer page. */
export default function NotFoundRedirect() {
  const isAuthenticated = useUserStore(selectIsSessionValid);
  return <Redirect href={isAuthenticated ? '/(tabs)/home' : '/login'} />;
}
