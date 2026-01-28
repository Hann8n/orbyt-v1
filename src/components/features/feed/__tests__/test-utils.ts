import type { ExtendedFeedViewPost } from '../../../services/api/types';

/**
 * Simple helper to create mock feed data for performance tests
 * Only creates minimal data needed for rendering
 */
export function createMockFeed(count: number): ExtendedFeedViewPost[] {
  return Array.from({ length: count }, (_, i) => ({
    post: {
      uri: `at://did:plc:test/app.bsky.feed.post/post-${i}`,
      cid: `cid-${i}`,
      author: {
        did: `did:plc:test-${i}`,
        handle: `testuser${i}.bsky.social`,
        displayName: `Test User ${i}`,
        avatar: null,
      },
      record: {
        text: `Test post ${i}`,
        createdAt: new Date().toISOString(),
      },
      embed: {
        $type: 'app.bsky.embed.video',
        video: {
          ref: {
            $link: `video-ref-${i}`,
          },
          mimeType: 'video/mp4',
          size: 1000000,
        },
        thumbnail: {
          ref: {
            $link: `thumb-ref-${i}`,
          },
          mimeType: 'image/jpeg',
          size: 50000,
        },
        aspectRatio: {
          width: 9,
          height: 16,
        },
      },
      indexedAt: new Date().toISOString(),
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      viewer: {},
    },
    contentListUI: null,
    contentMediaUI: null,
  }));
}
