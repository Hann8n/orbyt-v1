/**
 * Writes: comments, video posts, delete post, mute comments (threadgate).
 * Lexicons: app.bsky.feed.post, app.bsky.feed.threadgate, com.atproto.repo.*
 */
import { RichText, AtUri } from '@atproto/api';
import { BlobRef } from '@atproto/api';
import { Platform } from 'react-native';
import { AtprotoCore } from '../core';
import { logger } from '../../../utils/logger';
import type { PostRecord, CreateRecordResponse } from '../types';
import { normalizeExternalEmbedThumbSource } from './feedShared';

export async function postComment(
  text: string,
  rootUri: string,
  rootCid: string,
  parentUri?: string,
  parentCid?: string,
  images?: { uri: string; alt: string; aspectRatio?: { width: number; height: number } }[],
  externalEmbed?: { uri: string; title?: string; description?: string; thumb?: string }
): Promise<{ uri: string; cid: string }> {
  await AtprotoCore.ensureSession();
  const { api } = await AtprotoCore.getApiClient();

  // If no parent is specified, reply directly to the post (parent = root)
  const actualParentUri = parentUri || rootUri;
  const actualParentCid = parentCid || rootCid;

  // Use official RichText API to detect facets
  const richText = new RichText({ text: text || '' });
  await richText.detectFacets(api);

  const postRecord: PostRecord = {
    $type: 'app.bsky.feed.post',
    text: richText.text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: rootUri, cid: rootCid },
      parent: { uri: actualParentUri, cid: actualParentCid },
    },
  };

  // Add facets if they exist (from RichText API)
  if (richText.facets && richText.facets.length > 0) {
    postRecord.facets = richText.facets;
  }

  // Add images if provided
  if (externalEmbed?.uri) {
    let uploadedThumb: BlobRef | undefined;
    const thumbSource = normalizeExternalEmbedThumbSource(externalEmbed.thumb);
    if (thumbSource) {
      try {
        const thumbRes = await fetch(thumbSource);
        if (!thumbRes.ok) {
          throw new Error(`Thumb fetch failed: ${thumbRes.status}`);
        }
        const blob = await thumbRes.blob();
        const fromBlob = typeof blob?.type === 'string' ? blob.type : '';
        const encoding =
          fromBlob && fromBlob.startsWith('image/')
            ? fromBlob
            : (() => {
                const clean = thumbSource.split('?')[0].toLowerCase();
                if (clean.endsWith('.webp')) return 'image/webp';
                if (clean.endsWith('.png')) return 'image/png';
                if (clean.endsWith('.gif')) return 'image/gif';
                if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
                return 'image/jpeg';
              })();
        const uploadResult = await api.uploadBlob(blob, { encoding });
        uploadedThumb = uploadResult.data.blob;
      } catch (err) {
        logger.error('External embed thumbnail fetch/upload failed', {
          rootUri,
          embedUri: externalEmbed.uri,
          thumbUrl: externalEmbed.thumb,
          err,
        });
        uploadedThumb = undefined;
      }
    }

    const externalPayload =
      uploadedThumb !== undefined
        ? {
            uri: externalEmbed.uri,
            title: externalEmbed.title ?? externalEmbed.uri,
            description: externalEmbed.description ?? '',
            thumb: uploadedThumb,
          }
        : {
            uri: externalEmbed.uri,
            title: externalEmbed.title ?? externalEmbed.uri,
            description: externalEmbed.description ?? '',
          };

    postRecord.embed = {
      $type: 'app.bsky.embed.external',
      external: externalPayload,
    } as PostRecord['embed'];
  } else if (images && images.length > 0) {
    const inferImageEncoding = (uri: string, blob: Blob): string => {
      const fromBlob = typeof blob?.type === 'string' ? blob.type.toLowerCase() : '';
      if (fromBlob === 'image/png') return 'image/png';
      if (fromBlob === 'image/webp') return 'image/webp';
      if (fromBlob === 'image/gif') return 'image/gif';
      if (fromBlob === 'image/jpeg' || fromBlob === 'image/jpg') return 'image/jpeg';

      const clean = uri.split('?')[0].toLowerCase();
      if (clean.endsWith('.png')) return 'image/png';
      if (clean.endsWith('.webp')) return 'image/webp';
      if (clean.endsWith('.gif')) return 'image/gif';
      if (clean.endsWith('.jpg') || clean.endsWith('.jpeg') || clean.endsWith('.heic')) {
        return 'image/jpeg';
      }
      return 'image/jpeg';
    };

    const MAX_IMAGE_BYTES = 1_000_000;

    // Upload each image and include the returned blob in app.bsky.embed.images
    const uploadedImages = await Promise.all(
      images.slice(0, 4).map(async img => {
        const response = await fetch(img.uri);
        if (!response.ok) {
          throw new Error(`Failed to read image before upload (${response.status})`);
        }

        const blob = await response.blob();
        if (blob.size > MAX_IMAGE_BYTES) {
          throw new Error(`Image exceeds 1,000,000 byte limit (${blob.size})`);
        }

        const uploadResult = await api.uploadBlob(blob, {
          encoding: inferImageEncoding(img.uri, blob),
        });

        return {
          image: uploadResult.data.blob,
          alt: img.alt ?? '',
          aspectRatio: img.aspectRatio,
        };
      })
    );

    postRecord.embed = {
      $type: 'app.bsky.embed.images',
      images: uploadedImages,
    };
  }

  const commentResponse = await api.post(postRecord);
  return commentResponse;
}

