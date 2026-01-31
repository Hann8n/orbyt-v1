import { View } from 'react-native';

/**
 * OAuth callback route handler
 *
 * This route handles the OAuth callback from Bluesky authentication.
 * The @atproto/oauth-client-expo package processes the deep link automatically.
 *
 * This route renders nothing - the OAuth client handles the actual callback
 * processing via deep linking, and Stack.Protected automatically navigates
 * to the appropriate screen once the session is established.
 */
export default function OAuthCallback() {
  // Render nothing - OAuth client processes the callback via deep linking
  // Stack.Protected handles navigation once session is set
  return <View />;
}
