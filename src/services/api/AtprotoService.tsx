import { AtpAgent } from '@atproto/api';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModerationDecision, ModerationSettings, LabelPreference, ModerationOpts, LabelDefinition } from '../ModerationTypes';
import { AtProtoOAuthService } from '../auth/OAuthService';
import { StaticChannelsService } from '../APIService';


const SERVICE_URL = 'https://bsky.social';
const CHAT_SERVICE_URL = 'https://api.bsky.chat';

interface FeedResponse {
  feed: any[];
  cursor: string | null;
}

interface FeedParams {
  [key: string]: any;
}

interface MessagesResponse {
  messages: any[];
  cursor: string | null;
}

interface ConversationsResponse {
  conversations: any[];
  cursor?: string | null;
}

interface QueryParams {
  actor: string;
  limit?: number;
  cursor?: string;
}

interface ThreadViewPost {
  $type: 'app.bsky.feed.defs#threadViewPost';
  post: {
    uri: string;
    cid: string;
    author: any;
    record: any;
    indexedAt: string;
    viewer?: any;
    likeCount?: number;
    replyCount?: number;
  };
  parent?: ThreadViewPost;
  replies?: ThreadViewPost[];
}

interface NotFoundPost {
  $type: 'app.bsky.feed.defs#notFoundPost';
  uri: string;
  notFound: true;
}

interface BlockedPost {
  $type: 'app.bsky.feed.defs#blockedPost';
  uri: string;
  blocked: true;
}

type ThreadPost = ThreadViewPost | NotFoundPost | BlockedPost;

/**
 * Author feed types supported by Bluesky API
 */
type AuthorFilter = 
  | 'posts_with_replies'
  | 'posts_no_replies' 
  | 'posts_and_author_threads'
  | 'posts_with_media'
  | 'posts_with_video';

class AtprotoService {
  static agent = new AtpAgent({ service: SERVICE_URL });
  private static _sessionPromise: Promise<any> | null = null;
  
  // Performance caching for frequently accessed data
  private static _feedCache = new Map<string, { data: any; timestamp: number }>();
  private static _profileCache = new Map<string, { data: any; timestamp: number }>();
  private static _channelCache = new Map<string, { data: any; timestamp: number }>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Cache utility methods
  private static getCachedData(cache: Map<string, { data: any; timestamp: number }>, key: string): any | null {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    if (cached) {
      cache.delete(key); // Remove expired data
    }
    return null;
  }

  private static setCachedData(cache: Map<string, { data: any; timestamp: number }>, key: string, data: any): void {
    cache.set(key, { data, timestamp: Date.now() });
    // Cleanup old entries if cache gets too large
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  }

  /**
   * Ensures a valid OAuth session exists
   * This optimized version prevents duplicate session checks when multiple
   * queries fire at once
   */
  static async ensureSession(): Promise<any> {
    // If there's an active session fetch in progress, return that promise
    if (this._sessionPromise) {
      return this._sessionPromise;
    }

    // Otherwise, create a new session promise
    this._sessionPromise = (async () => {
      try {
        // Check if there's an OAuth session
        const oauthService = AtProtoOAuthService.getInstance();
        const oauthSession = await oauthService.getCurrentSession();
        
        if (oauthSession) {
      
          return { did: oauthSession.did, type: 'oauth' };
        }

        throw new Error('No OAuth session available. Please log in first.');
      } finally {
        // Clear the session promise so subsequent calls will create a new one
        setTimeout(() => {
          this._sessionPromise = null;
        }, 50);
      }
    })();

    return this._sessionPromise;
  }

  /**
   * Get the current user's DID from OAuth session
   */
  static async getCurrentUserDid(): Promise<string | null> {
    try {
      const oauthService = AtProtoOAuthService.getInstance();
      const oauthSession = await oauthService.getCurrentSession();
      return oauthSession?.did || null;
    } catch (error) {
      console.error('Error getting current user DID:', error);
      return null;
    }
  }

  /**
   * Get the OAuth API client
   */
  static async getApiClient(): Promise<{ api: any; isOAuth: boolean }> {
    const oauthService = AtProtoOAuthService.getInstance();
    const oauthSession = await oauthService.getCurrentSession();
    
    if (oauthSession) {
      const oauthAgent = await oauthService.getCurrentAgent();
      if (oauthAgent) {

        return { api: oauthAgent.api, isOAuth: true };
      } else {
        throw new Error('OAuth agent not available');
      }
    }

    throw new Error('No OAuth session available');
  }

  /**
   * Make an authenticated API request using OAuth
   */
  static async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const oauthService = AtProtoOAuthService.getInstance();
    const oauthSession = await oauthService.getCurrentSession();
    