/**
 * Converts upload blob response to BlobRef format required by Bluesky API.
 * Handles both BlobRef instances (from video service) and blob objects (from uploadBlob).
 *
 * @param blob - Blob data, either:
 *               - BlobRef instance (from video service)
 *               - Blob object: `{ ref: { $link: string }, mimeType: string, size: number }`
 * @returns BlobRef compatible with app.bsky.embed.video structure
 */
function toBlobRef(
  blob: BlobRef | { ref: { $link: string }; mimeType: string; size: number }
): import('@atproto/lexicon').BlobRef {
  // If already a BlobRef instance (from video service), return as-is
  if (blob instanceof BlobRef) {
    return blob as unknown as import('@atproto/lexicon').BlobRef;
  }
  // Otherwise cast the blob object format
  return blob as unknown as import('@atproto/lexicon').BlobRef;
}

/**
 * Create a new post with video content using Bluesky's video service
 * @param text - The post text
 * @param videoPath - Path to the video file
 * @param contentWarnings - Optional content warnings
 * @param commentFilter - Comment filtering settings
 * @param feedSlug - Optional feed slug for tagging
 * @returns The response from creating the post
 */
export async function createVideoPost(
  text: string,
  videoPath: string,
  contentWarnings?: string[],
  commentFilter?: 'all' | 'followers' | 'mentioned' | 'none',
  feedSlug?: string,
  onProgress?: (progress: number) => void,
  jobId?: string,
  videoBlob?: BlobRef
): Promise<CreateRecordResponse> {
  await AtprotoCore.ensureSession();

  // Check email confirmation before allowing video post
  // Use userStore as source of truth (uses API field name directly: emailConfirmed)
  try {
    const { useUserStore } = await import('../../../stores/userStore');
    const currentUser = useUserStore.getState().currentUser;

    // Block if emailConfirmed is explicitly false (has email but not confirmed)
    // Allow if true (confirmed) or undefined (no email scope)
    // Use API field name directly: emailConfirmed
    if (currentUser?.emailConfirmed === false) {
      throw new Error(
        'Email verification required. Please verify your email address before posting videos.'
      );
    }
    // Allow access if emailConfirmed is true or undefined
  } catch (error) {
    // Re-throw verification errors
    if (error instanceof Error && error.message.includes('Email verification required')) {
      throw error;
    }
    // Log and continue on import errors (don't block on service errors)
    logger.warn('Failed to check email confirmation status', {
      component: 'AtprotoFeedService',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

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

    // Get video aspect ratio
    const aspectRatio = await getVideoAspectRatio(videoPath);

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

    // Build tags array
    const tags: string[] = [platformTag];
    if (feedSlug) {
      tags.push(`orbyt-channel-${feedSlug}`);
    }

    const postRecord: PostRecord = {
      $type: 'app.bsky.feed.post',
      text: richText.text,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.video',
        video: toBlobRef(processedVideoBlob),
        aspectRatio,
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

    const postResponse = await api.post(postRecord);

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
 * Get video aspect ratio from video file
 * @param _videoPath - Path to the video file
 * @returns Aspect ratio object with width and height
 */
async function getVideoAspectRatio(_videoPath: string): Promise<{ width: number; height: number }> {
  // For React Native, we'll use a default aspect ratio
  // In a real implementation, you might want to use a video metadata library
  return { width: 9, height: 16 }; // Default to 9:16 (portrait)
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
    const userDid = await AtprotoCore.getCurrentUserDid();
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
  try {
    await AtprotoCore.ensureSession();

    // Extract the record key (rkey) from the URI
    // URI format: at://did:plc:xxxx/app.bsky.feed.post/rkey
    const parts = uri.split('/');
    if (parts.length < 4) {
      throw new Error('Invalid post URI format');
    }

    const did = parts[2];
    const rkey = parts[4];

    // Get the current user's DID to ensure they own the post
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) {
      throw new Error('No authenticated user found');
    }

    // Ensure the user owns the post
    if (did !== userDid) {
      throw new Error('Cannot delete a post that you do not own');
    }

    // Delete the post
    const { api } = await AtprotoCore.getApiClient();

    await api.app.bsky.feed.post.delete({
      repo: userDid,
      rkey: rkey,
    });

    return true;
  } catch (_error: unknown) {
    return false;
  }
}

/**
 * Mute a post's comments (as a workaround using threadgate rules)
 * This essentially creates a threadgate that doesn't allow any comments
 * @param postUri - URI of the post to mute comments for
 * @returns A boolean indicating success
 */
export async function mutePostComments(postUri: string): Promise<boolean> {
  try {
    await AtprotoCore.ensureSession();
    // Extract the record key (rkey) from the URI
    const parts = postUri.split('/');
    if (parts.length < 4) {
      throw new Error('Invalid post URI format');
    }

    const did = parts[2];
    const rkey = parts[4];

    // Get the current user's DID to ensure they own the post
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) {
      throw new Error('No authenticated user found');
    }

    // Ensure the user owns the post
    if (did !== userDid) {
      throw new Error('Cannot mute comments on a post that you do not own');
    }

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
      rkey: rkey,
      record,
    });

    return true;
  } catch (_error: unknown) {
    return false;
  }
}
