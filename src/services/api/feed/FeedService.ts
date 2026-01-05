/**
 * Feed Service - app.bsky.feed.* namespace operations
 * Handles all feed-related API operations including posts, likes, reposts, comments, and feed generation
 */

import { RichText, AtUri } from '@atproto/api';
import { Platform } from 'react-native';
import { logger } from '../../../utils/logger';
import { storageHelpers } from '../../../utils/storage';
import { AtprotoCore } from '../core';
import type {
  FeedResponse,
  FeedParams,
  FeedType,
  AuthorFilter,
  ExtendedFeedViewPost,
  ExtendedPostView,
  FeedViewPost,
  PostView,
  ThreadPost,
  NotFoundPost,
  BlockedPost,
  Comment,
  CommentsResponse,
  LikesResponse,
  Like,
  PostRecord,
  FeedGeneratorResponse,
  FeedGeneratorOutput,
  VideoSearchResponse,
  GetAuthorFeedOutput,
  GetFeedOutput,
  GetActorLikesOutput,
  RepostView,
  GeneratorView,
  CreateRecordResponse,
} from '../types';
import {
  isThreadViewPost,
  isNotFoundPost as checkIsNotFoundPost,
  isBlockedPost as checkIsBlockedPost,
  isVideoEmbed,
  isVideoEmbedInMedia,
} from '../types';

