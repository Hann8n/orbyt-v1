import { AtpAgent, RichText, AtUri } from '@atproto/api';
import * as SecureStore from 'expo-secure-store';
import { storageHelpers } from '../../utils/storage';
import { Platform } from 'react-native';
import { ModerationDecision, ModerationSettings, LabelPreference, ModerationOpts, LabelDefinition } from '../ModerationTypes';
import { AtProtoOAuthService } from '../auth/OAuthService';
import { StaticChannelsService } from '../APIService';
import { logger } from '../../utils/logger';


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
  // Cache resolved PDS endpoints per DID for cross-PDS reads
  private static _pdsEndpointCache = new Map<string, string>();
  private static _sessionPromise: Promise<any> | null = null;
  private static _sessionCache: {
    oauth: { session: any; timestamp: number } | null;
  } = {
    oauth: null
  };
  private static readonly SESSION_CACHE_TTL = 60 * 1000; // 1 minute
  
  // Request deduplication cache to prevent multiple identical API calls
  private static _requestCache = new Map<string, { promise: Promise<any>; timestamp: number }>();
  private static readonly REQUEST_CACHE_TTL = 2000; // 2 second deduplication window
  
  /**
   * Initialize supporting services
   */
  static async initializeServices(): Promise<void> {
    // Services initialized as needed
  }
  
  /**
   * Deduplicate API requests to prevent multiple identical calls
   */
  private static async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    
    // Check if we have a recent identical request
    const cached = this._requestCache.get(key);
    if (cached && (now - cached.timestamp) < this.REQUEST_CACHE_TTL) {
      return cached.promise;
    }
    
    // Create new request and cache it
    const promise = requestFn();
    this._requestCache.set(key, { promise, timestamp: now });
    
    // Clean up expired entries
    for (const [k, v] of this._requestCache.entries()) {
      if (now - v.timestamp > this.REQUEST_CACHE_TTL) {
        this._requestCache.delete(k);
      }
    }
    
    return promise;
  }
  
  // Custom caching removed - React Query handles all caching

  /**
   * Resolve a DID's PDS service endpoint via PLC and cache it.
   */
  static async resolvePdsEndpointForDid(did: string): Promise<string | null> {
    try {
      if (!did) return null;
      const cached = this._pdsEndpointCache.get(did);
      if (cached) return cached;

      const url = `https://plc.directory/${encodeURIComponent(did)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = await res.json();
      const services = Array.isArray(doc?.service) ? doc.service : [];
      const pds = services.find((s: any) =>
        (typeof s?.type === 'string' && s.type.includes('AtprotoPersonalDataServer')) ||
        (typeof s?.id === 'string' && s.id.includes('atproto_pds'))
      );
      const endpoint = pds?.serviceEndpoint || null;
      if (endpoint) {
        this._pdsEndpointCache.set(did, endpoint);
      }
      return endpoint;
    } catch {
      return null;
    }
  }

  /**
   * Create an unauthenticated agent targeting the repo's PDS for cross-PDS reads.
   */
  static async getAgentForRepo(did: string): Promise<AtpAgent | null> {
    const endpoint = await this.resolvePdsEndpointForDid(did);
    if (!endpoint) return null;
    try {
      return new AtpAgent({ service: endpoint });
    } catch {
      return null;
    }
  }



  /**
   * Ensures a valid session exists (OAuth or app password)
   * This optimized version prevents duplicate session checks when multiple
   * queries fire at once
   */
  static async ensureSession(): Promise<any> {
    // Since we now get the agent from userStore in getApiClient,
    // this method just needs to verify that we have a valid session
    try {
      const { useUserStore } = await import('../../stores/userStore');
      const userStore = useUserStore.getState();
      
      if (userStore.agent && userStore.currentUser?.did) {
        return { did: userStore.currentUser.did, type: 'oauth' };
      }
      
      throw new Error('No valid session found');
    } catch (error) {
      logger.error('Session check failed', error, { component: 'AtprotoService' });
      throw error;
    }
  }

  /**
   * Get the current user's DID from session (OAuth or app password)
   */
  static async getCurrentUserDid(): Promise<string | null> {
    try {
      const { useUserStore } = await import('../../stores/userStore');
      const userStore = useUserStore.getState();
      
      if (userStore.currentUser?.did) {
        return userStore.currentUser.did;
      }
      
      logger.debug('No current user found', { component: 'AtprotoService' });
      return null;
    } catch (error) {
      logger.error('Error getting current user DID', error, { component: 'AtprotoService' });
      return null;
    }
  }

  /**
   * Get the API client (OAuth or app password)
   * Gets the current Agent from userStore
   * Returns null if no session is available (instead of throwing)
   */
  static async getApiClient(): Promise<{ api: any; isOAuth: boolean } | null> {
    try {
      // Import userStore to get the current agent
      const { useUserStore } = await import('../../stores/userStore');
      const userStore = useUserStore.getState();
      
      // Check if session restoration is in progress
      if (userStore.isAuthenticating || userStore.isSwitchingAccount) {
        // Session restoration in progress - return null gracefully
        return null;
      }
      
      if (userStore.agent) {
        return { api: userStore.agent.api, isOAuth: true };
      }
      
      // No session available - return null instead of throwing
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      // Only log unexpected errors at ERROR level
      logger.error('Error getting API client', error, { component: 'AtprotoService' });
      return null;
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
        const apiClient = await this.getApiClient();
        
        // Handle case where no session is available
        if (!apiClient) {
          return { feed: [], cursor: null };
        }
        
        const { api, isOAuth } = apiClient;

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
            logger.error('Author feed error', authorError, { component: 'AtprotoService' });
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
            logger.error('Likes feed error', likesError, { component: 'AtprotoService' });
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
            logger.warn('No feed specified, returning empty feed', { component: 'AtprotoService' });
            return { feed: [], cursor: null };
          }
          
          // Validate AT-URI format
          if (!feed.startsWith('at://') && !feed.startsWith('did:')) {
            logger.warn(`Invalid feed URI format: ${feed}`, { component: 'AtprotoService' });
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
            logger.error('Custom feed error', customFeedError, { component: 'AtprotoService' });
            // Check if it's a feed validation error
            if (customFeedError.message && customFeedError.message.includes('feed must be a valid at-uri')) {
              logger.warn(`Invalid feed URI: ${feed}`, { component: 'AtprotoService' });
              return { feed: [], cursor: null };
            }
            return { feed: [], cursor: null };
          }
        }
        
        // Ensure the response has the expected data structure
        if (!response?.data || !response.data.feed) {
          logger.warn('Unexpected feed response format', { component: 'AtprotoService' });
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
      // First try to get the current user DID
      const userDid = await this.getCurrentUserDid();
      if (!userDid) {
        logger.debug('No user DID available', { component: 'AtprotoService' });
        throw new Error('No session available');
      }
      
      // Then get the API client
      const apiClient = await this.getApiClient();
      if (!apiClient || !apiClient.api) {
        throw new Error('No API client available');
      }
      
      const { api, isOAuth } = apiClient;
      
      // Getting profile for DID using session
      const response = await api.app.bsky.actor.getProfile({ actor: userDid });
      
      // Cache the profile data
      if (response?.data) {
        // Successfully retrieved user profile
      }
      
      return response.data;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting current user', error, { component: 'AtprotoService' });
      
      // Check if this is a session error and clear the session cache
      if (errorMsg.includes('session') || errorMsg.includes('auth') || errorMsg.includes('token')) {
        logger.debug('Clearing session cache due to session error', { component: 'AtprotoService' });
        this._sessionCache = { oauth: null };
      }
      
      throw error;
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
      const apiClient = await this.getApiClient();
      
      // Handle case where no session is available or restoration is in progress
      if (!apiClient) {
        return { conversations: [], cursor: null };
      }
      
      const { api } = apiClient;
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-bsky-service': 'did:web:api.bsky.chat'
      };
      
      // Get the current agent from userStore
      const { useUserStore } = await import('../../stores/userStore');
      const userStore = useUserStore.getState();
      
      if (!userStore.agent) {
        logger.debug('No OAuth session available for conversations', { component: 'AtprotoService' });
        return { conversations: [], cursor: null };
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
        return { conversations: [], cursor: null };
      }
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const json = await response.json();
      return { conversations: json.convos || [], cursor: json.cursor || null };
    } catch (error: unknown) {
      logger.error('Error fetching conversations', error, { component: 'AtprotoService' });
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
        logger.warn('Service not implemented (HTTP 501), returning empty messages', { component: 'AtprotoService' });
        return { messages: [], cursor: null };
      }
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const json = await response.json();
      return { messages: json.logs, cursor: json.cursor || null };
    } catch (error: unknown) {
      logger.error('Error fetching messages', error, { component: 'AtprotoService' });
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
   * Create a bookmark for a post
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The post URI (bookmark URI not needed since deleteBookmark uses post URI)
   */
  static async createBookmark(uri: string, cid: string): Promise<string> {
    await this.ensureSession();
    const { api } = await this.getApiClient();
    
    try {
      const response = await api.app.bsky.bookmark.createBookmark({
        uri,
        cid,
      });
      
      // The bookmark is successfully created. We don't need the bookmark URI
      // since deleteBookmark uses the post URI. Return the post URI for consistency.
      return uri;
    } catch (error: unknown) {
      throw error;
    }
  }

  /**
   * Delete a bookmark
   * @param bookmarkUri - The URI of the bookmark to delete
   */
  static async deleteBookmark(postUri: string): Promise<void> {
    await this.ensureSession();
    const { api } = await this.getApiClient();
    
    try {
      // The deleteBookmark API expects the post URI (same as createBookmark)
      await api.app.bsky.bookmark.deleteBookmark({
        uri: postUri,
      });
    } catch (error: unknown) {
      throw error;
    }
  }

  /**
   * Get bookmarks for the current user
   * @param cursor - Pagination cursor
   * @param limit - Number of bookmarks to fetch
   * @returns Object with bookmarks array and cursor
   */
  static async getBookmarks(cursor?: string, limit: number = 50): Promise<{ bookmarks: any[], cursor: string | null }> {
    await this.ensureSession();
    const apiClient = await this.getApiClient();
    
    if (!apiClient) {
      return { bookmarks: [], cursor: null };
    }
    
    const { api } = apiClient;
    
    try {
      const response = await api.app.bsky.bookmark.getBookmarks({
        limit,
        cursor,
      });
      
      // The API returns bookmarks with the post data in bookmark.item
      // bookmark.subject is just a reference (RepoStrongRef with uri and cid)
      const allBookmarks = response.data?.bookmarks || [];
      
      const bookmarks = allBookmarks.filter((bookmark: any) => {
        // Check if it's a valid post bookmark
        // bookmark.item should contain the post view
        // bookmark.subject is the reference to the original post
        const subjectUri = bookmark.subject?.uri;
        const itemUri = bookmark.item?.uri;
        const uri = subjectUri || itemUri;
        
        // Check if it's a post (not blocked or not found)
        const isBlocked = bookmark.item?.$type === 'app.bsky.feed.defs#blockedPost';
        const isNotFound = bookmark.item?.$type === 'app.bsky.feed.defs#notFoundPost';
        const isPost = bookmark.item?.$type === 'app.bsky.feed.defs#postView' || 
                      (!!bookmark.item && !isBlocked && !isNotFound);
        
        const isValid = uri && uri.includes('app.bsky.feed.post') && isPost;
        
        return isValid;
      });
      
      // Transform bookmarks: use bookmark.item for the post data
      // bookmark.subject is just the reference, bookmark.item has the full post
      const transformedBookmarks = bookmarks.map((bookmark: any) => {
        // bookmark.item contains the full post view
        // bookmark.subject is the reference (uri, cid) to the original post
        const post = bookmark.item;
        
        if (!post) {
          return null;
        }
        
        // Return the post data - we don't need bookmarkUri since delete uses post URI
        // But we can include it for reference if needed
        return {
          ...post,
          // Include bookmark reference for potential future use
          bookmarkSubject: bookmark.subject,
        };
      }).filter((b: any) => b !== null); // Remove any null entries
      
      return {
        bookmarks: transformedBookmarks,
        cursor: response.data?.cursor || null,
      };
    } catch (error: unknown) {
      console.error('[AtprotoService] getBookmarks error:', error);
      if (error && typeof error === 'object' && 'message' in error) {
        console.error('[AtprotoService] Error message:', error.message);
        console.error('[AtprotoService] Error details:', JSON.stringify(error, null, 2));
      }
      throw error;
    }
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
    const { api } = await this.getApiClient();
    
    // If no parent is specified, reply directly to the post (parent = root)
    const actualParentUri = parentUri || rootUri;
    const actualParentCid = parentCid || rootCid;
    
    // Use official RichText API to detect facets
    const richText = new RichText({ text: text || '' });
    await richText.detectFacets(api);
    
    const postRecord: any = {
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
   * @returns The response from creating the post
   */
  static async createVideoPost(
    text: string,
    videoPath: string,
    contentWarnings?: string[],
    commentFilter?: 'all' | 'followers' | 'mentioned' | 'none',
    feedSlug?: string
  ): Promise<any> {
    await this.ensureSession();
    
    try {
      logger.info('Starting video post creation', {
        component: 'AtprotoService',
        videoPath: videoPath?.substring(0, 50) + '...',
        textLength: text?.length || 0,
        contentWarnings,
        commentFilter,
        feedSlug
      });

      // Validate video file
      if (!videoPath || !videoPath.startsWith('file://')) {
        logger.error('Invalid video path', new Error('Invalid video path'), {
          component: 'AtprotoService',
          videoPath
        });
        throw new Error('Invalid video path');
      }

      logger.debug('Fetching video file', { component: 'AtprotoService' });
      // Upload video directly to PDS
      let videoBlob: Blob;
      try {
        const videoResponse = await fetch(videoPath);
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch video: ${videoResponse.status} ${videoResponse.statusText}`);
        }
        videoBlob = await videoResponse.blob();
        
        logger.info('Video blob created', {
          component: 'AtprotoService',
          blobSize: videoBlob.size,
          blobType: videoBlob.type,
          videoPath: videoPath.substring(0, 100) + '...'
        });
      } catch (fetchError: any) {
        logger.error('Failed to fetch/create video blob', fetchError, {
          component: 'AtprotoService',
          videoPath: videoPath.substring(0, 100) + '...',
          errorMessage: fetchError?.message,
          errorStack: fetchError?.stack
        });
        throw new Error(`Failed to create video blob: ${fetchError?.message || 'Unknown error'}`);
      }
      
      const { api } = await this.getApiClient();
      logger.debug('Uploading video blob to PDS', {
        component: 'AtprotoService',
        blobSize: videoBlob.size,
        blobType: videoBlob.type
      });
      
      let blobData: any;
      try {
        blobData = await api.com.atproto.repo.uploadBlob(videoBlob, {
          encoding: 'video/mp4'
        });
      } catch (uploadError: any) {
        logger.error('Failed to upload video blob to PDS', uploadError, {
          component: 'AtprotoService',
          blobSize: videoBlob.size,
          blobType: videoBlob.type,
          errorMessage: uploadError?.message,
          errorStack: uploadError?.stack,
          errorResponse: uploadError?.response,
          errorData: uploadError?.data,
          errorStatus: uploadError?.status,
          errorStatusText: uploadError?.statusText
        });
        throw new Error(`Failed to upload video blob: ${uploadError?.message || 'Network request failed'}`);
      }
      
      const { data } = blobData;
      
      logger.info('Video blob uploaded successfully', {
        component: 'AtprotoService',
        blobRef: data.blob.ref?.$link,
        blobSize: data.blob.size,
        blobMimeType: data.blob.mimeType
      });
      
      // Get video aspect ratio
      logger.debug('Getting video aspect ratio', { component: 'AtprotoService' });
      const aspectRatio = await this.getVideoAspectRatio(videoPath);
      logger.debug('Video aspect ratio', { component: 'AtprotoService', aspectRatio });

      // Use official RichText API to detect facets
      logger.debug('Processing rich text', { component: 'AtprotoService' });
      const richText = new RichText({ text: text || '' });
      await richText.detectFacets(api);
      logger.debug('Rich text processed', {
        component: 'AtprotoService',
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
      const postRecord: any = {
        $type: 'app.bsky.feed.post',
        text: richText.text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: 'app.bsky.embed.video',
          video: data.blob,
          aspectRatio
        },
        tags: tags
      };

      // Add facets if they exist (from RichText API)
      if (richText.facets && richText.facets.length > 0) {
        postRecord.facets = richText.facets;
      }

      // Add content warnings if provided
      // Map UI labels to valid Bluesky self-label values
      // Only these values are valid for self-labeling: porn, sexual, nudity, graphic-media, !no-unauthenticated
      if (contentWarnings && contentWarnings.length > 0) {
        logger.debug('Processing content warnings', {
          component: 'AtprotoService',
          inputWarnings: contentWarnings
        });
        
        const validLabels = contentWarnings
          .map(warning => {
            // Remove 'other:' prefix if present (custom warnings aren't valid for self-labeling)
            const cleanWarning = warning.startsWith('other:') ? null : warning;
            if (!cleanWarning) {
              logger.debug('Filtered out custom warning', {
                component: 'AtprotoService',
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
                component: 'AtprotoService',
                warning: cleanWarning
              });
            }
            
            return mappedLabel;
          })
          .filter((label): label is string => label !== null);
        
        logger.info('Content warnings mapped', {
          component: 'AtprotoService',
          inputWarnings: contentWarnings,
          validLabels
        });
        
        if (validLabels.length > 0) {
          // Self-labels should be an array of selfLabel objects
          // Each object has $type: 'com.atproto.label.defs#selfLabel' and val: string
          postRecord.selfLabels = validLabels.map(label => ({
            $type: 'com.atproto.label.defs#selfLabel',
            val: label
          }));
          logger.debug('Self-labels added to post record', {
            component: 'AtprotoService',
            selfLabels: postRecord.selfLabels,
            validLabels
          });
        } else {
          logger.warn('No valid labels after mapping', {
            component: 'AtprotoService',
            inputWarnings: contentWarnings
          });
        }
      }

      logger.info('Post record prepared', {
        component: 'AtprotoService',
        recordType: postRecord.$type,
        hasText: !!postRecord.text,
        hasEmbed: !!postRecord.embed,
        hasSelfLabels: !!postRecord.selfLabels,
        selfLabelsCount: postRecord.selfLabels?.length || 0,
        tags: postRecord.tags
      });

      // Create the post
      logger.debug('Sending post to API', { component: 'AtprotoService' });
      const postResponse = await api.post(postRecord);
      logger.info('Post created successfully', {
        component: 'AtprotoService',
        uri: postResponse.uri,
        cid: postResponse.cid
      });

      // Set comment filtering if specified
      if (commentFilter && commentFilter !== 'all') {
        try {
          logger.debug('Setting comment filter', {
            component: 'AtprotoService',
            commentFilter
          });
          await this.setCommentFilter(postResponse.uri, commentFilter);
          logger.debug('Comment filter set successfully', { component: 'AtprotoService' });
        } catch (error) {
          logger.error('Failed to set comment filter', error, { component: 'AtprotoService' });
        }
      }

      return postResponse;
    } catch (error: unknown) {
      const errorDetails = {
        component: 'AtprotoService',
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
          component: 'AtprotoService',
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
   * @param videoPath - Path to the video file
   * @returns Aspect ratio object with width and height
   */
  private static async getVideoAspectRatio(videoPath: string): Promise<{ width: number; height: number }> {
    try {
      // For React Native, we'll use a default aspect ratio
      // In a real implementation, you might want to use a video metadata library
      return { width: 9, height: 16 }; // Default to 9:16 (portrait)
    } catch (error) {
      return { width: 9, height: 16 };
    }
  }

  /**
   * Get video upload limits for the authenticated user
   * @returns Upload limits including remainingDailyVideos, remainingDailyBytes, and canUpload flag
   */
  static async getUploadLimits(): Promise<{
    canUpload: boolean;
    remainingDailyVideos?: number;
    remainingDailyBytes?: number;
    message?: string;
    error?: string;
  }> {
    try {
      await this.ensureSession();
      const { api } = await this.getApiClient();
      
      const response = await api.app.bsky.video.getUploadLimits();
      
      return {
        canUpload: response.data.canUpload ?? true,
        remainingDailyVideos: response.data.remainingDailyVideos,
        remainingDailyBytes: response.data.remainingDailyBytes,
        message: response.data.message,
        error: response.data.error,
      };
    } catch (error: unknown) {
      logger.error('Error getting upload limits', error, { component: 'AtprotoService' });
      // Return default values if API call fails
      return {
        canUpload: true,
        remainingDailyVideos: undefined,
        remainingDailyBytes: undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
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
    } catch (error: unknown) {
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
      logger.debug('Setting thread gate', {
        component: 'AtprotoService',
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
      } catch (uriError: any) {
        logger.error('Failed to parse post URI', uriError, {
          component: 'AtprotoService',
          postUri
        });
        throw new Error(`Invalid post URI: ${uriError?.message || 'Could not parse URI'}`);
      }
      
      // Create threadgate record based on filter
      // According to Bluesky docs:
      // - followerRule: allows replies from users who follow you
      // - followingRule: allows replies from users you follow
      // - mentionRule: allows replies from users mentioned in the post
      let allow: any[] = [];
      
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
        component: 'AtprotoService',
        rkey,
        allowRules: allow.length,
        recordType: record.$type
      });
      
      const { api } = await this.getApiClient();
      const userDid = await this.getCurrentUserDid();
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
        component: 'AtprotoService',
        rkey,
        filter,
        allowRules: allow.length
      });
    } catch (error: unknown) {
      logger.error('Failed to set comment filter', error, {
        component: 'AtprotoService',
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
   * @param limit - Number of comments per page (not used currently as API doesn't support it)
   * @param depth - How many levels of replies to include (default 2 for parent comments and their replies)
   * @returns Array of comments and next cursor
   */
  static async getComments(postUri: string, cursor: string | null = null, limit: number = 25): Promise<{ comments: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      // Use Bluesky threading parameters
      // depth: how many levels of replies to fetch (6 is standard for full threading)
      // parentHeight: how many parent levels to include (0 = only direct replies to root post)
      const params: any = { 
        uri: postUri,
        depth: 6, // Fetch up to 6 levels of nested replies (Bluesky standard)
        parentHeight: 0 // Only get direct replies to the root post
      };
      if (cursor) params.cursor = cursor;
      
      const { api } = await this.getApiClient();
      
      // Use getPostThread (V2 may not be available in all SDK versions)
      // The threading structure is preserved through parent/replies relationships
      const response = await api.app.bsky.feed.getPostThread(params);
      
      // Log raw API response for debugging reply structure
      // This shows the actual API response structure before processing
      logger.debug('Raw API response for comments', {
        component: 'AtprotoService',
        action: 'getComments',
        postUri,
        rawResponse: JSON.stringify(response.data, null, 2),
      });
      
      
      // Function to recursively process thread posts with proper typing
      // Preserves Bluesky's threading structure with parent/child relationships
      const processThreadViewPost = (post: ThreadPost, parent: any = null): any => {
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
          replies: [] as any[],
          parent: parent || null // Preserve parent reference for threading
        };

        // Process replies if they exist, passing current post as parent
        if (post.replies && Array.isArray(post.replies)) {
          result.replies = post.replies
            .map((reply: ThreadPost) => processThreadViewPost(reply, result))
            .filter(Boolean);
        }

        return result;
      };

      // Get the thread from response
      const thread = response.data.thread as ThreadPost;
      let comments: any[] = [];
      
      // Process replies at the root level (top-level comments have no parent)
      if (thread && thread.$type === 'app.bsky.feed.defs#threadViewPost' && thread.replies) {
        comments = thread.replies
          .map((reply: ThreadPost) => processThreadViewPost(reply, null))
          .filter(Boolean);
      }

      return {
        comments,
        cursor: (response.data as any).cursor || null
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
      return { profiles: [], cursor: null };
    }
  }

  /**
   * Get profile by DID with caching for performance
   * @param did - User DID
   * @returns Profile data
   */
  static async getProfileByDid(did: string): Promise<any> {
    return this.deduplicateRequest(`profile_did_${did}`, async () => {
      // React Query handles caching - no custom cache needed
      const { api } = await this.getApiClient();
      try {
        const response = await api.app.bsky.actor.getProfile({
          actor: did,
        });
        
        // The profile response already includes verification data
        // No need for separate API calls - verification data is included in the profile
        return response.data;
      } catch (error: unknown) {
        return null;
      }
    });
  }

  /**
   * Get profile by handle with caching for performance (legacy)
   * @param handle - User handle
   * @returns Profile data
   */
  static async getProfile(handle: string): Promise<any> {
    return this.deduplicateRequest(`profile_${handle}`, async () => {
      // React Query handles caching - no custom cache needed
      const { api } = await this.getApiClient();
      try {
        const response = await api.app.bsky.actor.getProfile({
          actor: handle,
        });
        
        // The profile response already includes verification data
        // No need for separate API calls - verification data is included in the profile
        return response.data;
      } catch (error: unknown) {
        return null;
      }
    });
  }

  /**
   * Batch fetch multiple actor profiles efficiently
   * Uses Bluesky's native batch endpoint to fetch up to 25 profiles per request
   * Automatically deduplicates and chunks requests into batches of 25
   * 
   * @param handles - Array of actor handles to fetch
   * @returns Array of actor profiles
   */
  static async getProfilesInBatch(handles: string[]): Promise<any[]> {
    if (!handles || handles.length === 0) {
      return [];
    }

    try {
      await this.ensureSession();
      const { api } = await this.getApiClient();
      
      // Deduplicate and normalize handles
      const uniqueHandles = Array.from(new Set(
        handles
          .map(h => h?.toLowerCase())
          .filter(h => !!h && typeof h === 'string')
      ));
      
      if (uniqueHandles.length === 0) {
        return [];
      }

      // Single handle optimization
      if (uniqueHandles.length === 1) {
        try {
          const profile = await api.app.bsky.actor.getProfile({ 
            actor: uniqueHandles[0] 
          });
          return [profile.data];
        } catch (error) {
          logger.warn(`Failed to fetch profile ${uniqueHandles[0]}:`, error);
          return [];
        }
      }

      // Batch into chunks of 25 (API limit)
      const BATCH_SIZE = 25;
      const batches: string[][] = [];
      
      for (let i = 0; i < uniqueHandles.length; i += BATCH_SIZE) {
        batches.push(uniqueHandles.slice(i, i + BATCH_SIZE));
      }

      // Fetch all batches in parallel
      const batchPromises = batches.map(batch =>
        api.app.bsky.actor.getProfiles({ actors: batch })
          .then(response => response?.data?.profiles || [])
          .catch(error => {
            logger.warn(`Failed to fetch batch of profiles:`, error);
            return [];
          })
      );

      const results = await Promise.all(batchPromises);

      // Flatten results
      return results.flat();
    } catch (error) {
      logger.error('Error in getProfilesInBatch:', error);
      return [];
    }
  }

  /**
   * Follow a user
   * @param did - User DID to follow
   * @returns Follow URI
   */
  static async follow(did: string): Promise<string> {
    const { api } = await this.getApiClient();
    
    // Get the current user DID from userStore
    const { useUserStore } = await import('../../stores/userStore');
    const userStore = useUserStore.getState();
    if (!userStore.currentUser?.did) {
      throw new Error('No OAuth session available');
    }
    const userDid = userStore.currentUser.did;
    
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
    } catch (error: unknown) {
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
    
    // Get the current user DID from userStore
    const { useUserStore } = await import('../../stores/userStore');
    const userStore = useUserStore.getState();
    if (!userStore.currentUser?.did) {
      throw new Error('No OAuth session available');
    }
    const userDid = userStore.currentUser.did;
    
    try {
      // Get the profile by DID to get the viewer.following
      const profileResponse = await api.app.bsky.actor.getProfile({ actor: did });
      if (!profileResponse.data.viewer?.following) {
        return false;
      }
      
      // Extract the rkey from the follow URI
      // URI format: at://did:plc:xxxx/app.bsky.graph.follow/rkey
      const uriParts = profileResponse.data.viewer.following.split('/');
      const rkey = uriParts[uriParts.length - 1];
      
      if (!rkey) {
        return false;
      }
      
      // Delete the follow using the record key
      await api.app.bsky.graph.follow.delete({
        repo: userDid,
        rkey: rkey,
      });
      
      return true;
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      throw error;
    }
  }

  /**
   * Mute a user
   * @param did - User DID to mute
   * @returns Promise indicating success
   */
  static async muteUser(did: string): Promise<boolean> {
    try {
      await this.ensureSession();
      
      const { api } = await this.getApiClient();
      
      await api.app.bsky.graph.muteActor({
        actor: did
      });
      
      return true;
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Unmute a user
   * @param did - User DID to unmute
   * @returns Promise indicating success
   */
  static async unmuteUser(did: string): Promise<boolean> {
    try {
      await this.ensureSession();
      
      const { api } = await this.getApiClient();
      
      await api.app.bsky.graph.unmuteActor({
        actor: did
      });
      
      return true;
    } catch (error: unknown) {
      return false;
    }
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
    } catch (error: unknown) {
      return null;
    }
  }

  /**
   * Check if a post is NotFoundPost or BlockedPost using $type field
   */
  static isNotFoundPost(post: any): boolean {
    return post?.$type === 'app.bsky.feed.defs#notFoundPost';
  }

  static isBlockedPost(post: any): boolean {
    return post?.$type === 'app.bsky.feed.defs#blockedPost';
  }

  /**
   * Check if a post is a valid post view (not NotFoundPost or BlockedPost)
   */
  static isValidPost(post: any): boolean {
    if (!post) return false;
    return !this.isNotFoundPost(post) && !this.isBlockedPost(post);
  }

  /**
   * Batch fetch multiple posts by URI
   * Uses app.bsky.feed.getPosts which accepts up to 25 URIs at once
   * @param uris - Array of post URIs to fetch
   * @returns Map of URI to post data (includes NotFoundPost and BlockedPost objects)
   */
  static async getPosts(uris: string[]): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    if (!uris.length) return result;

    try {
      await this.ensureSession();
      const { api } = await this.getApiClient();
      
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
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Send video feedback (show more/show less) to the appropriate feed provider
   * Uses the app.bsky.feed.sendInteractions API to communicate preferences to feed generators
   * @param postUri - The post URI to send feedback for
   * @param type - Type of feedback: 'interested' (show more) or 'not_interested' (show less)
   * @param sourceFeed - Optional source feed URI where the post came from (for accurate interaction routing)
   * @param feedContext - Optional context string from the feed generator (for tracking)
   */
  static async sendVideoFeedback(
    postUri: string, 
    type: 'interested' | 'not_interested', 
    sourceFeed?: string,
    feedContext?: string
  ): Promise<void> {
    try {
      await this.ensureSession();
      
      // Get the current user's DID from OAuth session
      const userDid = await this.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }

      // Determine target feed for the interaction
      // Priority: 1. sourceFeed (if post came from an algorithmic feed)
      //           2. User's selected algorithmic feed provider
      //           3. null (no target, just store locally)
      let targetFeed: string | null = null;
      
      // Import algorithmic feed providers to check if sourceFeed is one of them
      const { ALGORITHMIC_FEED_PROVIDERS, useUserStore } = await import('../../stores/userStore');
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
        const { api } = await this.getApiClient();
        
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
          component: 'AtprotoService', 
          postUri, 
          event, 
          targetFeed 
        });
      }
      
    } catch (error: unknown) {
      // Log error but don't throw - interactions are best-effort
      logger.warn('Failed to send feed interaction', { 
        component: 'AtprotoService', 
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

  static async listNotifications(cursor: string | null = null, limit = 50): Promise<{ notifications: any[]; cursor: string | null }> {
    await this.ensureSession();
    try {
      const apiClient = await this.getApiClient();
      if (!apiClient) {
        return { notifications: [], cursor: null };
      }
      
      const { api } = apiClient;
      
      // Verify we have a valid API client
      if (!api || !api.app || !api.app.bsky || !api.app.bsky.notification) {
        logger.error('Invalid API client structure for listNotifications', { component: 'AtprotoService' });
        throw new Error('Invalid API client');
      }
      
      const params: { cursor?: string, limit: number } = { 
        limit
      };
      if (cursor !== null) {
        params.cursor = cursor;
      }
      
      const response = await api.app.bsky.notification.listNotifications(params);
      
      return { 
        notifications: response.data.notifications || [], 
        cursor: response.data.cursor || null 
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error fetching notifications', error, { 
        component: 'AtprotoService',
        cursor,
        limit,
        errorMessage: errorMsg
      });
      throw error; // Re-throw so the UI can handle it properly
    }
  }

  /**
   * Mark all notifications as seen for the current user
   * @returns Promise indicating success
   */
  static async updateNotificationSeen(): Promise<void> {
    await this.ensureSession();
    try {
      const apiClient = await this.getApiClient();
      if (!apiClient) {
        return; // Non-critical operation, fail silently
      }
      
      const { api } = apiClient;
      // Call the Bluesky API to mark notifications as seen
      // This uses the current timestamp as the seenAt parameter
      await api.app.bsky.notification.updateSeen({
        seenAt: new Date().toISOString()
      });
    } catch (error: unknown) {
      // Non-critical operation, fail silently
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
    } catch (error: unknown) {
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
      let subject: { $type?: string; uri?: string; cid?: string; did?: string } = {};
      
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
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Clear app password session from storage
   */

  /**
   * Clear all caches - no-op since React Query handles all caching
   */
  static clearAllCaches(): void {
    // React Query handles all caching - no custom cache to clear
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
    } catch (error: unknown) {
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
      await this.ensureSession();
      
      // Use the correct upsertProfile method as per Bluesky documentation
      const { api } = await this.getApiClient();
      const updatedProfile = await api.upsertProfile(existingProfile => {
        
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
        
        return existing;
      });
      
      // Handle avatar upload separately if provided
      if (updates.avatar) {
        try {
          
          // Check if this is a CDN URL (existing avatar) - we can't re-upload these
          if (updates.avatar.startsWith('https://') && updates.avatar.includes('cdn.bsky.app')) {
            
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


          // Upload the image to Bluesky
          const { api } = await this.getApiClient();
          const uploadResult = await api.uploadBlob(imageBlob, {
            encoding: 'image/jpeg'
          });


          // Update profile with the new avatar
          await api.upsertProfile(existingProfile => {
            const existing = existingProfile ?? {};
            (existing as any).avatar = uploadResult.data.blob;
            return existing;
          });
          
        } catch (error) {
          throw new Error('Failed to upload avatar image');
        }
      }

      // Return the updated profile
      return await this.getCurrentUser();
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      return { likes: [], reposts: [], replies: [] };
    }
  }

  /**
   * Search for popular feed generators (channels) with query support
   * @param query - Search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects
   */
  static async searchPopularFeeds(query: string, limit: number = 5): Promise<any[]> {
    await this.ensureSession();
    try {
      const params = { limit: limit, query: query };
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);
      
      // Return all feeds without filtering
      const allFeeds = response.data.feeds || [];
      
      // Extract contentMode from API response (may be at feed.contentMode or feed.view?.contentMode)
      // If contentMode is missing, derive it from isExperimental flag
      const processedFeeds = allFeeds.map((feed: any) => {
        let contentMode = feed.contentMode || feed.view?.contentMode;
        
        // Fallback: if contentMode is missing but isExperimental exists, derive it
        if (!contentMode && feed.isExperimental !== undefined) {
          contentMode = feed.isExperimental 
            ? undefined // Non-video feed (no contentMode set)
            : 'app.bsky.feed.defs#contentModeVideo'; // Video-only feed
        }
        
        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
          isExperimental: !isVideoOnly
        };
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
  static async getSuggestedFeeds(limit: number = 10): Promise<any[]> {
    await this.ensureSession();
    try {
      const params = { limit: limit };
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);
      
      // Return all feeds without filtering
      const allFeeds = response.data.feeds || [];
      
      // Extract contentMode from API response (may be at feed.contentMode or feed.view?.contentMode)
      // If contentMode is missing, derive it from isExperimental flag
      const processedFeeds = allFeeds.map((feed: any) => {
        let contentMode = feed.contentMode || feed.view?.contentMode;
        
        // Fallback: if contentMode is missing but isExperimental exists, derive it
        if (!contentMode && feed.isExperimental !== undefined) {
          contentMode = feed.isExperimental 
            ? undefined // Non-video feed (no contentMode set)
            : 'app.bsky.feed.defs#contentModeVideo'; // Video-only feed
        }
        
        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
          isExperimental: !isVideoOnly
        };
      });
      
      return processedFeeds;
    } catch (error: unknown) {
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
        return null;
      }
      
      const params = { feed: uri };
      
      const { api } = await this.getApiClient();
      const response = await api.app.bsky.feed.getFeedGenerator(params);
      
      return response.data;
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
    await this.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://') || !uri.includes('/app.bsky.feed.generator/')) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      return [];
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
  static async searchHashtagVideosPaginated(hashtag: string, cursor: string | null = null, limit: number = 20, sort: 'top' | 'latest' = 'latest'): Promise<{ videos: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      let params: any = { limit };
      if (cursor !== null && cursor !== undefined) params.cursor = cursor;
      
      // Search for posts with hashtag (include # in search query)
      const searchQuery = `#${hashtag}`;
      const { api } = await this.getApiClient();
      
      // Build search params - only include sort if it's 'top'
      const searchParams: any = {
        q: searchQuery,
        limit,
      };
      if (cursor) {
        searchParams.cursor = cursor;
      }
      if (sort === 'top') {
        searchParams.sort = 'top';
      }
      
      const response = await api.app.bsky.feed.searchPosts(searchParams);
      
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
          post: {
            ...post,
            uri: post.uri,
            cid: post.cid,
            author: post.author,
            record: post.record,
            embed: post.embed,
            likeCount: post.likeCount || 0,
            repostCount: post.repostCount || 0,
            replyCount: post.replyCount || 0,
            indexedAt: post.indexedAt,
            viewer: post.viewer || {}
          },
          uniqueKey: post.uri,
        };
      });
      
      return { 
        videos, 
        cursor: response?.data?.cursor || null 
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
    await this.ensureSession();
    try {
      const { api } = await this.getApiClient();
      
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
      for (const item of posts) {
        const post = item.post || item;
        const text = post.record?.text || '';
        
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
        uri && typeof uri === 'string' && (uri.startsWith('at://') || uri.startsWith('did:'))
      );
      
      if (validFeedUris.length === 0) {
        logger.warn('No valid feed URIs provided to getMixedFeed', { component: 'AtprotoService' });
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
          logger.warn('Failed to parse cursor for mixed feed', { component: 'AtprotoService', error });
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
            component: 'AtprotoService', 
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
        logger.error('All feeds failed in getMixedFeed', { component: 'AtprotoService', feedUris: limitedFeedUris });
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
      logger.error('Error in getMixedFeed', { component: 'AtprotoService', error });
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
    } catch (error: unknown) {
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
  

  /**
   * Fetch the orbyt profile record for the current user
   */
  static async getOrbytProfileRecord(): Promise<any | null> {
    try {
      const userDid = await this.getCurrentUserDid();
      if (!userDid) return null;
      const { api } = await this.getApiClient();
      try {
        const rec = await api.com.atproto.repo.getRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        return rec?.data?.value || null;
      } catch (e) {
        // Fallback: try listRecords once
        try {
          const list = await api.com.atproto.repo.listRecords({
            repo: userDid,
            collection: 'com.getorbyt.profile',
            limit: 1,
          });
          const first = list?.data?.records?.[0]?.value;
          return first || null;
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }
  }

  /**
   * Fetch the orbyt profile record for any DID by hitting that DID's PDS directly
   */
  static async getOrbytProfileRecordForDid(did: string): Promise<any | null> {
    try {
      if (!did) return null;
      const agent = await this.getAgentForRepo(did);
      if (!agent) return null;
      // Prefer stable rkey 'self'
      try {
        const rec = await agent.api.com.atproto.repo.getRecord({
          repo: did,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        return rec?.data?.value || null;
      } catch {
        try {
          const list = await agent.api.com.atproto.repo.listRecords({
            repo: did,
            collection: 'com.getorbyt.profile',
            limit: 1,
          });
          return list?.data?.records?.[0]?.value || null;
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }
  }

  /**
   * Fetch both profile records (standard and custom) using listRecords in parallel
   * This ensures both records are always fetched together
   */
  static async getProfileRecordsForDid(did: string): Promise<{
    profileRecord: any | null;
    orbytRecord: any | null;
  }> {
    try {
      if (!did) return { profileRecord: null, orbytRecord: null };
      
      const agent = await this.getAgentForRepo(did);
      if (!agent) return { profileRecord: null, orbytRecord: null };

      // Fetch both records in parallel using listRecords
      const [profileRecords, orbytRecords] = await Promise.all([
        agent.api.com.atproto.repo.listRecords({
          repo: did,
          collection: 'app.bsky.actor.profile',
          limit: 1,
        }).catch((err) => {
          console.log('[getProfileRecordsForDid] profileRecords error:', err);
          return { data: { records: [] } };
        }),
        agent.api.com.atproto.repo.listRecords({
          repo: did,
          collection: 'com.getorbyt.profile',
          limit: 1,
        }).catch((err) => {
          console.log('[getProfileRecordsForDid] orbytRecords error:', err);
          return { data: { records: [] } };
        })
      ]);

      const profileRecord = profileRecords?.data?.records?.[0]?.value || null;
      const orbytRecord = orbytRecords?.data?.records?.[0]?.value || null;

      return {
        profileRecord,
        orbytRecord,
      };
    } catch {
      return { profileRecord: null, orbytRecord: null };
    }
  }

  /**
   * Create or update the orbyt profile record with a stable rkey 'self'
   */
  static async upsertOrbytProfileRecord(update: {
    joinDate?: string;
    colors?: { backgroundColor: string; textColor: string } | null;
    subscribedChannels?: string[];
    algorithmicFeedProvider?: string | null;
  }): Promise<boolean> {
    try {
      const userDid = await this.getCurrentUserDid();
      if (!userDid) return false;
      const apiClient = await this.getApiClient();
      if (!apiClient) {
        return false;
      }
      const { api } = apiClient;

      // Read existing
      let existing: any | null = null;
      try {
        const rec = await api.com.atproto.repo.getRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        existing = rec?.data?.value || null;
      } catch {}

      const nowIso = new Date().toISOString();
      const nextRecord: any = {
        $type: 'com.getorbyt.profile',
        joinDate: existing?.joinDate || update.joinDate || nowIso,
        updatedAt: nowIso,
        // Preserve prior fields unless overridden
        colors: update.colors === undefined ? existing?.colors || null : update.colors,
        subscribedChannels: update.subscribedChannels ?? existing?.subscribedChannels ?? [],
        algorithmicFeedProvider: update.algorithmicFeedProvider === undefined ? existing?.algorithmicFeedProvider ?? null : update.algorithmicFeedProvider,
      };

      if (existing) {
        // putRecord
        await api.com.atproto.repo.putRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
          record: nextRecord,
        });
      } else {
        // createRecord
        await api.com.atproto.repo.createRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
          record: nextRecord,
        });
      }
      return true;
    } catch (error) {
      logger.error('Error upserting com.getorbyt.profile', error, { component: 'AtprotoService' });
      return false;
    }
  }

  /**
   * Initialize "com.getorbyt.profile" on first login if missing
   */
  static async initOrbytProfileIfNeeded(): Promise<void> {
    try {
      const existing = await this.getOrbytProfileRecord();
      if (existing) return;

      const userDid = await this.getCurrentUserDid();
      if (!userDid) return;

      // No legacy migration; initialize without colors by default
      let colors: { backgroundColor: string; textColor: string } | null = null;

      // Pull current subscribed channels from userStore (filter built-ins)
      let subscribedChannels: string[] = [];
      try {
        const { useUserStore } = await import('../../stores/userStore');
        const channels = useUserStore.getState().subscribedChannels || [];
        const allUris = channels.map((c: any) => c.uri).filter(Boolean);
        // Filter out built-in channels
        const BUILT_IN_CHANNELS = ['following', 'your-mix'];
        subscribedChannels = allUris.filter((uri: string) => !BUILT_IN_CHANNELS.includes(uri));
      } catch {}

      // Pull current algorithmic feed provider from userStore
      let algorithmicFeedProvider: string | null = null;
      try {
        const { useUserStore, ALGORITHMIC_FEED_PROVIDERS } = await import('../../stores/userStore');
        const provider = useUserStore.getState().algorithmicFeedProvider;
        // Use current value or default to Bluesky Video
        algorithmicFeedProvider = provider ?? ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri;
      } catch {}

      await this.upsertOrbytProfileRecord({
        joinDate: new Date().toISOString(),
        colors,
        subscribedChannels,
        algorithmicFeedProvider,
      });
    } catch {
      // best-effort only
    }
  }

  /**
   * Update only colors in orbyt profile record
   */
  static async updateOrbytProfileColors(backgroundColor: string, textColor: string): Promise<void> {
    await this.upsertOrbytProfileRecord({
      colors: { backgroundColor, textColor },
    });
  }

  /**
   * Update subscribed channels in orbyt profile record
   */
  static async updateOrbytProfileChannels(channelUris: string[]): Promise<void> {
    // Filter out built-in channels before saving
    const BUILT_IN_CHANNELS = ['following', 'your-mix'];
    const filteredUris = (channelUris || []).filter(uri => !BUILT_IN_CHANNELS.includes(uri));
    await this.upsertOrbytProfileRecord({
      subscribedChannels: Array.from(new Set(filteredUris)),
    });
  }

  /**
   * Update algorithmic feed provider in orbyt profile record
   */
  static async updateOrbytProfileAlgorithmicFeedProvider(uri: string | null): Promise<void> {
    await this.upsertOrbytProfileRecord({
      algorithmicFeedProvider: uri,
    });
  }

  /**
   * Subscribe to activity notifications from a user
   * @param did - DID of the user to subscribe to
   * @param preferences - Activity subscription preferences (post/reply). Defaults to both true.
   * @returns Promise resolving to subscription status
   */
  static async putActivitySubscription(
    did: string,
    preferences: { post: boolean; reply: boolean } = { post: true, reply: true },
  ): Promise<{ subject: string; activitySubscription?: any }> {
    try {
      const { api } = await this.getApiClient();
      
      if (!api) {
        throw new Error('No API client available');
      }

      // Cannot subscribe to yourself
      const currentUserDid = await this.getCurrentUserDid();
      if (currentUserDid === did) {
        throw new Error('Cannot subscribe to your own activity');
      }

      const response = await api.app.bsky.notification.putActivitySubscription({
        subject: did,
        activitySubscription: {
          post: preferences.post,
          reply: preferences.reply,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error subscribing to activity', error, { component: 'AtprotoService', did });
      throw error;
    }
  }

  /**
   * Unsubscribe from activity notifications from a user
   * @param did - DID of the user to unsubscribe from
   * @returns Promise resolving to subscription status
   */
  static async deleteActivitySubscription(did: string): Promise<void> {
    try {
      const { api } = await this.getApiClient();
      
      if (!api) {
        throw new Error('No API client available');
      }

      await api.app.bsky.notification.putActivitySubscription({
        subject: did,
        activitySubscription: {
          post: false,
          reply: false,
        },
      });
    } catch (error) {
      logger.error('Error unsubscribing from activity', error, { component: 'AtprotoService', did });
      throw error;
    }
  }

  /**
   * List all activity subscriptions (users you're subscribed to)
   * @param cursor - Pagination cursor
   * @returns Promise with list of subscribed profiles
   */
  static async listActivitySubscriptions(cursor?: string): Promise<{ cursor?: string; subscriptions: any[] }> {
    try {
      const { api } = await this.getApiClient();
      
      if (!api) {
        throw new Error('No API client available');
      }

      const params: any = {};
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await api.app.bsky.notification.listActivitySubscriptions(params);

      return {
        cursor: response.data.cursor,
        subscriptions: response.data.subscriptions || [],
      };
    } catch (error) {
      logger.error('Error listing activity subscriptions', error, { component: 'AtprotoService' });
      return { subscriptions: [] };
    }
  }

  /**
   * Check if subscribed to a specific user's activity
   * @param did - DID of the user to check
   * @returns Promise resolving to true if subscribed
   */
  static async isSubscribedToActivity(did: string): Promise<boolean> {
    try {
      // Fetch all subscriptions and check if this DID is in the list
      const { subscriptions } = await this.listActivitySubscriptions();
      return subscriptions.some((sub: any) => sub.did === did);
    } catch (error) {
      logger.error('Error checking subscription status', error, { component: 'AtprotoService', did });
      return false;
    }
  }

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
            return null;
          }
        })
      );

      // Filter out null results and return up to the limit
      return feedGenerators.filter(Boolean).slice(0, limit);
    } catch (error: unknown) {
      return [];
    }
  }


}

// Use a named export to ensure TypeScript picks up the type correctly
export { AtprotoService };
// Keep the default export for backward compatibility
export default AtprotoService;