import { appPathForSystemLink } from '@/utils/navigation/systemLinks';

/**
 * Rewrites incoming system links before Expo Router matches them: getorbyt.com universal links
 * become app routes (see `appPathForSystemLink`), custom-scheme links pass through unchanged.
 *
 * The sign-in return link (`https://getorbyt.com/oauth/callback`) is consumed by the auth session;
 * when it also reaches the app as a link it must not navigate, or the user lands on a stray screen
 * after signing in.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    const target = appPathForSystemLink(path);
    // A cold start can only open the app's root; a warm link should not navigate at all.
    if (target === null) return initial ? '/' : null;
    return target;
  } catch {
    return initial ? '/' : null;
  }
}