export class FeedService {
  /**
   * Get feed content - optimized for video-only feeds with maximum batch loading
   * 
   * @param cursor - Pagination cursor
   * @param feedLink - Link to the feed
   * @param _feedVariables - Additional parameters
   * @param filterVideosOnly - Whether to filter only video posts at API level
   * @param limit - Number of posts to fetch
   * @param feedType - Type of feed (author, likes, custom)
   * @returns Promise with feed data
   */
  static async getFeed(
    cursor: string | null = null,
    feedLink: string | null = null,
    _feedVariables: FeedParams = {},
    filterVideosOnly: boolean = true,
    limit: number = 100,
    feedType?: FeedType
  ): Promise<FeedResponse> {
    let retries = 3;
    
    while (retries > 0) {
      try {
        const apiClient = await AtprotoCore.getApiClient();
        
        // Handle case where no session is available
        if (!apiClient) {
          return { feed: [], cursor: null };
        }
        
        const { api } = apiClient;

        let responseData: GetAuthorFeedOutput | GetFeedOutput | GetActorLikesOutput;
        
        // Unified feed handling based on feedType
        if (feedType === 'author' || feedType === 'authorVideos') {
          // Author feed - use author filter
          const authorFilter = feedType === 'authorVideos' ? 'posts_with_video' : 'posts_with_media';
          try {
            const params = {
              actor: feedLink || '',
              limit: limit,
              cursor: cursor || undefined,
              filter: authorFilter as AuthorFilter,
            };
            
            const apiResponse = await api.app.bsky.feed.getAuthorFeed(params);
            responseData = apiResponse.data;
          } catch (authorError: unknown) {
            logger.error('Author feed error', authorError, { component: 'FeedService' });
            return { feed: [], cursor: null };
          }
        } else if (feedType === 'likes') {
          // Liked posts feed
          try {
            const params = {
              actor: feedLink || '',
              limit: limit,
              cursor: cursor || undefined,
            };
            
            const apiResponse = await api.app.bsky.feed.getActorLikes(params);
            responseData = apiResponse.data;
          } catch (likesError: unknown) {
            logger.error('Likes feed error', likesError, { component: 'FeedService' });
            return { feed: [], cursor: null };
          }
        } else {
          // Custom feed handling
          let feed = feedLink || '';
          
          // Handle both ATProto URI format and direct URLs
          if (feed && feed.includes('/profile/')) {
            // Convert from URL format to AT protocol URI if needed
            const parts = feed.split('/profile/');
            if (parts.length > 1) {
              const didAndFeed = parts[1].split('/feed/');
              if (didAndFeed.length > 1) {
                feed = `at://did:plc:${didAndFeed[0]}/app.bsky.feed.generator/${didAndFeed[1]}`;
              }
            }
          }
          
          // Validate feed URI format before making the request
          if (!feed) {
            logger.warn('No feed specified, returning empty feed', { component: 'FeedService' });
            return { feed: [], cursor: null };
          }
          
          // Validate AT-URI format
          if (!feed.startsWith('at://') && !feed.startsWith('did:')) {
            logger.warn(`Invalid feed URI format: ${feed}`, { component: 'FeedService' });
            return { feed: [], cursor: null };
          }
          
          const params = { 
            feed, 
            limit: limit,
            cursor: cursor || undefined,
          };
          
          try {
            const apiResponse = await api.app.bsky.feed.getFeed(params);
            responseData = apiResponse.data;
          } catch (customFeedError: unknown) {
            logger.error('Custom feed error', customFeedError, { component: 'FeedService' });
            // Check if it's a feed validation error
            if (customFeedError instanceof Error && customFeedError.message.includes('feed must be a valid at-uri')) {
              logger.warn(`Invalid feed URI: ${feed}`, { component: 'FeedService' });
              return { feed: [], cursor: null };
            }
            return { feed: [], cursor: null };
          }
        }
        
        // Ensure the response has the expected data structure
        if (!responseData || !responseData.feed) {
          logger.warn('Unexpected feed response format', { component: 'FeedService' });
          return { feed: [], cursor: null };
        }

        let feedData: ExtendedFeedViewPost[] = responseData.feed.map((post: FeedViewPost) => ({
          ...post,
          post: {
            ...post.post,
          } as ExtendedPostView,
        }));
        
        // Filter for video posts at API level if requested
        if (filterVideosOnly) {
          feedData = feedData.filter((post) => {
            const embed = post.post.embed;
            if (!embed) {
              return false;
            }
            
            // Only include posts with video embeds
            return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
          });
        }
        
        return { feed: feedData, cursor: responseData.cursor ?? null };
      } catch (error: unknown) {
        retries--;
        if (retries === 0) {
          return { feed: [], cursor: null };
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return { feed: [], cursor: null };
  }

  /**
   * Efficiently filter posts for video content - simplified and optimized
   */
  private static filterVideoPostsEfficiently(posts: FeedViewPost[]): ExtendedFeedViewPost[] {
    const videoPosts: ExtendedFeedViewPost[] = [];
    
    for (const item of posts) {
      const embed = item?.post?.embed;
      if (!embed) continue;
      
      // Only include posts where embed is of type 'app.bsky.embed.video' or 'app.bsky.embed.video#view'
      const hasVideo = isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
      
      if (hasVideo) {
        // Create extended post with repost information
        const reason = item.reason;
        const repostedBy = reason?.$type === 'app.bsky.feed.defs#reasonRepost' && 'by' in reason && reason.by ? {
          avatar: reason.by.avatar,
          displayName: reason.by.displayName,
          handle: reason.by.handle
        } : undefined;
        
        const extendedPost: ExtendedFeedViewPost = {
          ...item,
          post: {
            ...item.post,
            repostedBy,
          } as ExtendedPostView,
          uniqueKey: `${item.post.uri}_${videoPosts.length}`,
        };
        
        videoPosts.push(extendedPost);
      }
    }
    
    return videoPosts;
  }

  /**
   * Like a post and return the URI
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The URI of the created like
   */
  static async likePost(uri: string, cid: string): Promise<string> {
    const cacheKey = `like:${uri}:${cid}`;
    // Use dynamic import to avoid circular dependency
    const { AtprotoService } = await import('../AtprotoService');
    return AtprotoService.deduplicateRequest(cacheKey, async () => {
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) throw new Error('No authenticated user');
      
      const record = {
        $type: 'app.bsky.feed.like' as const,
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      };
      try {
        const { api } = await AtprotoCore.getApiClient();
        const response = await api.app.bsky.feed.like.create({ repo: userDid }, record);
        return response.uri;
      } catch (error: unknown) {
        throw error;
      }
    });
  }

  /**
   * Delete a like
   * @param likeUri - URI of the like to delete
   */
  static async deleteLike(likeUri: string): Promise<void> {
    await AtprotoCore.ensureSession();
    const { api } = await AtprotoCore.getApiClient();
    const parts = likeUri.split('/');
    const rkey = parts[parts.length - 1];
    await api.app.bsky.feed.like.delete({ repo: (await AtprotoCore.getCurrentUserDid())!, rkey });
  }

  /**
   * Repost a post and return the URI
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The URI of the created repost
   */
  static async repostPost(uri: string, cid: string): Promise<string> {
    const cacheKey = `repost:${uri}:${cid}`;
    // Use dynamic import to avoid circular dependency
    const { AtprotoService } = await import('../AtprotoService');
    return AtprotoService.deduplicateRequest(cacheKey, async () => {
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) throw new Error('No authenticated user');
      
      const record = {
        $type: 'app.bsky.feed.repost' as const,
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      };
      try {
        const { api } = await AtprotoCore.getApiClient();
        const response = await api.app.bsky.feed.repost.create({ repo: userDid }, record);
        return response.uri;
      } catch (error: unknown) {
        throw error;
      }
    });
  }

  /**
   * Delete a repost
   * @param repostURI - URI of the repost to delete
   */
  static async deleteRepost(repostURI: string): Promise<void> {
    const { api } = await AtprotoCore.getApiClient();
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');
    
    const parts = repostURI.split('/');
    const rkey = parts[parts.length - 1];
    await api.app.bsky.feed.repost.delete({ repo: userDid, rkey });
  }

  /**
   * Post a comment on a post or reply to another comment
   * @param text - The comment text
   * @param rootUri - The URI of the root post
   * @param rootCid - The CID of the root post
   * @param parentUri - The URI of the parent (post or comment) to reply to
   * @param parentCid - The CID of the parent to reply to
   * @param images - Optional images to attach
   * @returns The response from creating the comment
   */
  static async postComment(
    text: string, 
    rootUri: string, 
    rootCid: string,
    parentUri?: string,
    parentCid?: string,
    images?: { uri: string, alt: string, aspectRatio?: { width: number, height: number } }[]
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
    if (images && images.length > 0) {
      try {
        // Upload each image and get its blob reference
        const uploadedImages = await Promise.all(
          images.map(async (img) => {
            if (img.uri.startsWith('file://')) {
              const response = await fetch(img.uri);
              const blob = await response.blob();
              
              // Upload the blob to Bluesky
              const { api } = await AtprotoCore.getApiClient();
              const uploadResult = await api.uploadBlob(blob, {
                encoding: 'image/jpeg' // Default to JPEG, but ideally detect from the blob
              });
              
              return {
                image: uploadResult.data.blob,
                alt: img.alt || 'Image',
                aspectRatio: img.aspectRatio
              };
            } else {
              throw new Error('Unsupported image URI format');
            }
          })
        );
        
        // Add embed with images to post record
        postRecord.embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages
        };
      } catch (error) {
        // Continue without images if there was an error
      }
    }
    
    const commentResponse = await api.post(postRecord);
    return commentResponse;
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
  static async createVideoPost(
    text: string,
    videoPath: string,
    contentWarnings?: string[],
    commentFilter?: 'all' | 'followers' | 'mentioned' | 'none',
    feedSlug?: string
  ): Promise<CreateRecordResponse> {
    await AtprotoCore.ensureSession();
    
    try {
      logger.info('Starting video post creation', {
        component: 'FeedService',
        videoPath: videoPath?.substring(0, 50) + '...',
        textLength: text?.length || 0,
        contentWarnings,
        commentFilter,
        feedSlug
      });

      // Validate video file
      if (!videoPath || !videoPath.startsWith('file://')) {
        logger.error('Invalid video path', new Error('Invalid video path'), {
          component: 'FeedService',
          videoPath
        });
        throw new Error('Invalid video path');
      }

      logger.debug('Fetching video file', { component: 'FeedService' });
      // Upload video directly to PDS
      let videoBlob: Blob;
      try {
        const videoResponse = await fetch(videoPath);
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch video: ${videoResponse.status} ${videoResponse.statusText}`);
        }
        videoBlob = await videoResponse.blob();
        
        logger.info('Video blob created', {
          component: 'FeedService',
          blobSize: videoBlob.size,
          blobType: videoBlob.type,
          videoPath: videoPath.substring(0, 100) + '...'
        });
      } catch (fetchError: unknown) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        const errorStack = fetchError instanceof Error ? fetchError.stack : undefined;
        logger.error('Failed to fetch/create video blob', fetchError, {
          component: 'FeedService',
          videoPath: videoPath.substring(0, 100) + '...',
          errorMessage,
          errorStack
        });
        throw new Error(`Failed to create video blob: ${errorMessage}`);
      }
      
      const { api } = await AtprotoCore.getApiClient();
      logger.debug('Uploading video blob to PDS', {
        component: 'FeedService',
        blobSize: videoBlob.size,
        blobType: videoBlob.type
      });
      
      let blobData: { data: { blob: { ref: { $link: string }; mimeType: string; size: number } } };
      try {
        blobData = await api.com.atproto.repo.uploadBlob(videoBlob, {
          encoding: 'video/mp4'
        });
      } catch (uploadError: unknown) {
        const errorMessage = uploadError instanceof Error ? uploadError.message : 'Network request failed';
        const errorStack = uploadError instanceof Error ? uploadError.stack : undefined;
        const errorResponse = uploadError && typeof uploadError === 'object' && 'response' in uploadError ? uploadError.response : undefined;
        const errorData = uploadError && typeof uploadError === 'object' && 'data' in uploadError ? uploadError.data : undefined;
        const errorStatus = uploadError && typeof uploadError === 'object' && 'status' in uploadError ? uploadError.status : undefined;
        const errorStatusText = uploadError && typeof uploadError === 'object' && 'statusText' in uploadError ? uploadError.statusText : undefined;
        logger.error('Failed to upload video blob to PDS', uploadError, {
          component: 'FeedService',
          blobSize: videoBlob.size,
          blobType: videoBlob.type,
          errorMessage,
          errorStack,
          errorResponse,
          errorData,
          errorStatus,
          errorStatusText
        });
        throw new Error(`Failed to upload video blob: ${errorMessage}`);
      }
      
      const { data } = blobData;
      
      logger.info('Video blob uploaded successfully', {
        component: 'FeedService',
        blobRef: data.blob.ref?.$link,
        blobSize: data.blob.size,
        blobMimeType: data.blob.mimeType
      });
      
      // Get video aspect ratio
      logger.debug('Getting video aspect ratio', { component: 'FeedService' });
      const aspectRatio = await this.getVideoAspectRatio(videoPath);
      logger.debug('Video aspect ratio', { component: 'FeedService', aspectRatio });

      // Use official RichText API to detect facets
      logger.debug('Processing rich text', { component: 'FeedService' });
      const richText = new RichText({ text: text || '' });
      await richText.detectFacets(api);
      logger.debug('Rich text processed', {
        component: 'FeedService',
        facetsCount: richText.facets?.length || 0
      });

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

      // Create the post with video embed
      const postRecord: PostRecord = {
        $type: 'app.bsky.feed.post',
        text: richText.text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: 'app.bsky.embed.video',
          video: data.blob,
          aspectRatio
        },
        tags: tags,
        facets: richText.facets && richText.facets.length > 0 ? richText.facets : undefined,
      };

      // Add content warnings if provided
      // Map UI labels to valid Bluesky self-label values
      // Only these values are valid for self-labeling: porn, sexual, nudity, graphic-media, !no-unauthenticated
      if (contentWarnings && contentWarnings.length > 0) {
        logger.debug('Processing content warnings', {
          component: 'FeedService',
          inputWarnings: contentWarnings
        });
        
        const validLabels = contentWarnings
          .map(warning => {
            // Remove 'other:' prefix if present (custom warnings aren't valid for self-labeling)
            const cleanWarning = warning.startsWith('other:') ? null : warning;
            if (!cleanWarning) {
              logger.debug('Filtered out custom warning', {
                component: 'FeedService',
                warning
              });
              return null;
            }
            
            // Map UI label IDs to valid Bluesky self-label values
            const labelMap: Record<string, string> = {
              'nsfw': 'porn',
              'nudity': 'nudity',
              'violence': 'graphic-media',
              'sensitive': 'sexual'
            };
            
            const mappedLabel = labelMap[cleanWarning] || null;
            if (!mappedLabel) {
              logger.warn('Unknown content warning label', {
                component: 'FeedService',
                warning: cleanWarning
              });
            }
            
            return mappedLabel;
          })
          .filter((label): label is string => label !== null);
        
        logger.info('Content warnings mapped', {
          component: 'FeedService',
          inputWarnings: contentWarnings,
          validLabels
        });
        
        if (validLabels.length > 0) {
          // Self-labels should be an array of selfLabel objects
          // Each object has $type: 'com.atproto.label.defs#selfLabel' and val: string
          postRecord.labels = {
            $type: 'com.atproto.label.defs#selfLabels',
            values: validLabels.map(label => ({
              $type: 'com.atproto.label.defs#selfLabel',
              val: label
            }))
          };
          logger.debug('Self-labels added to post record', {
            component: 'FeedService',
            labels: postRecord.labels,
            validLabels
          });
        } else {
          logger.warn('No valid labels after mapping', {
            component: 'FeedService',
            inputWarnings: contentWarnings
          });
        }
      }

      logger.info('Post record prepared', {
        component: 'FeedService',
        recordType: postRecord.$type,
        hasText: !!postRecord.text,
        hasEmbed: !!postRecord.embed,
        hasLabels: !!postRecord.labels,
        labelsCount: postRecord.labels && '$type' in postRecord.labels && 'values' in postRecord.labels ? postRecord.labels.values.length : 0,
        tags: postRecord.tags
      });

      // Create the post
      logger.debug('Sending post to API', { component: 'FeedService' });
      const postResponse = await api.post(postRecord);
      logger.info('Post created successfully', {
        component: 'FeedService',
        uri: postResponse.uri,
        cid: postResponse.cid
      });

      // Set comment filtering if specified
      if (commentFilter && commentFilter !== 'all') {
        try {
          logger.debug('Setting comment filter', {
            component: 'FeedService',
            commentFilter
          });
          await this.setCommentFilter(postResponse.uri, commentFilter);
          logger.debug('Comment filter set successfully', { component: 'FeedService' });
        } catch (error) {
          logger.error('Failed to set comment filter', error, { component: 'FeedService' });
        }
      }

      return postResponse;
    } catch (error: unknown) {
      const errorDetails = {
        component: 'FeedService',
        videoPath: videoPath?.substring(0, 50) + '...',
        contentWarnings,
        commentFilter,
        feedSlug,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : undefined
      };

      // Log full error details
      if (error instanceof Error) {
        logger.error('Video upload failed', error, errorDetails);
      } else {
        logger.error('Video upload failed', new Error(String(error)), errorDetails);
      }

      // If it's an API error, try to extract more details
      if (error && typeof error === 'object' && 'response' in error) {
        const apiError = error as any;
        logger.error('API error details', new Error('API Error'), {
          component: 'FeedService',
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data,
          headers: apiError.response?.headers
        });
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Video upload failed: ${errorMessage}`);
    }
  }

  /**
   * Get video aspect ratio from video file
   * @param _videoPath - Path to the video file
   * @returns Aspect ratio object with width and height
   */
  private static async getVideoAspectRatio(_videoPath: string): Promise<{ width: number; height: number }> {
    try {
      // For React Native, we'll use a default aspect ratio
      // In a real implementation, you might want to use a video metadata library
      return { width: 9, height: 16 }; // Default to 9:16 (portrait)
    } catch (error) {
      return { width: 9, height: 16 };
    }
  }

  /**
   * Set comment filter for a post using threadgate
   * @param postUri - URI of the post
   * @param filter - Filter type (followers, mentioned, none)
   */
  private static async setCommentFilter(postUri: string, filter: 'followers' | 'mentioned' | 'none'): Promise<void> {
    try {
      logger.debug('Setting thread gate', {
        component: 'FeedService',
        postUri,
        filter
      });

      // Extract the record key (rkey) from the URI using AtUri
      let rkey: string;
      try {
        const uri = new AtUri(postUri);
        rkey = uri.rkey;
        if (!rkey) {
          throw new Error('Could not extract rkey from URI');
        }
      } catch (uriError: unknown) {
        logger.error('Failed to parse post URI', uriError, {
          component: 'FeedService',
          postUri
        });
        const errorMessage = uriError instanceof Error ? uriError.message : 'Could not parse URI';
        throw new Error(`Invalid post URI: ${errorMessage}`);
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
        allow
      };
      
      logger.debug('Thread gate record prepared', {
        component: 'FeedService',
        rkey,
        allowRules: allow.length,
        recordType: record.$type
      });
      
      const { api } = await AtprotoCore.getApiClient();
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user');
      }
      
      await api.com.atproto.repo.createRecord({
        repo: userDid,
        collection: 'app.bsky.feed.threadgate',
        rkey: rkey,
        record
      });
      
      logger.info('Thread gate created successfully', {
        component: 'FeedService',
        rkey,
        filter,
        allowRules: allow.length
      });
    } catch (error: unknown) {
      logger.error('Failed to set comment filter', error, {
        component: 'FeedService',
        postUri,
        filter,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get comments for a post with pagination support
   * @param postUri - The URI of the post
   * @param cursor - Pagination cursor
   * @param _limit - Number of comments per page (not used currently as API doesn't support it)
   * @returns Array of comments and next cursor
   */
  static async getComments(postUri: string, cursor: string | null = null, _limit: number = 25): Promise<CommentsResponse> {
    await AtprotoCore.ensureSession();
    try {
      // Use Bluesky threading parameters
      // depth: how many levels of replies to fetch (6 is standard for full threading)
      // parentHeight: how many parent levels to include (0 = only direct replies to root post)
      const params: { uri: string; depth: number; parentHeight: number; cursor?: string } = { 
        uri: postUri,
        depth: 6, // Fetch up to 6 levels of nested replies (Bluesky standard)
        parentHeight: 0 // Only get direct replies to the root post
      };
      if (cursor) params.cursor = cursor;
      
      const { api } = await AtprotoCore.getApiClient();
      
      // Use getPostThread (V2 may not be available in all SDK versions)
      // The threading structure is preserved through parent/replies relationships
      const response = await api.app.bsky.feed.getPostThread(params);
      
      // Log raw API response for debugging reply structure
      // This shows the actual API response structure before processing
      logger.debug('Raw API response for comments', {
        component: 'FeedService',
        action: 'getComments',
        postUri,
        rawResponse: JSON.stringify(response.data, null, 2),
      });
      
      
      // Function to recursively process thread posts with proper typing
      // Preserves Bluesky's threading structure with parent/child relationships
      const processThreadViewPost = (post: ThreadPost, parent: Comment | null = null): Comment | null => {
        if (!isThreadViewPost(post)) {
          return null;
        }

        const result: Comment = {
          uri: post.post.uri,
          cid: post.post.cid,
          author: post.post.author,
          record: post.post.record as PostRecord,
          indexedAt: post.post.indexedAt,
          viewer: post.post.viewer,
          likeCount: post.post.likeCount,
          replyCount: post.post.replyCount,
          replies: [],
          parent: parent || null // Preserve parent reference for threading
        };

        // Process replies if they exist, passing current post as parent
        if (post.replies && Array.isArray(post.replies)) {
          result.replies = (post.replies as ThreadPost[])
            .map((reply: ThreadPost) => {
              // Type guard to ensure it's a valid ThreadPost
              if (isThreadViewPost(reply)) return processThreadViewPost(reply, result);
              if (checkIsNotFoundPost(reply)) return null;
              if (checkIsBlockedPost(reply)) return null;
              return null;
            })
            .filter((reply): reply is Comment => reply !== null);
        }

        return result;
      };

      // Get the thread from response
      const thread = response.data.thread as ThreadPost;
      let comments: Comment[] = [];
      
      // Process replies at the root level (top-level comments have no parent)
      if (isThreadViewPost(thread) && thread.replies) {
        comments = (thread.replies as ThreadPost[])
          .map((reply: ThreadPost) => {
            // Type guard to ensure it's a valid ThreadPost
            if (isThreadViewPost(reply)) return processThreadViewPost(reply, null);
            if (checkIsNotFoundPost(reply)) return null;
            if (checkIsBlockedPost(reply)) return null;
            return null;
          })
          .filter((reply): reply is Comment => reply !== null);
      }

      return {
        comments,
        cursor: (response.data as { cursor?: string | null }).cursor ?? null
      };
    } catch (error: unknown) {
      return { comments: [], cursor: null };
    }
  }

  /**
   * Get likes for a post with pagination support
   * @param uri - Post URI
   * @param cursor - Pagination cursor
   * @param limit - Number of likes per page
   * @returns Array of likes and next cursor
   */
  static async getLikes(uri: string, cursor: string | null = null, limit: number = 25): Promise<LikesResponse> {
    await AtprotoCore.ensureSession();
    try {
      const params: { uri: string; limit: number; cursor?: string } = { uri, limit };
      if (cursor) params.cursor = cursor;
      
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.feed.getLikes(params);
      return { 
        likes: response.data.likes || [], 
        cursor: response.data.cursor || null 
      };
    } catch (error: unknown) {
      return { likes: [], cursor: null };
    }
  }

  /**
   * Get a single post by URI
   * @param uri - Post URI
   * @returns Post view or null
   */
  static async getPost(uri: string): Promise<PostView | null> {
    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.feed.getPostThread({
        uri: uri,
        depth: 0
      });
      
      const thread = response.data.thread as ThreadPost;
      if (isThreadViewPost(thread)) {
        return thread.post;
      }
      return null;
    } catch (error: unknown) {
      return null;
    }
  }

  /**
   * Batch fetch multiple posts by URI
   * Uses app.bsky.feed.getPosts which accepts up to 25 URIs at once
   * @param uris - Array of post URIs to fetch
   * @returns Map of URI to post data (includes NotFoundPost and BlockedPost objects)
   */
  static async getPosts(uris: string[]): Promise<Map<string, PostView | NotFoundPost | BlockedPost>> {
    const result = new Map<string, PostView | NotFoundPost | BlockedPost>();
    if (!uris.length) return result;

    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();
      
      // API accepts max 25 URIs per request
      const BATCH_SIZE = 25;
      const batches: string[][] = [];
      for (let i = 0; i < uris.length; i += BATCH_SIZE) {
        batches.push(uris.slice(i, i + BATCH_SIZE));
      }

      // Fetch all batches in parallel
      const responses = await Promise.all(
        batches.map(batch => 
          api.app.bsky.feed.getPosts({ uris: batch })
            .catch(() => ({ data: { posts: [] } }))
        )
      );

      // Collect all posts into the map (including NotFoundPost and BlockedPost)
      for (const response of responses) {
        for (const post of response.data.posts) {
          result.set(post.uri, post);
        }
      }

    } catch (error: unknown) {
    }

    return result;
  }

  /**
   * Delete a post
   * @param uri - Post URI to delete
   * @returns A boolean indicating whether the deletion was successful
   */
  static async deletePost(uri: string): Promise<boolean> {
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
        rkey: rkey
      });
      
      return true;
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Mute a post's comments (as a workaround using threadgate rules)
   * This essentially creates a threadgate that doesn't allow any comments
   * @param postUri - URI of the post to mute comments for
   * @returns A boolean indicating success
   */
  static async mutePostComments(postUri: string): Promise<boolean> {
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
        allow: [] // Empty array means no one can comment
      };
      
      const { api } = await AtprotoCore.getApiClient();
      
      await api.com.atproto.repo.createRecord({
        repo: userDid,
        collection: 'app.bsky.feed.threadgate',
        rkey: rkey,
        record
      });
      
      return true;
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Send video feedback to feed generators
   * @param postUri - URI of the post
   * @param type - Feedback type (interested or not_interested)
   * @param sourceFeed - Optional source feed URI
   * @param feedContext - Optional feed context
   */
  static async sendVideoFeedback(
    postUri: string, 
    type: 'interested' | 'not_interested', 
    sourceFeed?: string,
    feedContext?: string
  ): Promise<void> {
    try {
      await AtprotoCore.ensureSession();
      
      // Get the current user's DID from OAuth session
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }

      // Determine target feed for the interaction
      // Priority: 1. sourceFeed (if post came from an algorithmic feed)
      //           2. User's selected algorithmic feed provider
      //           3. null (no target, just store locally)
      let targetFeed: string | null = null;
      
      // Import algorithmic feed providers to check if sourceFeed is one of them
      const { ALGORITHMIC_FEED_PROVIDERS, useUserStore } = await import('../../../stores/userStore');
      const algorithmicFeedUris: string[] = Object.values(ALGORITHMIC_FEED_PROVIDERS).map(p => p.uri);
      
      if (sourceFeed && algorithmicFeedUris.includes(sourceFeed)) {
        // Post came from an algorithmic feed - route interaction to that feed
        targetFeed = sourceFeed;
      } else {
        // Fall back to user's selected algorithmic feed provider
        const { algorithmicFeedProvider } = useUserStore.getState();
        targetFeed = algorithmicFeedProvider;
      }

      // Store feedback in local storage for persistence/history
      const feedbackKey = `video_feedback_${postUri}`;
      const feedbackData = {
        postUri,
        type,
        timestamp: new Date().toISOString(),
        userDid: userDid,
        targetFeed: targetFeed,
      };
      await storageHelpers.setItem(feedbackKey, JSON.stringify(feedbackData));

      // If we have a target feed, send the interaction to Bluesky's API
      // This communicates the preference to the feed generator
      if (targetFeed) {
        const { api } = await AtprotoCore.getApiClient();
        
        // Map our feedback types to Bluesky's interaction events
        // app.bsky.feed.defs#requestMore = show more like this
        // app.bsky.feed.defs#requestLess = show less like this
        const event = type === 'interested' 
          ? 'app.bsky.feed.defs#requestMore' 
          : 'app.bsky.feed.defs#requestLess';
        
        // Build the interaction object
        const interaction: { item: string; event: string; feedContext?: string } = {
          item: postUri,
          event: event,
        };
        
        // Include feedContext if provided (helps feed generators track context)
        if (feedContext) {
          interaction.feedContext = feedContext;
        }
        
        // Send the interaction to the Bluesky API
        await api.app.bsky.feed.sendInteractions({
          interactions: [interaction],
        });
        
        logger.debug('Sent feed interaction', { 
          component: 'FeedService', 
          postUri, 
          event, 
          targetFeed 
        });
      }
      
    } catch (error: unknown) {
      // Log error but don't throw - interactions are best-effort
      logger.warn('Failed to send feed interaction', { 
        component: 'FeedService', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Get stored video feedback for a post
   */
  static async getVideoFeedback(postUri: string): Promise<{ type: 'interested' | 'not_interested'; timestamp: string; userDid: string } | null> {
    try {
      const feedbackKey = `video_feedback_${postUri}`;
      const feedbackStr = await storageHelpers.getItem(feedbackKey);
      
      if (feedbackStr) {
        const feedbackData = JSON.parse(feedbackStr);
        return feedbackData;
      }
      
      return null;
    } catch (error: unknown) {
      return null;
    }
  }

  /**
   * Remove stored video feedback for a post
   */
  static async removeVideoFeedback(postUri: string): Promise<void> {
    try {
      const feedbackKey = `video_feedback_${postUri}`;
      await storageHelpers.removeItem(feedbackKey);
    } catch (error: unknown) {
      throw error;
    }
  }

  /**
   * Get engagement data for a specific post
   * @param uri - Post URI
   * @returns Promise with engagement data
   */
  static async getPostEngagement(uri: string): Promise<{ likes: Like[]; reposts: RepostView[]; replies: Comment[] }> {
    try {
      const [likesResponse, commentsResponse] = await Promise.all([
        this.getLikes(uri, null, 100),
        this.getComments(uri, null, 100)
      ]);
      
      return {
        likes: likesResponse.likes,
        reposts: [], // Repost data not directly available via API
        replies: commentsResponse.comments
      };
    } catch (error: unknown) {
      return { likes: [], reposts: [], replies: [] };
    }
  }

  /**
   * Get feed generator details by URI
   * @param uri - Feed generator URI
   * @returns Feed generator details
   */
  static async getFeedGenerator(uri: string): Promise<FeedGeneratorOutput | null> {
    await AtprotoCore.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://')) {
        return null;
      }
      
      const params = { feed: uri };
      
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.feed.getFeedGenerator(params);
      
      return response.data as FeedGeneratorOutput;
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes('feed must be a valid at-uri')) {
      }
      return null;
    }
  }

  /**
   * Get subscriber count for a feed generator
   * @param uri - Feed generator URI
   * @returns Subscriber count (number of likes on the feed generator post)
   */
  static async getFeedGeneratorSubscriberCount(uri: string): Promise<number> {
    await AtprotoCore.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://') || !uri.includes('/app.bsky.feed.generator/')) {
        return 0;
      }
      
      // Get the feed generator details first
      const params = { feed: uri };
      
      const { api } = await AtprotoCore.getApiClient();
      const generatorResponse = await api.app.bsky.feed.getFeedGenerator(params);
      
      if (!generatorResponse.data?.view?.likeCount) {
        return 0;
      }
      
      return generatorResponse.data.view.likeCount;
    } catch (error: unknown) {
      return 0;
    }
  }

