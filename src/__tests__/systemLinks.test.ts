/**
 * getorbyt.com links the site's apple-app-site-association claims (`/@*`, `/c/*`,
 * `/oauth/callback`; orbyt-platform `apps/site`) must open the matching app route.
 */
import { appPathForSystemLink } from '@/utils/navigation/systemLinks';

const postHref = (uri: string) => `/home/full-height-video?postUri=${encodeURIComponent(uri)}`;

describe('appPathForSystemLink', () => {
  it.each([
    ['https://getorbyt.com/@alice.bsky.social', '/home/user/alice.bsky.social'],
    ['https://getorbyt.com/@alice.bsky.social/', '/home/user/alice.bsky.social'],
    ['https://GetOrbyt.com/@alice.bsky.social?ref=share', '/home/user/alice.bsky.social'],
    [
      'https://getorbyt.com/@did%3Aplc%3Aabc123',
      `/home/user/${encodeURIComponent('did:plc:abc123')}`,
    ],
    ['https://getorbyt.com/@did:plc:abc123', `/home/user/${encodeURIComponent('did:plc:abc123')}`],
  ])('opens the profile for %s', (link, expected) => {
    expect(appPathForSystemLink(link)).toBe(expected);
  });

  it.each([
    [
      'https://getorbyt.com/@alice.bsky.social/3mc3tjpupzo2i',
      postHref('at://alice.bsky.social/app.bsky.feed.post/3mc3tjpupzo2i'),
    ],
    [
      'https://getorbyt.com/@alice.bsky.social/post/3mc3tjpupzo2i',
      postHref('at://alice.bsky.social/app.bsky.feed.post/3mc3tjpupzo2i'),
    ],
    [
      'https://getorbyt.com/@did%3Aplc%3Aabc123/3mc3tjpupzo2i#t=1',
      postHref('at://did:plc:abc123/app.bsky.feed.post/3mc3tjpupzo2i'),
    ],
  ])('opens the video for %s', (link, expected) => {
    expect(appPathForSystemLink(link)).toBe(expected);
  });

  it.each([
    ['https://getorbyt.com/c/skate', '/c/skate'],
    ['https://getorbyt.com/c/Skate', '/c/skate'],
    ['https://getorbyt.com/c/film%20club', `/c/${encodeURIComponent('film club')}`],
  ])('opens the Community for %s', (link, expected) => {
    expect(appPathForSystemLink(link)).toBe(expected);
  });

  it.each([
    'https://getorbyt.com/oauth/callback?code=one-time-code',
    'https://getorbyt.com/oauth/callback/?error=access_denied',
    'com.getorbyt:/oauth/callback?code=one-time-code',
  ])('does not navigate for the sign-in return %s', link => {
    expect(appPathForSystemLink(link)).toBeNull();
  });

  it.each([
    'com.getorbyt://channel/at%3A%2F%2Fdid%3Aplc%3Aabc%2Fcom.getorbyt.community.declaration%2F3k',
    'com.getorbyt://home/user/did:plc:abc123',
    'com.getorbyt://',
  ])('passes custom-scheme links through unchanged: %s', link => {
    expect(appPathForSystemLink(link)).toBe(link);
  });

  it.each([
    'https://getorbyt.com/',
    'https://getorbyt.com/privacy',
    'https://getorbyt.com/@not a handle',
    'https://getorbyt.com/@alice.bsky.social/a/b',
    'https://getorbyt.com/@alice.bsky.social/%E0%A4%A',
    'https://getorbyt.com/c/x',
    'https://getorbyt.com/c/skate/extra',
    'https://getorbyt.com/oauth/callbacks',
    'https://evil.example/@alice.bsky.social',
    'https://getorbyt.com.evil.example/@alice.bsky.social',
  ])('leaves %s for +not-found', link => {
    expect(appPathForSystemLink(link)).toBe(link);
  });
});