    if (oauthSession) {
      return await oauthService.makeAuthenticatedRequest(url, options);
    } else {
      throw new Error('No OAuth session available');
    }
  }

  /**
   * Get feed content - optimized for video-only feeds with maximum batch loading
   * 
   * @param cursor - Pagination cursor
   * @param feedLink - Link to the feed
   * @param feedVariables - Additional parameters
   * @param filterVideosOnly - Whether to filter only video posts at API level
   * @returns Promise with feed data
   */
  static async getFeed(
    cursor: string | null = null,
    feedLink: string | null = null,
    feedVariables: FeedParams = {},
    filterVideosOnly: boolean = true,
    limit: number = 100,
    feedType?: 'author' | 'likes' | 'reposts' | 'authorVideos' | 'custom'
  ): Promise<FeedResponse> {

    
    let retries = 3;
    
    while (retries > 0) {
      try {
        const { api, isOAuth } = await this.getApiClient();

        let response: any;
        
        // Unified feed handling based on feedType
        if (feedType === 'author' || feedType === 'authorVideos') {
          // Author feed - use author filter
          const authorFilter = feedType === 'authorVideos' ? 'posts_with_video' : 'posts_with_media';
          try {
            const params: any = {
              actor: feedLink || '',
              limit: limit,
              cursor: cursor || undefined,
              filter: authorFilter,
            };
            
            response = await api.app.bsky.feed.getAuthorFeed(params);
          } catch (authorError: any) {
            console.error('[AtprotoService] Author feed error details:', {
              message: authorError.message,
              status: authorError.status,
              error: authorError
            });
            return { feed: [], cursor: null };
          }
        } else if (feedType === 'likes') {
          // Liked posts feed
          try {
            const params: any = {
              actor: feedLink || '',
              limit: limit,
              cursor: cursor || undefined,
            };
            
            response = await api.app.bsky.feed.getActorLikes(params);
          } catch (likesError: any) {
            console.error('[AtprotoService] Likes feed error details:', {
              message: likesError.message,
              status: likesError.status,
              error: likesError
            });
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
            console.warn('[AtprotoService] No feed specified, returning empty feed');
            return { feed: [], cursor: null };
          }
          
          // Validate AT-URI format
          if (!feed.startsWith('at://') && !feed.startsWith('did:')) {
            console.warn('[AtprotoService] Invalid feed URI format:', feed);
            return { feed: [], cursor: null };
          }
          
          const params: any = { 
            feed, 
            limit: limit
          };
          if (cursor) params.cursor = cursor;
          
          try {
            response = await api.app.bsky.feed.getFeed(params);
          } catch (customFeedError: any) {
            console.error('[AtprotoService] Custom feed error details:', {
              message: customFeedError.message,
              status: customFeedError.status,
              error: customFeedError
            });
            // Check if it's a feed validation error
            if (customFeedError.message && customFeedError.message.includes('feed must be a valid at-uri')) {
              console.warn('[AtprotoService] Invalid feed URI:', feed);
              return { feed: [], cursor: null };
            }
            return { feed: [], cursor: null };
          }
        }
        
        // Ensure the response has the expected data structure
        if (!response?.data || !response.data.feed) {
          console.warn('Unexpected feed response format:', response);
          return { feed: [], cursor: null };
        }

        let feedData = response.data.feed;
        
        // Filter for video posts at API level if requested
        if (filterVideosOnly) {

          feedData = feedData.filter((post: any) => {
            const embed = post.post.embed;
            if (!embed) {

              return false;
            }
            
            
            
            // Only include posts with video embeds
            let hasVideo = false;
            
            if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
              hasVideo = true;
            } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
              hasVideo = Boolean(embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view');
            }
            
            if (!hasVideo) {

            }
            
            return hasVideo;
          });

        }
        
        return { feed: feedData, cursor: response.data.cursor };
      } catch (error: any) {
        retries--;
        if (retries === 0) {
          console.error('Feed request failed after retries:', error);
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
  private static filterVideoPostsEfficiently(posts: any[]): any[] {
    const videoPosts: any[] = [];
    
    for (const item of posts) {
      const embed = item?.post?.embed;
      if (!embed) continue;
      
      // Only include posts where embed is of type 'app.bsky.embed.video' or 'app.bsky.embed.video#view'
      let hasVideo = false;
      
      if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
        hasVideo = true;
      } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
        hasVideo = Boolean(embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view');
      }
      
      if (hasVideo) {
        // Process repost information efficiently
        if (item.reason?.by && item.reason.$type?.includes('reasonRepost')) {
          item.post.repostedBy = {
            avatar: item.reason.by.avatar,
            displayName: item.reason.by.displayName,
            handle: item.reason.by.handle
          };
        }
        
        // Add unique key for efficient rendering
        if (!item.uniqueKey) {
          item.uniqueKey = `${item.post.uri}_${videoPosts.length}`;
        }
        
        videoPosts.push(item);
      }
    }
    
    return videoPosts;
  }

  static async getCurrentUser(): Promise<any> {
    try {
      const { api } = await this.getApiClient();
      
      // For OAuth sessions, get the DID from the OAuth service
      const oauthService = AtProtoOAuthService.getInstance();
      const oauthSession = await oauthService.getCurrentSession();
      if (!oauthSession) {
        throw new Error('No OAuth session available');
      }
      
      const response = await api.app.bsky.actor.getProfile({ actor: oauthSession.did });
      return response.data;
    } catch (error: any) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  // Unified getFeed method now handles all feed types
  // Removed redundant getAuthorFeed method

  // Unified getFeed method now handles all feed types
  // Removed redundant getAuthorVideos method

  /**
   * Fetch conversations for React Query
   * @returns Promise with conversations data
   */
  static async getConversations(cursor: string | null = null): Promise<ConversationsResponse> {
    try {
      const { api } = await this.getApiClient();
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-bsky-service': 'did:web:api.bsky.chat'
      };
      
      // For OAuth, the authentication is handled by the agent automatically
      const oauthService = AtProtoOAuthService.getInstance();
      const oauthSession = await oauthService.getCurrentSession();
      
      if (!oauthSession) {
        throw new Error('No OAuth session available');
      }
      
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) {
        params.append('cursor', cursor);
      }
      const response = await fetch(
        `${CHAT_SERVICE_URL}/xrpc/chat.bsky.convo.listConversations?${params.toString()}`,
        { headers }
      );
      if (response.status === 501) {
        console.warn("Service not implemented (HTTP 501). Returning empty conversations.");
        return { conversations: [], cursor: null };
      }
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const json = await response.json();
      return { conversations: json.convos || [], cursor: json.cursor || null };
    } catch (error: any) {
      console.error("Error fetching conversations:", error.message, error.stack);
      throw error;
    }
  }

  /**
   * Fetch messages for a conversation
   * @param convoId - The conversation ID
   * @param cursor - Pagination cursor
   * @returns Promise with messages data
   */
  static async getMessages(convoId: string, cursor: string | null = null): Promise<MessagesResponse> {
    try {
      await this.ensureSession();
      const params = new URLSearchParams({ convoId, limit: '50' });
      if (cursor) {
        params.append('cursor', cursor);
      }
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-bsky-service': 'did:web:api.bsky.chat'
      };
      
      // For OAuth, authentication is handled automatically by the agent
      const response = await fetch(
        `${CHAT_SERVICE_URL}/xrpc/chat.bsky.convo.getMessages?${params.toString()}`,
        { headers }
      );
      if (response.status === 501) {
        console.warn("Service not implemented (HTTP 501). Returning empty messages.");
        return { messages: [], cursor: null };
      }
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const json = await response.json();
      return { messages: json.logs, cursor: json.cursor || null };
    } catch (error: any) {
      console.error("Error fetching messages:", error.message, error.stack);
      throw error;
    }
  }

  static async getLog(cursor: string | null = null): Promise<{ logs: any[]; cursor: string | null }> {
    try {
      await this.ensureSession();
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-bsky-service': 'did:web:api.bsky.chat'
      };
      
      // For OAuth, authentication is handled automatically by the agent
      const response = await fetch(
        `${CHAT_SERVICE_URL}/xrpc/chat.bsky.convo.getLog?${params.toString()}`,
        { headers }
      );
      if (response.status === 501) {
        return { logs: [], cursor: null };
      }
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const json = await response.json();
      return { logs: json.logs, cursor: json.cursor || null };
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Like a post and return the URI
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The URI of the created like
   */
  static async likePost(uri: string, cid: string): Promise<string> {
    const userDid = await this.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');
    
    const record = {
      $type: 'app.bsky.feed.like' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    try {
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.feed.like.create({ repo: userDid }, record);
      return response.uri;
    } catch (error: any) {
      console.error('Like creation error:', error);
      throw error;
    }
  }

  static async deleteLike(likeUri: string): Promise<void> {
    await this.ensureSession();
    const { api } = await this.getApiClient();
    const parts = likeUri.split('/');
    const rkey = parts[parts.length - 1];
    await api.app.bsky.feed.like.delete({ repo: (await this.getCurrentUserDid())!, rkey });
  }

  static async repostPost(uri: string, cid: string): Promise<string> {
    const userDid = await this.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');
    
    const record = {
      $type: 'app.bsky.feed.repost' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    try {
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.feed.repost.create({ repo: userDid }, record);
      return response.uri;
    } catch (error: any) {
      console.error('Repost creation error:', error);
      throw error;
    }
  }

  static async deleteRepost(repostURI: string): Promise<void> {
    const { api } = await this.getApiClient();
    const userDid = await this.getCurrentUserDid();
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
   * @returns The response from creating the comment
   */
  static async postComment(
    text: string, 
    rootUri: string, 
    rootCid: string,
    parentUri?: string,
    parentCid?: string,
    images?: { uri: string, alt: string, aspectRatio?: { width: number, height: number } }[]
  ): Promise<any> {
    await this.ensureSession();
    
    // If no parent is specified, reply directly to the post (parent = root)
    const actualParentUri = parentUri || rootUri;
    const actualParentCid = parentCid || rootCid;
    
    // Parse rich text to extract facets for mentions, links, and hashtags
    const { parseRichTextWithResolvedMentions } = await import('../../utils/richTextParser');
    const parsedText = await parseRichTextWithResolvedMentions(text);
    
    const postRecord: any = {
      $type: 'app.bsky.feed.post',
      text: parsedText.text,
      createdAt: new Date().toISOString(),
      reply: {
        root: { uri: rootUri, cid: rootCid },
        parent: { uri: actualParentUri, cid: actualParentCid },
      },
    };

    // Add facets if they exist
    if (parsedText.facets && parsedText.facets.length > 0) {
      postRecord.facets = parsedText.facets;
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
              const { api } = await this.getApiClient();
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
        console.error('Error uploading images for comment:', error);
        // Continue without images if there was an error
      }
    }
    
    const { api } = await this.getApiClient();
    const commentResponse = await api.post(postRecord);
    return commentResponse;
  }

  /**
   * Create a new post with video content using Bluesky's video service
   * @param text - The post text
   * @param videoPath - Path to the video file
   * @param contentWarnings - Optional content warnings
   * @param commentFilter - Comment filtering settings
   * @returns The response from creating the post
   */
  static async createVideoPost(
    text: string,
    videoPath: string,
    contentWarnings?: string[],
    commentFilter?: 'all' | 'followers' | 'mentioned' | 'none',
    metadata?: Record<string, any>
  ): Promise<any> {
    await this.ensureSession();
    
    try {
      // Validate video file
      if (!videoPath || !videoPath.startsWith('file://')) {
        throw new Error('Invalid video path');
      }

      // Upload video directly to PDS
      const videoResponse = await fetch(videoPath);
      const videoBlob = await videoResponse.blob();
      
      const { api } = await this.getApiClient();
      const { data } = await api.com.atproto.repo.uploadBlob(videoBlob, {
        encoding: 'video/mp4'
      });
      
      // Get video aspect ratio
      const aspectRatio = await this.getVideoAspectRatio(videoPath);

      // Parse rich text to extract facets for mentions, links, and hashtags
      const { parseRichTextWithResolvedMentions } = await import('../../utils/richTextParser');
      const parsedText = await parseRichTextWithResolvedMentions(text);

      // Create the post with video embed
      const postRecord: any = {
        $type: 'app.bsky.feed.post',
        text: parsedText.text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: 'app.bsky.embed.video',
          video: data.blob,
          aspectRatio
        }
      };

      // Add facets if they exist
      if (parsedText.facets && parsedText.facets.length > 0) {
        postRecord.facets = parsedText.facets;
      }

      // Add content warnings if provided
      if (contentWarnings && contentWarnings.length > 0) {
        postRecord.labels = contentWarnings.map(warning => ({
          $type: 'com.atproto.label.defs#selfLabel',
          val: warning
        }));
      }

      // Add metadata if provided
      if (metadata) {
        postRecord.metadata = metadata;
      }

      // Create the post
      const postResponse = await api.post(postRecord);

      // Set comment filtering if specified
      if (commentFilter && commentFilter !== 'all') {
        try {
          await this.setCommentFilter(postResponse.uri, commentFilter);
        } catch (error) {
          console.warn('Failed to set comment filter:', error);
        }
      }

      return postResponse;
    } catch (error: any) {
      console.error('Video upload failed:', error);
      throw new Error(`Video upload failed: ${error.message}`);
    }
  }

  /**
   * Get video aspect ratio from video file
   * @param videoPath - Path to the video file
   * @returns Aspect ratio object with width and height
   */
  private static async getVideoAspectRatio(videoPath: string): Promise<{ width: number; height: number }> {
    try {
      // For React Native, we'll use a default aspect ratio
      // In a real implementation, you might want to use a video metadata library
      return { width: 9, height: 16 }; // Default to 9:16 (portrait)
    } catch (error) {
      console.warn('Could not determine video aspect ratio, using default:', error);
      return { width: 9, height: 16 };
    }
  }

  /**
   * Upload a video file to Bluesky
   * @param videoPath - Path to the video file
   * @returns Blob reference for the uploaded video
   */
  static async uploadVideo(videoPath: string): Promise<any> {
    try {
      await this.ensureSession();
      
      if (!videoPath.startsWith('file://')) {
        throw new Error('Unsupported video format');
      }

      // Fetch the video file
      const response = await fetch(videoPath);
      const videoBlob = await response.blob();

      // Upload the video to Bluesky
      const { api } = await this.getApiClient();
      const uploadResult = await api.uploadBlob(videoBlob, {
        encoding: 'video/mp4'
      });

      return uploadResult.data.blob;
    } catch (error: any) {
      console.error('Error uploading video:', error);
      throw error;
    }
  }

  /**
   * Set comment filtering for a post
   * @param postUri - URI of the post
   * @param filter - Comment filter setting
   */
  private static async setCommentFilter(postUri: string, filter: 'followers' | 'mentioned' | 'none'): Promise<void> {
    try {
      // Extract the record key (rkey) from the URI
      const parts = postUri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI');
      }
      
      const rkey = parts[4];
      
      // Create threadgate record based on filter
      let allow: any[] = [];
      
      switch (filter) {
        case 'followers':
          allow = [{ $type: 'app.bsky.feed.threadgate#followingRule' }];
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
      
      const { api } = await this.getApiClient();
      const userDid = await this.getCurrentUserDid();
      if (!userDid) throw new Error('No authenticated user');
      
      await api.com.atproto.repo.createRecord({
        repo: userDid,
        collection: 'app.bsky.feed.threadgate',
        rkey: rkey,
        record
      });
    } catch (error: any) {
      console.error('Error setting comment filter:', error);
      throw error;
    }
  }

  /**
   * Get comments for a post with pagination support
   * @param postUri - The URI of the post
   * @param cursor - Pagination cursor
   * @param limit - Number of comments per page (not used currently as API doesn't support it)
   * @param depth - How many levels of replies to include (default 2 for parent comments and their replies)
   * @returns Array of comments and next cursor
   */
  static async getComments(postUri: string, cursor: string | null = null, limit: number = 25): Promise<{ comments: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      const params: any = { 
        uri: postUri,
        depth: 6,
        parentHeight: 0
      };
      if (cursor) params.cursor = cursor;
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.feed.getPostThread(params);
      
      // Function to recursively process thread posts with proper typing
      const processThreadViewPost = (post: ThreadPost): any => {
        if (!post || post.$type !== 'app.bsky.feed.defs#threadViewPost') {
          return null;
        }

        const result = {
          uri: post.post.uri,
          cid: post.post.cid,
          author: post.post.author,
          record: post.post.record,
          indexedAt: post.post.indexedAt,
          viewer: post.post.viewer,
          likeCount: post.post.likeCount,
          replyCount: post.post.replyCount,
          replies: [] as any[]
        };

        // Process replies if they exist
        if (post.replies && Array.isArray(post.replies)) {
          result.replies = post.replies
            .map((reply: ThreadPost) => processThreadViewPost(reply))
            .filter(Boolean);
        }

        return result;
      };

      // Get the thread from response
      const thread = response.data.thread as ThreadPost;
      let comments: any[] = [];
      
      // Process replies at the root level
      if (thread && thread.$type === 'app.bsky.feed.defs#threadViewPost' && thread.replies) {
        comments = thread.replies
          .map((reply: ThreadPost) => processThreadViewPost(reply))
          .filter(Boolean);
      }

      return {
        comments,
        cursor: (response.data as any).cursor || null
      };
    } catch (error: any) {
      console.error('Error fetching comments:', error);
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
  static async getLikes(uri: string, cursor: string | null = null, limit: number = 25): Promise<{ likes: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      const params: any = { uri, limit };
      if (cursor) params.cursor = cursor;
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.feed.getLikes(params);
      return { 
        likes: response.data.likes || [], 
        cursor: response.data.cursor || null 
      };
    } catch (error: any) {
      console.error('Error fetching likes:', error);
      return { likes: [], cursor: null };
    }
  }

  /**
   * Search profiles by query
   * @param query - Search query
   * @returns Array of profile results
   */
  static async searchProfiles(query: string): Promise<any[]> {
    await this.ensureSession();
    try {
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.actor.searchActors({
        term: query,
        limit: 20
      });
      return response.data.actors || [];
    } catch (error: any) {
      console.error('Error searching profiles:', error);
      return [];
    }
  }

  /**
   * Search profiles by query with pagination support
   * @param query - Search query
   * @param cursor - Pagination cursor
   * @param limit - Number of results per page
   * @returns Array of profile results and next cursor
   */
  static async searchProfilesPaginated(query: string, cursor: string | null = null, limit: number = 20): Promise<{ profiles: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      const params: any = { term: query, limit };
      if (cursor) params.cursor = cursor;
      
      // Use the correct API endpoint with proper namespace
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.actor.searchActors(params);
      
      // Extract the cursor for pagination
      const nextCursor = response.data.cursor || null;
      
      // Return profiles with cursor
      return {
        profiles: response.data.actors || [],
        cursor: nextCursor
      };
    } catch (error) {
      console.error('Error searching profiles:', error);
      return { profiles: [], cursor: null };
    }
  }

  /**
   * Get profile by DID with caching for performance
   * @param did - User DID
   * @returns Profile data
   */
  static async getProfileByDid(did: string): Promise<any> {
    // Check cache first
    const cacheKey = `profile_did_${did}`;
    const cachedProfile = this.getCachedData(this._profileCache, cacheKey);
    if (cachedProfile) {
      return cachedProfile;
    }

    const { api } = await this.getApiClient();
    try {
      const response = await api.app.bsky.actor.getProfile({
        actor: did,
      });
      
      // Cache the profile data
      const profileData = response.data;
      this.setCachedData(this._profileCache, cacheKey, profileData);
      
      // The profile response already includes verification data
      // No need for separate API calls - verification data is included in the profile
      return profileData;
    } catch (error: any) {
      // console.error('Error getting profile by DID:', error);
      return null;
    }
  }

  /**
   * Get profile by handle with caching for performance (legacy)
   * @param handle - User handle
   * @returns Profile data
   */
  static async getProfile(handle: string): Promise<any> {
    // Check cache first
    const cacheKey = `profile_${handle}`;
    const cachedProfile = this.getCachedData(this._profileCache, cacheKey);
    if (cachedProfile) {
      return cachedProfile;
    }

    const { api } = await this.getApiClient();
    try {
      const response = await api.app.bsky.actor.getProfile({
        actor: handle,
      });
      
      // Cache the profile data
      const profileData = response.data;
      this.setCachedData(this._profileCache, cacheKey, profileData);
      
      // The profile response already includes verification data
      // No need for separate API calls - verification data is included in the profile
      return profileData;
    } catch (error: any) {
      // console.error('Error getting profile:', error);
      return null;
    }
  }

  /**
   * Follow a user
   * @param did - User DID to follow
   * @returns Follow URI
   */
  static async follow(did: string): Promise<string> {
    const { api } = await this.getApiClient();
    
    // For OAuth sessions, get the DID from the OAuth service
    const oauthService = AtProtoOAuthService.getInstance();
    const oauthSession = await oauthService.getCurrentSession();
    if (!oauthSession) {
      throw new Error('No OAuth session available');
    }
    const userDid = oauthSession.did;
    
    const record = {
      $type: 'app.bsky.graph.follow' as const,
      subject: did,
      createdAt: new Date().toISOString(),
    };
    
    try {
      const response = await api.app.bsky.graph.follow.create(
        { repo: userDid }, 
        record
      );
      return response.uri;
    } catch (error: any) {
      console.error('Error following user:', error);
      throw error;
    }
  }

  /**
   * Unfollow a user
   * @param did - User DID to unfollow
   * @returns True if successful
   */
  static async unfollow(did: string): Promise<boolean> {
    const { api } = await this.getApiClient();
    
    // For OAuth sessions, get the DID from the OAuth service
    const oauthService = AtProtoOAuthService.getInstance();
    const oauthSession = await oauthService.getCurrentSession();
    if (!oauthSession) {
      throw new Error('No OAuth session available');
    }
    const userDid = oauthSession.did;
    
    try {
      // Get the profile by DID to get the viewer.following
      const profileResponse = await api.app.bsky.actor.getProfile({ actor: did });
      if (!profileResponse.data.viewer?.following) {
        console.log('Not following this user');
        return false;
      }
      
      // Extract the rkey from the follow URI
      // URI format: at://did:plc:xxxx/app.bsky.graph.follow/rkey
      const uriParts = profileResponse.data.viewer.following.split('/');
      const rkey = uriParts[uriParts.length - 1];
      
      if (!rkey) {
        console.error('Could not extract rkey from follow URI:', profileResponse.data.viewer.following);
        return false;
      }
      
      // Delete the follow using the record key
      await api.app.bsky.graph.follow.delete({
        repo: userDid,
        rkey: rkey,
      });
      
      return true;
    } catch (error: any) {
      console.error('Error unfollowing user:', error);
      return false;
    }
  }

  static async unblockUser(did: string): Promise<void> {
    await this.ensureSession();

    try {
      const { api } = await this.getApiClient();
      const userDid = await this.getCurrentUserDid();
      if (!userDid) throw new Error('No authenticated user');
      
      await api.app.bsky.graph.block.delete({
        repo: userDid,
        rkey: did,
      });
    } catch (error: any) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }

  static async blockUser(did: string): Promise<void> {
    await this.ensureSession();

    const record = {
      $type: 'app.bsky.graph.block' as const,
      subject: did,
      createdAt: new Date().toISOString(),
    };

    try {
      const { api } = await this.getApiClient();
      const userDid = await this.getCurrentUserDid();
      if (!userDid) throw new Error('No authenticated user');
      
      await api.app.bsky.graph.block.create(
        { repo: userDid },
        record
      );
    } catch (error: any) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  // Note: Mute/unmute functionality may need to be implemented differently
  // as the API methods are not available in the current version
  static async muteUser(did: string): Promise<void> {
    throw new Error('Mute functionality not implemented');
  }

  static async unmuteUser(did: string): Promise<boolean> {
    throw new Error('Unmute functionality not implemented');
  }

  static async getPost(uri: string): Promise<any> {
    try {
      await this.ensureSession();
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.feed.getPostThread({
        uri: uri,
        depth: 0
      });
      
      if (response.data.thread && response.data.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
        const threadViewPost = response.data.thread as ThreadViewPost;
        return threadViewPost.post;
      }
      return null;
    } catch (error: any) {
      console.error('Error fetching post:', error);
      return null;
    }
  }

  static async isBlocked(did: string): Promise<boolean> {
    await this.ensureSession();

    try {
      // Use the correct parameter name 'filter' instead of 'actor'
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.graph.getBlocks({
        limit: 50 // Use a reasonable limit since we need to search through the results
      });
      
      // Check if the given DID is in the blocks list
      return response.data.blocks.some((block: any) => block.did === did);
    } catch (error: any) {
      console.error('Error checking block status:', error);
      return false;
    }
  }

  static async sendVideoFeedback(postUri: string, type: 'interested' | 'not_interested'): Promise<void> {
    try {
      // Get the current user's DID from OAuth session
      const userDid = await this.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }

      // For now, we'll use a custom approach since Bluesky doesn't have a direct feedback API
      // We can store the feedback locally and potentially send it to a custom endpoint
      // This is a placeholder implementation that can be extended later
      
      // Store feedback in local storage
      const feedbackKey = `video_feedback_${postUri}`;
      const feedbackData = {
        postUri,
        type,
        timestamp: new Date().toISOString(),
        userDid: userDid,
        targetFeed: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids' // Always send to vids feed
      };
      
      // Store in AsyncStorage for persistence
      await AsyncStorage.setItem(feedbackKey, JSON.stringify(feedbackData));
      
    } catch (error: any) {
      console.error('Error sending video feedback:', error);
      throw error;
    }
  }

  /**
   * Get stored video feedback for a post
   */
  static async getVideoFeedback(postUri: string): Promise<{ type: 'interested' | 'not_interested'; timestamp: string; userDid: string } | null> {
    try {
      const feedbackKey = `video_feedback_${postUri}`;
      const feedbackStr = await AsyncStorage.getItem(feedbackKey);
      
      if (feedbackStr) {
        const feedbackData = JSON.parse(feedbackStr);
        return feedbackData;
      }
      
      return null;
    } catch (error: any) {
      console.error('Error getting video feedback:', error);
      return null;
    }
  }

  /**
   * Remove stored video feedback for a post
   */
  static async removeVideoFeedback(postUri: string): Promise<void> {
    try {
      const feedbackKey = `video_feedback_${postUri}`;
      await AsyncStorage.removeItem(feedbackKey);
    } catch (error: any) {
      console.error('Error removing video feedback:', error);
      throw error;
    }
  }

  static async listNotifications(cursor: string | null = null, limit = 50): Promise<{ notifications: any[]; cursor: string | null }> {
    await this.ensureSession();
    try {
      const params: { cursor?: string, limit: number } = { limit };
      if (cursor !== null) {
        params.cursor = cursor;
      }
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.notification.listNotifications(params);
      return { 
        notifications: response.data.notifications || [], 
        cursor: response.data.cursor || null 
      };
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      return { notifications: [], cursor: null };
    }
  }

  // Unified getFeed method now handles all feed types
  // Removed redundant getLikedPosts and getRepostedPosts methods

  /**
   * Delete a post
   * @param uri - Post URI to delete
   * @returns A boolean indicating whether the deletion was successful
   */
  static async deletePost(uri: string): Promise<boolean> {
    try {
      await this.ensureSession();
      
      // Extract the record key (rkey) from the URI
      // URI format: at://did:plc:xxxx/app.bsky.feed.post/rkey
      const parts = uri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI format');
      }
      
      const did = parts[2];
      const rkey = parts[4];
      
      // Get the current user's DID to ensure they own the post
      const userDid = await this.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }
      
      // Ensure the user owns the post
      if (did !== userDid) {
        throw new Error('Cannot delete a post that you do not own');
      }
      
      // Delete the post
      const { api } = await this.getApiClient();
      
      await api.app.bsky.feed.post.delete({
        repo: userDid,
        rkey: rkey
      });
      
      return true;
    } catch (error: any) {
      console.error('Error deleting post:', error);
      return false;
    }
  }

  /**
   * Report a post or user for moderation
   * @param uri - URI of the content to report (post or user)
   * @param reasonType - The reason for reporting (can be simple type or full namespace type)
   * @param reason - Optional additional context for the report
   * @param labelerDid - Optional DID of the labeler to receive the report (default: uses Bluesky's moderation)
   * @returns A boolean indicating whether the report was successfully submitted
   */
  static async reportContent(
    uri: string, 
    reasonType: string | 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other',
    reason?: string,
    labelerDid?: string
  ): Promise<boolean> {
    try {
      await this.ensureSession();
      
      // For posts, we need the CID in addition to URI for proper reporting
      let cid: string | undefined;
      let subject: any = {}; // Will be set based on whether this is a post or user
      
      // Convert simple reason types to full namespace format if needed
      let fullReasonType = reasonType;
      if (!reasonType.includes('#')) {
        // Map simple reason types to full namespace format
        const reasonMap: Record<string, string> = {
          'spam': 'com.atproto.moderation.defs#reasonSpam',
          'violation': 'com.atproto.moderation.defs#reasonViolation',
          'misleading': 'com.atproto.moderation.defs#reasonMisleading',
          'sexual': 'com.atproto.moderation.defs#reasonSexual',
          'rude': 'com.atproto.moderation.defs#reasonRude',
          'other': 'com.atproto.moderation.defs#reasonOther'
        };
        fullReasonType = reasonMap[reasonType] || 'com.atproto.moderation.defs#reasonOther';
      }
      
      // Determine if we're reporting a post or user
      if (uri.includes('app.bsky.feed.post')) {
        try {
          // Try to get the post to extract its CID
          const { api } = await this.getApiClient();
          const postResponse = await api.app.bsky.feed.getPostThread({ 
            uri,
            depth: 0
          });
          
          const thread = postResponse.data.thread;
          
          // Type guard for ThreadViewPost
          if (thread && 
              thread.$type === 'app.bsky.feed.defs#threadViewPost' && 
              'post' in thread && 
              thread.post?.cid) {
            cid = thread.post.cid;
          }
        } catch (err) {
          console.warn('Could not get CID for post, proceeding with URI-only report');
        }
        
        // Set the subject for a post
        subject = {
          $type: 'com.atproto.repo.strongRef',
          uri,
          ...(cid && { cid })
        };
      } else if (uri.startsWith('did:')) {
        // We're reporting a user
        subject = { did: uri };
      } else {
        // Default to repo strongRef for other content types
        subject = {
          $type: 'com.atproto.repo.strongRef',
          uri
        };
      }
      
      // Get the API client
      const { api } = await this.getApiClient();
      
      // Create the moderation report
      await api.com.atproto.moderation.createReport({
        reasonType: fullReasonType,
        subject,
        reason
      });
      
      return true;
    } catch (error: any) {
      console.error('Error reporting content:', error);
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
      await this.ensureSession();
      // Extract the record key (rkey) from the URI
      const parts = postUri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI format');
      }
      
      const did = parts[2];
      const rkey = parts[4];
      
      // Get the current user's DID to ensure they own the post
      const userDid = await this.getCurrentUserDid();
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
      
      const { api } = await this.getApiClient();
      
      await api.com.atproto.repo.createRecord({
        repo: userDid,
        collection: 'app.bsky.feed.threadgate',
        rkey: rkey,
        record
      });
      
      return true;
    } catch (error: any) {
      console.error('Error muting post comments:', error);
      return false;
    }
  }

  /**
   * Clear all caches - useful for logout or account switching
   */
  static clearAllCaches(): void {
    this._feedCache.clear();
    this._profileCache.clear();
    this._channelCache.clear();
  }



  /**
   * Get profile information for a DID (verifier)
   * @param did - DID of the verifier
   * @returns Profile data or null
   */
  static async getVerifierProfile(did: string): Promise<any | null> {
    try {
      await this.ensureSession();
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.actor.getProfile({
        actor: did,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error getting verifier profile:', error);
      return null;
    }
  }

  /**
   * Update profile information
   * @param updates - Object containing profile updates
   * @returns Updated profile data
   */
  static async updateProfile(updates: {
    displayName?: string;
    description?: string;
    avatar?: string; // Base64 encoded image or file URI
    customColors?: {
      backgroundColor: string;
      textColor: string;
    };
  }): Promise<any> {
    try {
      console.log('[AtprotoService] updateProfile called with:', {
        displayName: updates.displayName,
        description: updates.description,
        hasAvatar: !!updates.avatar,
        customColors: updates.customColors,
      });
      
      await this.ensureSession();
      
      // Use the correct upsertProfile method as per Bluesky documentation
      const { api } = await this.getApiClient();
      const updatedProfile = await api.upsertProfile(existingProfile => {
        console.log('[AtprotoService] Existing profile before update:', existingProfile);
        
        const existing = existingProfile ?? {};
        
        // Update display name if provided
        if (updates.displayName !== undefined) {
          (existing as any).displayName = updates.displayName;
        }
        
        // Update description if provided
        if (updates.description !== undefined) {
          (existing as any).description = updates.description;
        }
        
        // Handle avatar upload if provided
        if (updates.avatar) {
          // The avatar will be uploaded separately and set via the blob reference
          // We'll handle this in the main function
        }
        
        console.log('[AtprotoService] Profile after updates:', existing);
        return existing;
      });
      
      // Handle avatar upload separately if provided
      if (updates.avatar) {
        try {
          console.log('[AtprotoService] Processing avatar upload:', updates.avatar);
          
          // Check if this is a CDN URL (existing avatar) - we can't re-upload these
          if (updates.avatar.startsWith('https://') && updates.avatar.includes('cdn.bsky.app')) {
            console.log('[AtprotoService] Skipping upload for existing CDN avatar');
            
            // Don't proceed with upload for existing avatars
            return;
          }
          
          let imageBlob: Blob;
          
          if (updates.avatar.startsWith('data:')) {
            // Handle base64 data URL
            const response = await fetch(updates.avatar);
            imageBlob = await response.blob();
          } else if (updates.avatar.startsWith('file://')) {
            // Handle file URI
            const response = await fetch(updates.avatar);
            imageBlob = await response.blob();
          } else {
            throw new Error('Unsupported avatar format');
          }

          console.log('[AtprotoService] Image blob created, size:', imageBlob.size);

          // Upload the image to Bluesky
          const { api } = await this.getApiClient();
          const uploadResult = await api.uploadBlob(imageBlob, {
            encoding: 'image/jpeg'
          });

          console.log('[AtprotoService] Avatar uploaded successfully:', uploadResult.data.blob);

          // Update profile with the new avatar
          await api.upsertProfile(existingProfile => {
            const existing = existingProfile ?? {};
            (existing as any).avatar = uploadResult.data.blob;
            return existing;
          });
          
          console.log('[AtprotoService] Profile updated with new avatar');
        } catch (error) {
          console.error('[AtprotoService] Error uploading avatar:', error);
          throw new Error('Failed to upload avatar image');
        }
      }

      // Return the updated profile
      return await this.getCurrentUser();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  /**
   * Upload an image and return the blob reference
   * @param imageUri - URI of the image to upload (file:// or data:)
   * @returns Blob reference for the uploaded image
   */
  static async uploadImage(imageUri: string): Promise<any> {
    try {
      await this.ensureSession();
      
      let imageBlob: Blob;
      
      if (imageUri.startsWith('data:')) {
        // Handle base64 data URL
        const response = await fetch(imageUri);
        imageBlob = await response.blob();
      } else if (imageUri.startsWith('file://')) {
        // Handle file URI
        const response = await fetch(imageUri);
        imageBlob = await response.blob();
      } else {
        throw new Error('Unsupported image format');
      }

      // Upload the image to Bluesky
      const { api } = await this.getApiClient();
      const uploadResult = await api.uploadBlob(imageBlob, {
        encoding: 'image/jpeg'
      });

      return uploadResult.data.blob;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  /**
   * Fetch suggested accounts to follow using the Bluesky API
   * @param limit - Number of suggestions to fetch (default 20)
   * @returns Array of suggested profile objects
   */
  static async getSuggestedAccounts(limit: number = 20): Promise<any[]> {
    const { api } = await this.getApiClient();
    try {
      const response = await api.app.bsky.actor.getSuggestions({ limit });
      return response.data.actors || [];
    } catch (error: any) {
      console.error('Error fetching suggested accounts:', error);
      return [];
    }
  }

  /**
   * Get followers for a user
   * @param actor - User DID or handle
   * @param cursor - Pagination cursor
   * @param limit - Number of followers to fetch
   * @returns Promise with followers data
   */
  static async getFollowers(actor: string, cursor: string | null = null, limit: number = 100): Promise<{ followers: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      const params: any = { actor, limit };
      if (cursor) params.cursor = cursor;
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.graph.getFollowers(params);
      return { 
        followers: response.data.followers || [], 
        cursor: response.data.cursor || null 
      };
    } catch (error: any) {
      console.error('Error fetching followers:', error);
      return { followers: [], cursor: null };
    }
  }

  /**
   * Get following list for a user
   * @param actor - User DID or handle
   * @param cursor - Pagination cursor
   * @param limit - Number of following to fetch
   * @returns Promise with following data
   */
  static async getFollowing(actor: string, cursor: string | null = null, limit: number = 100): Promise<{ following: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      const params: any = { actor, limit };
      if (cursor) params.cursor = cursor;
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.graph.getFollows(params);
      return { 
        following: response.data.follows || [], 
        cursor: response.data.cursor || null 
      };
    } catch (error: any) {
      console.error('Error fetching following:', error);
      return { following: [], cursor: null };
    }
  }

  /**
   * Get all followers for a user (paginated)
   * @param actor - User DID or handle
   * @returns Promise with all followers
   */
  static async getAllFollowers(actor: string): Promise<any[]> {
    const allFollowers = [];
    let cursor = null;
    let hasMore = true;
    
    while (hasMore) {
      const response = await this.getFollowers(actor, cursor, 100);
      allFollowers.push(...response.followers);
      cursor = response.cursor;
      hasMore = !!cursor;
    }
    
    return allFollowers;
  }

  /**
   * Get all following for a user (paginated)
   * @param actor - User DID or handle
   * @returns Promise with all following
   */
  static async getAllFollowing(actor: string): Promise<any[]> {
    const allFollowing = [];
    let cursor = null;
    let hasMore = true;
    
    while (hasMore) {
      const response = await this.getFollowing(actor, cursor, 100);
      allFollowing.push(...response.following);
      cursor = response.cursor;
      hasMore = !!cursor;
    }
    
    return allFollowing;
  }

  /**
   * Get mutual connections (users you follow who also follow you)
   * @param userDid - User DID
   * @returns Promise with mutual connections
   */
  static async getMutualConnections(userDid: string): Promise<any[]> {
    try {
      const [followers, following] = await Promise.all([
        this.getAllFollowers(userDid),
        this.getAllFollowing(userDid)
      ]);
      
      // Find mutual connections
      const followerDids = new Set(followers.map(f => f.did));
      const mutualConnections = following.filter(followingUser => 
        followerDids.has(followingUser.did)
      );
      
      return mutualConnections;
    } catch (error: any) {
      console.error('Error fetching mutual connections:', error);
      return [];
    }
  }

  /**
   * Get engagement data for a specific post
   * @param uri - Post URI
   * @returns Promise with engagement data
   */
  static async getPostEngagement(uri: string): Promise<{ likes: any[], reposts: any[], replies: any[] }> {
    try {
      const [likesResponse, commentsResponse] = await Promise.all([
        this.getLikes(uri, null, 100),
        this.getComments(uri, null, 100)
      ]);
      
      // For reposts, we need to check the post thread
      const { api } = await this.getApiClient();
      const postThread = await api.app.bsky.feed.getPostThread({ uri });
      const reposts = (postThread.data.thread as any)?.repostCount || 0;
      
      return {
        likes: likesResponse.likes,
        reposts: [], // Repost data not directly available via API
        replies: commentsResponse.comments
      };
    } catch (error: any) {
      console.error('Error fetching post engagement:', error);
      return { likes: [], reposts: [], replies: [] };
    }
  }

  /**
   * Search for popular feed generators (channels) with query support
   * @param query - Search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects filtered for video-only feeds
   */
  static async searchPopularFeeds(query: string, limit: number = 5): Promise<any[]> {
    await this.ensureSession();
    try {
      // Get experimental feeds setting first
      const experimentalFeedsEnabled = await AsyncStorage.getItem('experimental_feeds_enabled');
      const isEnabled = experimentalFeedsEnabled === null ? true : experimentalFeedsEnabled === 'true';
      
      // If experimental feeds are disabled, request more feeds to ensure we get enough video-only results
      const requestLimit = isEnabled ? limit : Math.max(limit * 3, 15);
      const params = { limit: requestLimit, query: query };
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);
      
      // Filter and mark feeds
      const allFeeds = response.data.feeds || [];
      const processedFeeds = allFeeds.map((feed: any) => {
        const isVideoOnly = feed.contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          isExperimental: !isVideoOnly
        };
      });
      
      // Filter based on experimental setting
      let filteredFeeds = processedFeeds;
      if (!experimentalFeedsEnabled) {
        filteredFeeds = processedFeeds.filter((feed: any) => !feed.isExperimental);
      }
      
      // Return the requested number of results (or all if fewer than requested)
      return filteredFeeds.slice(0, limit);
    } catch (error: any) {
      console.error('Error searching popular feeds:', error);
      return [];
    }
  }

  /**
   * Get suggested feed generators (channels) without search query, filtered for video-only feeds
   * @param limit - Number of results to return
   * @returns Array of feed generator objects filtered for video-only feeds
   */
  static async getSuggestedFeeds(limit: number = 10): Promise<any[]> {
    await this.ensureSession();
    try {
      // Get experimental feeds setting first
      const experimentalFeedsEnabled = await AsyncStorage.getItem('experimental_feeds_enabled');
      const isEnabled = experimentalFeedsEnabled === null ? true : experimentalFeedsEnabled === 'true';
      
      // If experimental feeds are disabled, request more feeds to ensure we get enough video-only results
      const requestLimit = isEnabled ? limit : Math.max(limit * 3, 30);
      const params = { limit: requestLimit };
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);
      
      // Filter and mark feeds
      const allFeeds = response.data.feeds || [];
      const processedFeeds = allFeeds.map((feed: any) => {
        const isVideoOnly = feed.contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          isExperimental: !isVideoOnly
        };
      });
      
      // Filter based on experimental setting
      let filteredFeeds = processedFeeds;
      if (!experimentalFeedsEnabled) {
        filteredFeeds = processedFeeds.filter((feed: any) => !feed.isExperimental);
      }
      
      // Return the requested number of results (or all if fewer than requested)
      return filteredFeeds.slice(0, limit);
    } catch (error: any) {
      console.error('Error fetching suggested feeds:', error);
      return [];
    }
  }

  /**
   * Get feed generator details by URI
   * @param uri - Feed generator URI
   * @returns Feed generator details
   */
  static async getFeedGenerator(uri: string): Promise<any> {
    await this.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://')) {
        console.error('Invalid feed generator URI:', uri);
        return null;
      }
      
      const params = { feed: uri };
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.feed.getFeedGenerator(params);
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting feed generator:', error);
      if (error.message?.includes('feed must be a valid at-uri')) {
        console.error(`Invalid feed URI provided: ${uri}`);
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
    await this.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://') || !uri.includes('/app.bsky.feed.generator/')) {
        console.warn('[AtprotoService] Invalid feed generator URI for subscriber count:', uri);
        return 0;
      }
      
      // Get the feed generator details first
      const params = { feed: uri };
      
      const { api } = await this.getApiClient();
      const generatorResponse = await api.app.bsky.feed.getFeedGenerator(params);
      
      if (!generatorResponse.data?.view?.likeCount) {
        return 0;
      }
      
      return generatorResponse.data.view.likeCount;
    } catch (error: any) {
      console.error('Error getting feed generator subscriber count:', error);
      return 0;
    }
  }

  /**
   * Get feed generator details by URI with pagination support
   * @param uri - Feed generator URI
   * @param cursor - Pagination cursor
   * @param limit - Number of posts to fetch
   * @returns Feed generator details with posts
   */
  static async getFeedGeneratorWithPosts(uri: string, cursor: string | null = null, limit: number = 50): Promise<{ generator: any, posts: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://') || !uri.includes('/app.bsky.feed.generator/')) {
        console.warn('[AtprotoService] Invalid feed generator URI for posts:', uri);
        return { generator: null, posts: [], cursor: null };
      }
      
      // Get generator details
      const generatorParams = { feed: uri };
      
      const { api } = await this.getApiClient();
      const generatorResponse = await api.app.bsky.feed.getFeedGenerator(generatorParams);
      
      // Get feed posts
      const feedResponse = await this.getFeed(cursor, uri, {}, true);
      
      return {
        generator: generatorResponse.data,
        posts: feedResponse.feed,
        cursor: feedResponse.cursor
      };
    } catch (error: any) {
      console.error('Error getting feed generator with posts:', error);
      return { generator: null, posts: [], cursor: null };
    }
  }

  /**
   * Get user's moderation preferences from Bluesky
   * @returns Promise with moderation preferences
   */
  static async getModerationPreferences(): Promise<any> {
    await this.ensureSession();
    try {
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.actor.getPreferences();
      return response.data;
    } catch (error: any) {
      console.error('Error fetching moderation preferences:', error);
      return null;
    }
  }

  /**
   * Update user's moderation preferences on Bluesky
   * @param preferences - Full preferences object to update
   * @returns Promise indicating success
   */
  static async updateModerationPreferences(preferences: any): Promise<boolean> {
    await this.ensureSession();
    try {
      const { api } = await this.getApiClient();
      await api.app.bsky.actor.putPreferences(preferences);
      return true;
    } catch (error: any) {
      console.error('Error updating moderation preferences:', error);
      return false;
    }
  }

  /**
   * Get user's blocked users list from Bluesky
   * @returns Promise with blocked users
   */
  static async getBlockedUsersFromAPI(): Promise<string[]> {
    await this.ensureSession();
    try {
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.graph.getBlocks({
        limit: 100
      });
      return response.data.blocks?.map((block: any) => block.did) || [];
    } catch (error: any) {
      return [];
    }
  }

  /**
   * Get user's muted users list from Bluesky
   * @returns Promise with muted users
   */
  static async getMutedUsersFromAPI(): Promise<string[]> {
    await this.ensureSession();
    try {
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.graph.getMutes({
        limit: 100
      });
      return response.data.mutes?.map((mute: any) => mute.did) || [];
    } catch (error: any) {
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
  static async searchVideosPaginated(query: string, cursor: string | null = null, limit: number = 20): Promise<{ videos: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      let params: any = { limit };
      if (cursor !== null && cursor !== undefined) params.cursor = cursor;
      
      // Use search posts endpoint for query-based search
      let response: any;
      if (query && query.trim()) {
        // Search for posts with the query
        const { api } = await this.getApiClient();
        response = await api.app.bsky.feed.searchPosts({
          q: query,
          limit,
          cursor: cursor || undefined
        });
      } else {
        // Return empty results when no query is provided
        return { videos: [], cursor: null };
      }
      
      let posts = response?.data?.posts || response?.data?.feed || [];
      
      // Filter for video posts only and normalize structure
      const videoPosts = posts.filter((item: any) => {
        const post = item.post || item;
        const embed = post.embed;
        if (!embed) return false;
        
        // Check for video embeds
        if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
          return true;
        } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
          return embed.media?.$type === 'app.bsky.embed.video' || embed.media?.$type === 'app.bsky.embed.video#view';
        }
        return false;
      });
      
      // Normalize video structure for UI consumption
      const videos = videoPosts.map((item: any) => {
        const post = item.post || item;
        return {
          ...post,
          // Ensure we have the expected structure for the UI
          uri: post.uri,
          cid: post.cid,
          author: post.author,
          text: post.record?.text || '',
          embed: post.embed,
          likeCount: post.likeCount || 0,
          indexedAt: post.indexedAt
        };
      });
      
      return {
        videos,
        cursor: response?.data?.cursor || null
      };
    } catch (error) {
      console.error('Error searching videos:', error);
      return { videos: [], cursor: null };
    }
  }



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
        uri && (uri.startsWith('at://') || uri.startsWith('did:'))
      );
      
      if (validFeedUris.length === 0) {
        console.warn('[AtprotoService] No valid feed URIs provided for mixed feed');
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
          console.warn('Failed to parse mixed feed cursor, starting fresh');
          feedStates = {};
        }
      } else {
        // Initialize feeds with null cursors
        limitedFeedUris.forEach(feedUri => {
          feedStates[feedUri] = null;
        });
      }

      // Fetch from feeds in parallel
      const feedPromises = limitedFeedUris.map(async (feedUri) => {
        try {
          const feedCursor = feedStates[feedUri] || null;
          const feedLimit = Math.floor(limit / limitedFeedUris.length) + 10; // Distribute limit across feeds
          
          const response = await this.getFeed(feedCursor, feedUri, {}, filterVideosOnly, feedLimit, 'custom');
          
          return {
            posts: response.feed || [],
            cursor: response.cursor,
            feedUri
          };
        } catch (error) {
          console.warn(`Failed to fetch feed ${feedUri}:`, error);
          return {
            posts: [],
            cursor: null,
            feedUri
          };
        }
      });

      const feedResults = await Promise.all(feedPromises);
      
      // Update feed states with new cursors
      feedResults.forEach(result => {
        feedStates[result.feedUri] = result.cursor;
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
      
      // Create cursor from active feeds
      const activeFeedStates: { [feedUri: string]: string | null } = {};
      feedResults.forEach(result => {
        if (result.cursor !== null) {
          activeFeedStates[result.feedUri] = result.cursor;
        }
      });
      
      const compositeCursor = Object.keys(activeFeedStates).length > 0 ? JSON.stringify(activeFeedStates) : null;
      
      return {
        feed: limitedPosts,
        cursor: compositeCursor
      };
    } catch (error) {
      console.error('Error fetching mixed feed:', error);
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
      await this.ensureSession();

      const collected: any[] = [];
      let nextCursor: string | null = cursor || null;
      let safetyCounter = 0;

      // Aggressively page until we have enough items or run out
      while (collected.length < limit && safetyCounter < 10) {
        safetyCounter++;

        const params: any = {
          actor,
          limit: Math.min(100, Math.max(limit, 50)),
          ...(nextCursor ? { cursor: nextCursor } : {}),
          // Use a posts-only filter that still includes reposts; do not use media/video filters
          filter: 'posts_no_replies' as AuthorFilter,
        };

        let response: any;
        try {
          const { api } = await this.getApiClient();
          response = await api.app.bsky.feed.getAuthorFeed(params);
        } catch (err: any) {
          console.warn('Reposts author feed error:', err?.message || err);
          break;
        }

        const feedChunk: any[] = response?.data?.feed || [];
        if (feedChunk.length === 0) {
          nextCursor = null;
          break;
        }

        // Keep only items that are reposts
        const reposts = feedChunk.filter((item: any) =>
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
    } catch (error: any) {
      console.error('Error fetching reposted videos:', error);
      return { feed: [], cursor: null };
    }
  }

  /**
   * Deduplicate posts based on URI and CID
   */
  private static deduplicatePosts(posts: any[]): any[] {
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
   * Get static channels from the web API
   * @param limit - Number of results to return
   * @returns Array of feed generator objects
   */
  static async getStaticChannels(limit: number = 10): Promise<any[]> {
    try {
      const channelDids = await StaticChannelsService.getChannels();
      
      if (!channelDids || channelDids.length === 0) {
        return [];
      }

      // Directly fetch feed generators using the URIs
      const feedGenerators = await Promise.all(
        channelDids.map(async (uri) => {
          try {
                  const { api } = await this.getApiClient();
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
            console.warn(`Error fetching feed generator for ${uri}:`, error);
            return null;
          }
        })
      );

      // Filter out null results and return up to the limit
      return feedGenerators.filter(Boolean).slice(0, limit);
    } catch (error: any) {
      console.error('Error fetching static channels:', error);
      return [];
    }
  }


}

// Use a named export to ensure TypeScript picks up the type correctly
export { AtprotoService };
// Keep the default export for backward compatibility
export default AtprotoService;