  /**
   * Get feed generator details by URI with pagination support
   * @param uri - Feed generator URI
   * @param cursor - Pagination cursor
   * @param _limit - Number of posts to fetch
   * @returns Feed generator details with posts
   */
  static async getFeedGeneratorWithPosts(uri: string, cursor: string | null = null, _limit: number = 50): Promise<FeedGeneratorResponse> {
    await AtprotoCore.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://') || !uri.includes('/app.bsky.feed.generator/')) {
        return { generator: null, posts: [], cursor: null };
      }
      
      // Get generator details
      const generatorParams = { feed: uri };
      
      const { api } = await AtprotoCore.getApiClient();
      const generatorResponse = await api.app.bsky.feed.getFeedGenerator(generatorParams);
      
      // Get feed posts
      const feedResponse = await this.getFeed(cursor, uri, {}, true);
      
      return {
        generator: generatorResponse.data,
        posts: feedResponse.feed,
        cursor: feedResponse.cursor
      };
    } catch (error: unknown) {
      return { generator: null, posts: [], cursor: null };
    }
  }

  /**
   * Search for video posts with hashtag support
   * @param hashtag - Hashtag to search for (without #)
   * @param cursor - Pagination cursor
   * @param limit - Number of results per page
   * @param sort - Sort order: 'top' for popular posts, 'latest' for most recent (default: 'latest')
   * @returns Array of video post results and next cursor
   */
  static async searchHashtagVideosPaginated(hashtag: string, cursor: string | null = null, limit: number = 20, sort: 'top' | 'latest' = 'latest'): Promise<VideoSearchResponse> {
    await AtprotoCore.ensureSession();
    try {
      // Search for posts with hashtag (include # in search query)
      const searchQuery = `#${hashtag}`;
      const { api } = await AtprotoCore.getApiClient();
      
      // Build search params - only include sort if it's 'top'
      const params: { q: string; limit: number; cursor?: string; sort?: 'top' | 'latest' } = {
        q: searchQuery,
        limit,
      };
      if (cursor) {
        params.cursor = cursor;
      }
      if (sort === 'top') {
        params.sort = 'top';
      }
      
      const response = await api.app.bsky.feed.searchPosts(params);
      
      const posts = response?.data?.posts || [];
      
      // Filter for video posts only and normalize structure
      const videoPosts = posts.filter((post: PostView) => {
        const embed = post.embed;
        if (!embed) return false;
        
        // Check for video embeds
        return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
      });
      
      // Normalize video structure for UI consumption
      const videos: ExtendedFeedViewPost[] = videoPosts.map((post: PostView) => ({
        post: {
          ...post,
        } as ExtendedPostView,
        uniqueKey: post.uri,
      }));
      
      return { 
        videos, 
        cursor: response?.data?.cursor ?? null 
      };
    } catch (error: unknown) {
      return { videos: [], cursor: null };
    }
  }

  /**
   * Search for hashtag suggestions
   * @param query - Search query (partial hashtag without #)
   * @param limit - Number of suggestions to return
   * @returns Array of unique hashtag suggestions
   */
  static async searchHashtagSuggestions(query: string = '', limit: number = 10): Promise<string[]> {
    await AtprotoCore.ensureSession();
    try {
      const { api } = await AtprotoCore.getApiClient();
      
      // Build search query
      // If query is empty, search for popular hashtags by searching common terms
      // If query exists, search for posts with that hashtag pattern
      let searchQuery: string;
      if (query) {
        searchQuery = `#${query}`;
      } else {
        // For empty query, search for popular terms that often have hashtags
        searchQuery = 'video OR art OR music OR photography';
      }
      
      const response = await api.app.bsky.feed.searchPosts({
        q: searchQuery,
        limit: 50, // Get more posts to extract more hashtags
      });
      
      const posts = response?.data?.posts || [];
      const hashtagSet = new Set<string>();
      
      // Extract hashtags from post text
      for (const post of posts) {
        const text = (post.record as PostRecord)?.text || '';
        
        // Extract hashtags from text
        const hashtagRegex = /#([\w]+)/g;
        let match;
        while ((match = hashtagRegex.exec(text)) !== null) {
          const tag = match[1].toLowerCase();
          // Filter by query if provided
          if (!query || tag.startsWith(query.toLowerCase())) {
            hashtagSet.add(tag);
            if (hashtagSet.size >= limit) break;
          }
        }
        if (hashtagSet.size >= limit) break;
      }
      
      return Array.from(hashtagSet).slice(0, limit);
    } catch (error: unknown) {
      logger.error('Error searching hashtag suggestions', error);
      return [];
    }
  }

  /**
   * Search for video posts with query support
   * @param query - Search query
   * @param cursor - Pagination cursor
   * @param limit - Number of results per page
   * @returns Array of video post results and next cursor
   */
  static async searchVideosPaginated(query: string, cursor: string | null = null, limit: number = 20): Promise<VideoSearchResponse> {
    await AtprotoCore.ensureSession();
    try {
      // Use search posts endpoint for query-based search
      if (!query || !query.trim()) {
        // Return empty results when no query is provided
        return { videos: [], cursor: null };
      }
      
      // Search for posts with the query
      const { api } = await AtprotoCore.getApiClient();
      const params: { q: string; limit: number; cursor?: string } = {
        q: query,
        limit,
      };
      if (cursor) {
        params.cursor = cursor;
      }
      const response = await api.app.bsky.feed.searchPosts(params);
      
      const posts = response?.data?.posts || [];
      
      // Filter for video posts only
      const videoPosts = posts.filter((post: PostView) => {
        const embed = post.embed;
        if (!embed) return false;
        return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
      });
      
      // Normalize video structure for UI consumption
      const videos: ExtendedFeedViewPost[] = videoPosts.map((post: PostView) => ({
        post: {
          ...post,
        } as ExtendedPostView,
        uniqueKey: post.uri,
      }));
      
      return {
        videos,
        cursor: response?.data?.cursor ?? null
      };
    } catch (error) {
      return { videos: [], cursor: null };
    }
  }

  /**
   * Get mixed feed from multiple feed URIs
   * @param feedUris - Array of feed URIs
   * @param cursor - Pagination cursor
   * @param limit - Number of posts to fetch
   * @param filterVideosOnly - Whether to filter only video posts
   * @param maxFeeds - Maximum number of feeds to fetch from
   * @returns Promise with feed data
   */
  static async getMixedFeed(
    feedUris: string[],
    cursor: string | null = null,
    limit: number = 50,
    filterVideosOnly: boolean = true,
    maxFeeds: number = 8
  ): Promise<FeedResponse> {
    try {
      // Filter out invalid URIs first
      const validFeedUris = feedUris.filter(uri => 
        uri && typeof uri === 'string' && (uri.startsWith('at://') || uri.startsWith('did:'))
      );
      
      if (validFeedUris.length === 0) {
        logger.warn('No valid feed URIs provided to getMixedFeed', { component: 'FeedService' });
        return { feed: [], cursor: null };
      }
      
      // Limit the number of feeds to fetch from
      const limitedFeedUris = validFeedUris.slice(0, maxFeeds);
      
      // Parse cursor to get individual feed states
      let feedStates: { [feedUri: string]: string | null } = {};
      
      if (cursor) {
        try {
          feedStates = JSON.parse(cursor);
        } catch (error) {
          logger.warn('Failed to parse cursor for mixed feed', { component: 'FeedService', error });
          feedStates = {};
        }
      } else {
        // Initialize feeds with null cursors
        limitedFeedUris.forEach(feedUri => {
          feedStates[feedUri] = null;
        });
      }

      // Fetch from feeds in parallel with better error handling
      const feedPromises = limitedFeedUris.map(async (feedUri) => {
        try {
          const feedCursor = feedStates[feedUri] || null;
          // Distribute limit across feeds, ensuring each gets at least 10 posts
          const feedLimit = Math.max(10, Math.floor(limit / limitedFeedUris.length) + 10);
          
          const response = await this.getFeed(feedCursor, feedUri, {}, filterVideosOnly, feedLimit, 'custom');
          
          return {
            posts: response?.feed || [],
            cursor: response?.cursor || null,
            feedUri,
            success: true
          };
        } catch (error) {
          // Log individual feed failures but don't fail the entire request
          logger.warn('Failed to fetch from feed in mixed feed', { 
            component: 'FeedService', 
            feedUri, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          return {
            posts: [],
            cursor: null,
            feedUri,
            success: false
          };
        }
      });

      const feedResults = await Promise.all(feedPromises);
      
      // Log success rate for debugging
      const successfulFeeds = feedResults.filter(r => r.success).length;
      if (successfulFeeds === 0) {
        logger.error('All feeds failed in getMixedFeed', { component: 'FeedService', feedUris: limitedFeedUris });
        return { feed: [], cursor: null };
      }
      
      // Update feed states with new cursors (only for successful feeds)
      feedResults.forEach(result => {
        if (result.success && result.cursor !== null) {
          feedStates[result.feedUri] = result.cursor;
        }
      });
      
      // Flatten and merge all feeds, preserving source feed information
      let allPosts = feedResults.flatMap(result => 
        result.posts.map(post => ({
          ...post,
          sourceFeed: result.feedUri
        }))
      );
      
      // Remove duplicates
      allPosts = this.deduplicatePosts(allPosts);
      
      // Sort chronologically
      allPosts.sort((a, b) => {
        const aTime = new Date(a?.post?.indexedAt || 0).getTime();
        const bTime = new Date(b?.post?.indexedAt || 0).getTime();
        return bTime - aTime;
      });
      
      // Apply limit
      const limitedPosts = allPosts.slice(0, limit);
      
      // Create cursor from active feeds (only include feeds that have more data)
      const activeFeedStates: { [feedUri: string]: string | null } = {};
      feedResults.forEach(result => {
        if (result.success && result.cursor !== null) {
          activeFeedStates[result.feedUri] = result.cursor;
        }
      });
      
      const compositeCursor = Object.keys(activeFeedStates).length > 0 ? JSON.stringify(activeFeedStates) : null;
      
      return {
        feed: limitedPosts,
        cursor: compositeCursor
      };
    } catch (error) {
      logger.error('Error in getMixedFeed', { component: 'FeedService', error });
      return { feed: [], cursor: null };
    }
  }

  /**
   * Aggressively fetch an actor's reposted videos by paging raw author feed data
   * and filtering client-side for reposts that contain video embeds.
   * This avoids server-side author filters that exclude reposts.
   */
  static async getRepostedVideos(
    actor: string,
    cursor: string | null = null,
    limit: number = 50
  ): Promise<FeedResponse> {
    try {
      await AtprotoCore.ensureSession();

      const collected: ExtendedFeedViewPost[] = [];
      let nextCursor: string | null = cursor || null;
      let safetyCounter = 0;

      // Aggressively page until we have enough items or run out
      while (collected.length < limit && safetyCounter < 10) {
        safetyCounter++;

        const params: { actor: string; limit: number; cursor?: string; filter: AuthorFilter } = {
          actor,
          limit: Math.min(100, Math.max(limit, 50)),
          ...(nextCursor ? { cursor: nextCursor } : {}),
          // Use a posts-only filter that still includes reposts; do not use media/video filters
          filter: 'posts_no_replies' as AuthorFilter,
        };

        let response: { data?: GetAuthorFeedOutput };
        try {
          const { api } = await AtprotoCore.getApiClient();
          response = await api.app.bsky.feed.getAuthorFeed(params);
        } catch (err: unknown) {
          break;
        }

        const feedChunk: ExtendedFeedViewPost[] = (response?.data?.feed || []) as ExtendedFeedViewPost[];
        if (feedChunk.length === 0) {
          nextCursor = null;
          break;
        }

        // Keep only items that are reposts
        const reposts = feedChunk.filter((item: ExtendedFeedViewPost) =>
          item?.reason?.$type && String(item.reason.$type).includes('reasonRepost')
        );

        // Within reposts, keep only those that contain video embeds using our efficient filter
        const videoReposts = this.filterVideoPostsEfficiently(reposts);

        collected.push(...videoReposts);

        nextCursor = response?.data?.cursor || null;
        if (!nextCursor) break;
      }

      let feedData = collected.slice(0, limit);

      // Apply basic moderation filtering
      if (feedData.length > 0) {
        feedData = feedData.filter(item => {
          // Basic filtering - remove posts with obvious issues
          const post = item?.post;
          if (!post) return false;
          
          // Filter out posts without required fields
          if (!post.uri || !post.cid || !post.author) return false;
          
          return true;
        });
      }

      return { feed: feedData, cursor: nextCursor };
    } catch (error: unknown) {
      return { feed: [], cursor: null };
    }
  }

  /**
   * Deduplicate posts based on URI and CID
   */
  private static deduplicatePosts(posts: ExtendedFeedViewPost[]): ExtendedFeedViewPost[] {
    const seenUris = new Set<string>();
    const seenCids = new Set<string>();
    
    return posts.filter(post => {
      const uri = post?.post?.uri;
      const cid = post?.post?.cid;
      
      if (!uri || !cid) {
        return false;
      }
      
      const uniqueId = `${uri}_${cid}`;
      
      if (seenUris.has(uri) || seenCids.has(cid) || seenUris.has(uniqueId)) {
        return false;
      }
      
      seenUris.add(uri);
      seenCids.add(cid);
      seenUris.add(uniqueId);
      
      return true;
    });
  }

  /**
   * Search for popular feed generators (channels) with query support
   * @param query - Search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects
   */
  static async searchPopularFeeds(query: string, limit: number = 5): Promise<GeneratorView[]> {
    await AtprotoCore.ensureSession();
    try {
      const params = { limit: limit, query: query };
      
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);
      
      // Return all feeds without filtering
      const allFeeds = response.data.feeds || [];
      
      // Extract contentMode from API response (may be at feed.contentMode or feed.view?.contentMode)
      // If contentMode is missing, derive it from isExperimental flag
      const processedFeeds = allFeeds.map((feed: GeneratorView) => {
        let contentMode = (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).contentMode || 
                         (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).view?.contentMode;
        
        // Fallback: if contentMode is missing but isExperimental exists, derive it
        const feedWithExperimental = feed as unknown as { isExperimental?: boolean };
        if (!contentMode && feedWithExperimental.isExperimental !== undefined) {
          contentMode = feedWithExperimental.isExperimental 
            ? undefined // Non-video feed (no contentMode set)
            : 'app.bsky.feed.defs#contentModeVideo'; // Video-only feed
        }
        
        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
          isExperimental: !isVideoOnly
        } as GeneratorView & { contentMode?: string; isExperimental: boolean };
      });
      
      return processedFeeds;
    } catch (error: unknown) {
      return [];
    }
  }

  /**
   * Get suggested feed generators (channels) without search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects
   */
  static async getSuggestedFeeds(limit: number = 10): Promise<GeneratorView[]> {
    await AtprotoCore.ensureSession();
    try {
      const params = { limit: limit };
      
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);
      
      // Return all feeds without filtering
      const allFeeds = response.data.feeds || [];
      
      // Extract contentMode from API response (may be at feed.contentMode or feed.view?.contentMode)
      // If contentMode is missing, derive it from isExperimental flag
      const processedFeeds = allFeeds.map((feed: GeneratorView) => {
        let contentMode = (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).contentMode || 
                         (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).view?.contentMode;
        
        // Fallback: if contentMode is missing but isExperimental exists, derive it
        const feedWithExperimental = feed as unknown as { isExperimental?: boolean };
        if (!contentMode && feedWithExperimental.isExperimental !== undefined) {
          contentMode = feedWithExperimental.isExperimental 
            ? undefined // Non-video feed (no contentMode set)
            : 'app.bsky.feed.defs#contentModeVideo'; // Video-only feed
        }
        
        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
          isExperimental: !isVideoOnly
        } as GeneratorView & { contentMode?: string; isExperimental: boolean };
      });
      
      return processedFeeds;
    } catch (error: unknown) {
      return [];
    }
  }

  /**
   * Get static channels (feed generators)
   * @param limit - Number of channels to return
   * @returns Array of feed generator objects
   */
  static async getStaticChannels(limit: number = 10): Promise<(GeneratorView & { isExperimental: boolean; contentMode?: string })[]> {
    try {
      const { StaticChannelsService } = await import('../../APIService');
      const channelDids = await StaticChannelsService.getChannels();
      
      if (!channelDids || channelDids.length === 0) {
        return [];
      }

      // Directly fetch feed generators using the URIs
      const feedGenerators = await Promise.all(
        channelDids.map(async (uri) => {
          try {
            const { api } = await AtprotoCore.getApiClient();
            const response = await api.app.bsky.feed.getFeedGenerators({
              feeds: [uri]
            });
            
            const feeds = response.data.feeds || [];
            if (feeds.length > 0) {
              return {
                ...feeds[0],
                isExperimental: false,
              };
            }
            return null;
          } catch (error) {
            return null;
          }
        })
      );

      // Filter out null results and return up to the limit
      return feedGenerators.filter((feed): feed is GeneratorView & { isExperimental: boolean; contentMode?: string } => feed !== null).slice(0, limit);
    } catch (error: unknown) {
      return [];
    }
  }
}
