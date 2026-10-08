const OAUTH_CALLBACK_PATH = /^[^?#]*\/oauth\/callback/;

/**
 * Rewrites incoming system links before Expo Router matches them.
 *
 * The OAuth redirect (`com.getorbyt:/oauth/callback`) is consumed by the auth session, but on
 * Android it also reaches the app as a link; there is no route for it, so without this the user
 * lands on the "Unmatched Route" screen after signing in.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    if (OAUTH_CALLBACK_PATH.test(path)) {
      // A cold start can only open the app's root; a warm link should not navigate at all.
      return initial ? '/' : null;
    }
    return path;
  } catch {
    return initial ? '/' : null;
  }
}
