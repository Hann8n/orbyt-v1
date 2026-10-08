import { Redirect } from 'expo-router';

/**
 * The gateway's sign-in return link. The auth session reads the code from the
 * URL; when the link also opens the app (Android App Links), just leave this route.
 */
export default function OAuthCallback() {
  return <Redirect href="/" />;
}
