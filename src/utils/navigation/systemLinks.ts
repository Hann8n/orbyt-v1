import { isValidDid, isValidHandle, isValidRecordKey } from '@atproto/syntax';

/**
 * Maps a link the system hands the app (`+native-intent`) to the Expo Router path it opens.
 *
 * getorbyt.com links are the ones the site's apple-app-site-association claims (orbyt-platform
 * `apps/site`), in the shapes its `public-links.ts` writes:
 *
 * - `/@<actor>` — a profile (handle or DID)
 * - `/@<actor>/<rkey>`, and the older `/@<actor>/post/<rkey>` — a video post
 * - `/c/<name>` — a Community, by its lowercase name
 * - `/oauth/callback` — the gateway sign-in return, read by the auth session
 *
 * Custom-scheme links (`com.getorbyt://…`) and any getorbyt.com path not listed above are returned
 * unchanged: Expo Router matches the former against `app/`, and an unknown path lands on
 * `+not-found`, which goes home.
 *
 * Returns `null` for the sign-in return link, which must not navigate anywhere.
 */
export function appPathForSystemLink(link: string): string | null {
  if (OAUTH_CALLBACK.test(link)) return null;

  const web = WEB_LINK.exec(link);
  if (!web) return link;

  const segments = (web[1] ?? '')
    .split('/')
    .filter(Boolean)
    .map(segment => safeDecode(segment));
  if (segments.some(segment => segment === null)) return link;

  return pathForWebSegments(segments as string[]) ?? link;
}

const OAUTH_CALLBACK = /^[^?#]*\/oauth\/callback\/?(?:[?#]|$)/;
const WEB_LINK = /^https:\/\/getorbyt\.com(?::443)?(\/[^?#]*)?(?:[?#].*)?$/i;

const POST_COLLECTION = 'app.bsky.feed.post';
// `com.getorbyt.community.getCommunity` `name`: 2 to 63 characters, stored lowercase.
const COMMUNITY_NAME = /^[^/]{2,63}$/;

function pathForWebSegments(segments: string[]): string | null {
  const [first, ...rest] = segments;
  if (!first) return null;

  if (first.startsWith('@')) {
    const actor = first.slice(1);
    if (!isValidDid(actor) && !isValidHandle(actor)) return null;
    if (rest.length === 0) return `/home/user/${encodeURIComponent(actor)}`;

    const rkey = rest.length === 2 && rest[0] === 'post' ? rest[1] : rest.join('/');
    if (!isValidRecordKey(rkey)) return null;
    const postUri = `at://${actor}/${POST_COLLECTION}/${rkey}`;
    return `/home/full-height-video?postUri=${encodeURIComponent(postUri)}`;
  }

  if (first === 'c' && rest.length === 1) {
    const name = rest[0].toLowerCase();
    if (!COMMUNITY_NAME.test(name)) return null;
    return `/c/${encodeURIComponent(name)}`;
  }

  return null;
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
