/**
 * Writes: comments, video posts, delete post, mute comments (threadgate).
 * Lexicons: app.bsky.feed.post, app.bsky.feed.threadgate, com.atproto.repo.*
 */
import { RichText, AtUri, BlobRef } from '@atproto/api';
import { Platform } from 'react-native';
import { AtprotoCore } from '../core';
import { logger } from '../../../utils/logger';
import {
  COMMUNITY_POST_COLLECTION,
  nextRecordKey,
  requestCommunitySync,
} from '../../orbyt/communities';
import type { PostRecord, CreateRecordResponse } from '../types';

/**
 * Create a new post with video content using Bluesky's video service
 * @param text - The post text
 * @param videoPath - Path to the video file
 * @param contentWarnings - Optional content warnings
 * @param commentFilter - Comment filtering settings
 * @param communityUri - Optional Orbyt Community to publish into (written as a
 *   `com.getorbyt.community.post` link sharing the post's record key)
 * @returns The response from creating the post
 */
export async function createVideoPost(
  text: string,
  videoPath: string,
  contentWarnings?: string[],
  commentFilter?: 'all' | 'followers' | 'mentioned' | 'none',
  communityUri?: string,
  onProgress?: (progress: number) => void,
  jobId?: string,
  videoBlob?: BlobRef,
  aspectRatio?: { width: number; height: number }
): Promise<CreateRecordResponse> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: createVideoPost');
    }
    const stamp = Date.now();
    if (onProgress) {
      onProgress(100);
    }
    return {
      uri: `at://did:plc:offline-debug/app.bsky.feed.post/mock-video-${stamp}`,
      cid: `offline-video-cid-${stamp}`,
    };
  }

  const session = await AtprotoCore.ensureSession();

  try {
    // Validate video file
    if (!videoPath || !videoPath.startsWith('file://')) {
      throw new Error('Invalid video path');
    }

    const { api } = await AtprotoCore.getApiClient();
    const { VideoService } = await import('../video/VideoService');

    // Use Bluesky video service for upload and processing
    // If videoBlob is provided, use it directly (job was already waited for)
    // If jobId is provided without blob, job is being tracked - don't wait again
    // Otherwise, upload and wait for processing
    let processedVideoBlob: BlobRef;
    if (videoBlob) {
      // Blob already available - no need to wait
      processedVideoBlob = videoBlob;
    } else if (jobId) {
      // Job ID provided but no blob - job is being tracked elsewhere
      // This should not happen in normal flow, but handle it gracefully
      processedVideoBlob = await VideoService.waitForJob(jobId);
    } else {
      // No jobId or blob - full upload and wait flow
      processedVideoBlob = await VideoService.uploadVideoAndWait(videoPath, onProgress);
    }

    const resolvedAspectRatio = aspectRatio ?? { width: 9, height: 16 };

    // Use official RichText API to detect facets
    const richText = new RichText({ text: text || '' });
    await richText.detectFacets(api);

    // Determine platform tag
    let platformTag: string;
    if (Platform.OS === 'ios') {
      platformTag = 'orbyt-ios';
    } else if (Platform.OS === 'android') {
      platformTag = 'orbyt-android';
    } else if (Platform.OS === 'web') {
      platformTag = 'orbyt-web';
    } else {
      // Fallback for unknown platforms
      platformTag = 'orbyt-ios';
    }

    // Community membership is carried only by the com.getorbyt.community.post
    // link below; the AppView no longer reads `orbyt-channel-*` tags.
    const tags: string[] = [platformTag];

    const postRecord: PostRecord = {
      $type: 'app.bsky.feed.post',
      text: richText.text,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.video',
        video: processedVideoBlob,
        aspectRatio: resolvedAspectRatio,
      },
      tags: tags,
      facets: richText.facets && richText.facets.length > 0 ? richText.facets : undefined,
    };

    // Add content warnings if provided
    // Map UI labels to valid Bluesky self-label values
    // Only these values are valid for self-labeling: porn, sexual, nudity, graphic-media, !no-unauthenticated
    if (contentWarnings && contentWarnings.length > 0) {
      const validLabels = contentWarnings
        .map(warning => {
          // Remove 'other:' prefix if present (custom warnings aren't valid for self-labeling)
          const cleanWarning = warning.startsWith('other:') ? null : warning;
          if (!cleanWarning) return null;

          // Map UI label IDs to valid Bluesky self-label values
          const labelMap: Record<string, string> = {
            nsfw: 'porn',
            nudity: 'nudity',
            violence: 'graphic-media',
            sensitive: 'sexual',
          };

          const mappedLabel = labelMap[cleanWarning] || null;
          return mappedLabel;
        })
        .filter((label): label is string => label !== null);

      if (validLabels.length > 0) {
        // Self-labels should be an array of selfLabel objects
        // Each object has $type: 'com.atproto.label.defs#selfLabel' and val: string
        postRecord.labels = {
          $type: 'com.atproto.label.defs#selfLabels',
          values: validLabels.map(label => ({
            $type: 'com.atproto.label.defs#selfLabel',
            val: label,
          })),
        };
      }
    }

    // Create the post - report progress at 95% before creating
    if (onProgress) {
      onProgress(95);
    }

    const postResponse = await publishPost(api, session.did, postRecord, communityUri);

    // Set comment filtering if specified
    if (commentFilter && commentFilter !== 'all') {
      try {
        await setCommentFilter(postResponse.uri, commentFilter);
      } catch (_error) {
        // Comment filter is best-effort; ignore failures
      }
    }

    // Report completion
    if (onProgress) {
      onProgress(100);
    }

    return postResponse;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Video upload failed: ${errorMessage}`, { cause: error });
  }
}

/**
 * Set comment filter for a post using threadgate
 * @param postUri - URI of the post
 * @param filter - Filter type (followers, mentioned, none)
 */
async function setCommentFilter(
  postUri: string,
  filter: 'followers' | 'mentioned' | 'none'
): Promise<void> {
  try {
    // Extract the record key (rkey) from the URI using AtUri
    let rkey: string;
    try {
      const uri = new AtUri(postUri);
      rkey = uri.rkey;
      if (!rkey) {
        throw new Error('Could not extract rkey from URI');
      }
    } catch (uriError: unknown) {
      const errorMessage = uriError instanceof Error ? uriError.message : 'Could not parse URI';
      throw new Error(`Invalid post URI: ${errorMessage}`, { cause: uriError });
    }

    // Create threadgate record based on filter
    // According to Bluesky docs:
    // - followerRule: allows replies from users who follow you
    // - followingRule: allows replies from users you follow
    // - mentionRule: allows replies from users mentioned in the post
    let allow: Array<{ $type: string }> = [];

    switch (filter) {
      case 'followers':
        // "Only followers can comment" means users who follow you
        allow = [{ $type: 'app.bsky.feed.threadgate#followerRule' }];
        break;
      case 'mentioned':
        allow = [{ $type: 'app.bsky.feed.threadgate#mentionRule' }];
        break;
      case 'none':
        allow = []; // Empty array means no one can comment
        break;
    }

    const record = {
      $type: 'app.bsky.feed.threadgate',
      post: postUri,
      createdAt: new Date().toISOString(),
      allow,
    };

    const { api } = await AtprotoCore.getApiClient();
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) {
      throw new Error('No authenticated user');
    }

    await api.com.atproto.repo.createRecord({
      repo: userDid,
      collection: 'app.bsky.feed.threadgate',
      rkey: rkey,
      record,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(errorMessage, { cause: error });
  }
}

export async function deletePost(uri: string): Promise<boolean> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      return false;
    }
    return !!uri;
  }

  try {
    await AtprotoCore.ensureSession();

    const urip = new AtUri(uri);
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user found');
    if (urip.hostname !== userDid) throw new Error('Cannot delete a post that you do not own');

    const { api } = await AtprotoCore.getApiClient();
    await api.app.bsky.feed.post.delete({ repo: urip.hostname, rkey: urip.rkey });

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete post';
    throw new Error(errorMessage, { cause: error });
  }
}

/**
 * Mute a post's comments (as a workaround using threadgate rules)
 * This essentially creates a threadgate that doesn't allow any comments
 * @param postUri - URI of the post to mute comments for
 * @returns A boolean indicating success
 */
export async function mutePostComments(postUri: string): Promise<boolean> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      return false;
    }
    return !!postUri;
  }

  try {
    await AtprotoCore.ensureSession();
    const urip = new AtUri(postUri);
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user found');
    if (urip.hostname !== userDid)
      throw new Error('Cannot mute comments on a post that you do not own');

    // Create a threadgate with no allow rules (effectively muting all comments)
    const record = {
      $type: 'app.bsky.feed.threadgate',
      post: postUri,
      createdAt: new Date().toISOString(),
      allow: [], // Empty array means no one can comment
    };

    const { api } = await AtprotoCore.getApiClient();

    await api.com.atproto.repo.createRecord({
      repo: userDid,
      collection: 'app.bsky.feed.threadgate',
      rkey: urip.rkey,
      record,
    });

    return true;
  } catch (_error: unknown) {
    return false;
  }
}

/**
 * Write the post, and its Community link when one is chosen, in one
 * `applyWrites` transaction so a post is never published half-linked.
 */
async function publishPost(
  api: Awaited<ReturnType<typeof AtprotoCore.getApiClient>>['api'],
  did: string,
  postRecord: PostRecord,
  communityUri?: string
): Promise<CreateRecordResponse> {
  if (!communityUri) {
    return api.post(postRecord);
  }

  const rkey = nextRecordKey();
  const postUri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const { data } = await api.com.atproto.repo.applyWrites({
    repo: did,
    writes: [
      {
        $type: 'com.atproto.repo.applyWrites#create',
        collection: 'app.bsky.feed.post',
        rkey,
        value: postRecord,
      },
      {
        $type: 'com.atproto.repo.applyWrites#create',
        collection: COMMUNITY_POST_COLLECTION,
        rkey,
        value: {
          $type: COMMUNITY_POST_COLLECTION,
          community: communityUri,
          post: postUri,
          createdAt: postRecord.createdAt,
        },
      },
    ],
  });

  const created = data.results?.[0];
  const result: CreateRecordResponse = {
    uri: created && 'uri' in created ? created.uri : postUri,
    cid: created && 'cid' in created ? created.cid : '',
  };

  // Ingestion hint so the post shows in the Community without waiting for the
  // ingester; the records are already durable on the PDS.
  requestCommunitySync(api, [`at://${did}/${COMMUNITY_POST_COLLECTION}/${rkey}`]).catch(error => {
    logger.warn('Community sync request failed', {
      component: 'feedWrites',
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return result;
}
