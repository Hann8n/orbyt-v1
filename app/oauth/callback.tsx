import { Redirect } from 'expo-router';

/**
 * OAuth callback route handler
 *
 * This route handles the OAuth callback from Bluesky authentication.
 * The @atproto/oauth-client-expo package processes the deep link automatically,
 * but on Android, Expo Router tries to navigate to this route first, causing
 * an "unmatched route" error.
 *
 * This route simply redirects to home - the OAuth client handles the actual
 * callback processing via deep linking before this route is reached.
 */
export default function OAuthCallback() {
  // Redirect to home - the OAuth client handles the callback via deep linking
  return <Redirect href="/(tabs)" />;
}
