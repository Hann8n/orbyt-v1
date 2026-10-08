import { Redirect } from 'expo-router';

/**
 * The gateway's sign-in return link. The auth session reads the code from the
 * URL; when the universal link also opens the app, just leave this route.
 */
export default function OAuthCallback() {
  return <Redirect href="/" />;
}
