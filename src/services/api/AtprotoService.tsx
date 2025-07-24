import { AtpAgent } from '@atproto/api';
import * as SecureStore from 'expo-secure-store';
import { ModerationDecision, ModerationSettings, LabelPreference, ModerationFilters, ModerationOpts, LabelDefinition } from '../ModerationTypes';

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

class AtprotoService {
  static agent = new AtpAgent({ service: SERVICE_URL });
  private static _sessionPromise: Promise<any> | null = null;

  static async login(handle: string, appPassword: string, saveAccount: boolean = true): Promise<any> {
    try {
      const response = await this.agent.login({
        identifier: handle,
        password: appPassword,
      });
      await SecureStore.setItemAsync('session', JSON.stringify(response.data));
      await SecureStore.setItemAsync(
        'credentials',
        JSON.stringify({ handle, appPassword })
      );
      // console.log('Logged in Successfully: ' + response.data.did);
      
      // Save account to AccountManager if requested
      if (saveAccount) {
        try {
          const AccountManager = (await import('../storage/AccountManager')).default;
          await AccountManager.saveAccount(handle, appPassword, (response.data as any).displayName, (response.data as any).avatar);
        } catch (error) {
          console.warn('Failed to save account to AccountManager:', error);
        }
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Login failed:', error.message, error.stack);
      throw error;
    }
  }

  /**
   * Ensures a valid session exists, refreshing if needed
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
        let sessionStr = await SecureStore.getItemAsync('session');
        let session = sessionStr ? JSON.parse(sessionStr) : null;
        if (!session) {
          throw new Error('Not authenticated. Please log in first.');
        }
        
        try {
          await this.agent.resumeSession(session);
        } catch (error: any) {
          if (error.message && error.message.toLowerCase().includes('expired')) {
            console.warn('Session expired. Attempting to refresh...');
            const credStr = await SecureStore.getItemAsync('credentials');
            const creds = credStr ? JSON.parse(credStr) : null;
            if (creds) {
              session = await this.login(creds.handle, creds.appPassword);
            } else {
              throw new Error('Session expired and no stored credentials available.');
            }
          } else {
            throw error;
          }
        }
        return session;
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
    filterVideosOnly: boolean = true
  ): Promise<FeedResponse> {
    let retries = 3;
    
    while (retries > 0) {
      try {
        await this.ensureSession();
        let response: any;
        
        // Only use timeline for explicit following feed, not for null
        if (feedLink === 'at://following') {
          try {
            const params: any = { 
              limit: 100, // Maximum limit for better batch loading
              cursor: cursor || undefined,
              algorithm: 'reverse-chronological',
            };
            
            response = await this.agent.api.app.bsky.feed.getTimeline(params);
          } catch (timelineError: any) {
            console.warn('Timeline fetch error:', timelineError.message);
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
          
          // If feedLink is null or empty, return empty feed
          if (!feed) {
            console.warn('[AtprotoService] No feed specified, returning empty feed');
            return { feed: [], cursor: null };
          }
          
          const params: any = { 
            feed, 
            limit: 100 // Maximum limit for better batch loading
          };
          if (cursor) params.cursor = cursor;
          
          try {
            response = await this.agent.api.app.bsky.feed.getFeed(params);
          } catch (customFeedError: any) {
            console.warn('Custom feed error:', customFeedError.message);
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
        if (filterVideosOnly && feedData.length > 0) {
          feedData = this.filterVideoPostsEfficiently(feedData);
        }
        
        // Apply content moderation at fetch level to reduce downstream compute
        if (feedData.length > 0) {
          const { ModerationService } = await import('../ModerationService');
          const moderationResult = await ModerationService.batchModeratePosts(feedData);
          // Attach moderationDecision to each item
          const moderationMap = moderationResult.moderationDecisions;
          feedData = moderationResult.filteredPosts.map(item => {
            const uri = item?.post?.uri;
            return uri && moderationMap.has(uri)
              ? { ...item, moderationDecision: moderationMap.get(uri) }
              : item;
          });
        }
        
        return { feed: feedData, cursor: response.data.cursor };
      } catch (error: any) {
        retries--;
        console.error(`Error fetching feed (${retries} retries left):`, error.message, error.stack);
        
        if (retries <= 0) {
          console.error('Failed to fetch feed after multiple attempts');
          return { feed: [], cursor: null };
        }
        
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
      await this.ensureSession();
      const sessionStr = await SecureStore.getItemAsync('session');
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      const response = await this.agent.api.app.bsky.actor.getProfile({ actor: session.did });
      return response.data;
    } catch (error: any) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Simplified author feed fetch that returns feed items or an empty result on error.
   */
  static async getAuthorFeed(userDid?: string, cursor: string | null = null, limit: number = 100, filterVideosOnly: boolean = true): Promise<FeedResponse> {
    await this.ensureSession();
    let resolvedDid = userDid;
    if (!resolvedDid) {
      const sessionStr = await SecureStore.getItemAsync('session');
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      resolvedDid = session?.did;
    }
    try {
      const params: any = { actor: resolvedDid, limit: 100 }; // Always use maximum limit
      if (cursor) params.cursor = cursor;
      const response = await this.agent.api.app.bsky.feed.getAuthorFeed(params);
      
      let feedData = response.data.feed || [];
      
      // Filter for video posts if requested
      if (filterVideosOnly && feedData.length > 0) {
        feedData = await this.filterVideoPostsEfficiently(feedData);
      }
      
      // Apply content moderation at fetch level to reduce downstream compute
      if (feedData.length > 0) {
        const { ModerationService } = await import('../ModerationService');
        const moderationResult = await ModerationService.batchModeratePosts(feedData);
        // Attach moderationDecision to each item
        const moderationMap = moderationResult.moderationDecisions;
        feedData = moderationResult.filteredPosts.map(item => {
          const uri = item?.post?.uri;
          return uri && moderationMap.has(uri)
            ? { ...item, moderationDecision: moderationMap.get(uri) }
            : item;
        });
      }
      
      return { feed: feedData, cursor: response.data.cursor || null };
    } catch (error: any) {
      console.error('Error fetching author feed:', error);
      return { feed: [], cursor: null };
    }
  }

  /**
   * Fetch conversations for React Query
   * @returns Promise with conversations data
   */
  static async getConversations(cursor: string | null = null): Promise<ConversationsResponse> {
    try {
      const session = await this.ensureSession();
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-bsky-service': 'did:web:api.bsky.chat'
      };
      if (session && session.accessJwt) {
        headers['Authorization'] = `Bearer ${session.accessJwt}`;
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
      const session = await this.ensureSession();
      const params = new URLSearchParams({ convoId, limit: '50' });
      if (cursor) {
        params.append('cursor', cursor);
      }
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-bsky-service': 'did:web:api.bsky.chat'
      };
      if (session && session.accessJwt) {
        headers['Authorization'] = `Bearer ${session.accessJwt}`;
      }
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
      const session = await this.ensureSession();
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-bsky-service': 'did:web:api.bsky.chat'
      };
      if (session && session.accessJwt) {
        headers['Authorization'] = `Bearer ${session.accessJwt}`;
      }
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
    await this.ensureSession();
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    const record = {
      $type: 'app.bsky.feed.like' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    try {
      const response = await this.agent.api.app.bsky.feed.like.create({ repo: session.did }, record);
      return response.uri;
    } catch (error: any) {
      console.error('Like creation error:', error);
      throw error;
    }
  }

  static async deleteLike(likeUri: string): Promise<void> {
    await this.ensureSession();
    await this.agent.deleteLike(likeUri);
  }

  static async repostPost(uri: string, cid: string): Promise<string> {
    await this.ensureSession();
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    const record = {
      $type: 'app.bsky.feed.repost' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    try {
      const response = await this.agent.api.app.bsky.feed.repost.create({ repo: session.did }, record);
      return response.uri;
    } catch (error: any) {
      console.error('Repost creation error:', error);
      throw error;
    }
  }

  static async deleteRepost(repostURI: string): Promise<void> {
    await this.ensureSession();
    await this.agent.deleteRepost(repostURI);
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
    
    const postRecord: any = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      reply: {
        root: { uri: rootUri, cid: rootCid },
        parent: { uri: actualParentUri, cid: actualParentCid },
      },
    };
    
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
              const uploadResult = await this.agent.uploadBlob(blob, {
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
    
    const commentResponse = await this.agent.post(postRecord);
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
      
      const { data } = await this.agent.com.atproto.repo.uploadBlob(videoBlob, {
        encoding: 'video/mp4'
      });
      
      // Get video aspect ratio
      const aspectRatio = await this.getVideoAspectRatio(videoPath);

      // Create the post with video embed
      const postRecord: any = {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: 'app.bsky.embed.video',
          video: data.blob,
          aspectRatio
        }
      };

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
      const postResponse = await this.agent.post(postRecord);

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
      const uploadResult = await this.agent.uploadBlob(videoBlob, {
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
      const sessionStr = await SecureStore.getItemAsync('session');
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      
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
      
      await this.agent.api.com.atproto.repo.createRecord({
        repo: session.did,
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
      
      const response = await this.agent.api.app.bsky.feed.getPostThread(params);
      
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
      
      const response = await this.agent.api.app.bsky.feed.getLikes(params);
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
      const response = await this.agent.api.app.bsky.actor.searchActors({
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
      const response = await this.agent.api.app.bsky.actor.searchActors(params);
      
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
   * Get profile by handle
   * @param handle - User handle
   * @returns Profile data
   */
  static async getProfile(handle: string): Promise<any> {
    await this.ensureSession();
    try {
      const response = await this.agent.api.app.bsky.actor.getProfile({
        actor: handle,
      });
      
      // The profile response already includes verification data
      // No need for separate API calls - verification data is included in the profile
      return response.data;
    } catch (error: any) {
      console.error('Error getting profile:', error);
      return null;
    }
  }

  /**
   * Follow a user
   * @param did - User DID to follow
   * @returns Follow URI
   */
  static async follow(did: string): Promise<string> {
    await this.ensureSession();
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    
    const record = {
      $type: 'app.bsky.graph.follow' as const,
      subject: did,
      createdAt: new Date().toISOString(),
    };
    
    try {
      const response = await this.agent.api.app.bsky.graph.follow.create(
        { repo: session.did }, 
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
    await this.ensureSession();
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;
    
    try {
      // Find the follow record
      const follows = await this.agent.api.app.bsky.graph.getFollows({
        actor: session.did,
        limit: 50,
      });
      
      const followRecord = follows.data.follows.find(
        (follow: any) => follow.did === did
      );
      
      if (!followRecord) {
        console.log('Follow record not found');
        return false;
      }
      
      // Extract the rkey from the follow record URI
      // URI format: at://did:plc:xxxx/app.bsky.graph.follow/rkey
      const uriParts = (followRecord as any).uri?.split('/') || [];
      const rkey = uriParts[uriParts.length - 1];
      
      // Delete the follow using the record key
      await this.agent.api.app.bsky.graph.follow.delete({
        repo: session.did,
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
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;

    try {
      await this.agent.api.app.bsky.graph.block.delete({
        repo: session.did,
        rkey: did,
      });
    } catch (error: any) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }

  static async blockUser(did: string): Promise<void> {
    await this.ensureSession();
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;

    const record = {
      $type: 'app.bsky.graph.block' as const,
      subject: did,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.agent.api.app.bsky.graph.block.create(
        { repo: session.did },
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
      const response = await this.agent.api.app.bsky.feed.getPostThread({
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
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;

    try {
      // Use the correct parameter name 'filter' instead of 'actor'
      const response = await this.agent.api.app.bsky.graph.getBlocks({
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
    await this.ensureSession();
    const sessionStr = await SecureStore.getItemAsync('session');
    const session = sessionStr ? JSON.parse(sessionStr) : null;

    const record = {
      $type: 'app.bsky.feed.threadgate' as const,
      post: postUri,
      feedbackType: type,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.agent.api.app.bsky.feed.threadgate.create(
        { repo: session.did },
        record
      );
    } catch (error: any) {
      console.error('Error sending video feedback:', error);
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
      const response = await this.agent.api.app.bsky.notification.listNotifications(params);
      return { 
        notifications: response.data.notifications || [], 
        cursor: response.data.cursor || null 
      };
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      return { notifications: [], cursor: null };
    }
  }

  static async getLikedPosts(userDid: string, cursor: string | null = null, limit: number = 100, filterVideosOnly: boolean = true): Promise<FeedResponse> {
    await this.ensureSession();
    try {
      const params: any = { actor: userDid, limit: 100 }; // Always use maximum limit
      if (cursor) params.cursor = cursor;
      const response = await this.agent.api.app.bsky.feed.getActorLikes(params);
      
      let feedData = response.data.feed || [];
      
      // Filter for video posts if requested
      if (filterVideosOnly && feedData.length > 0) {
        feedData = await this.filterVideoPostsEfficiently(feedData);
      }
      
      // Apply content moderation at fetch level to reduce downstream compute
      if (feedData.length > 0) {
        const { ModerationService } = await import('../ModerationService');
        const moderationResult = await ModerationService.batchModeratePosts(feedData);
        // Attach moderationDecision to each item
        const moderationMap = moderationResult.moderationDecisions;
        feedData = moderationResult.filteredPosts.map(item => {
          const uri = item?.post?.uri;
          return uri && moderationMap.has(uri)
            ? { ...item, moderationDecision: moderationMap.get(uri) }
            : item;
        });
      }
      
      return { feed: feedData, cursor: response.data.cursor || null };
    } catch (error: any) {
      console.error('Error fetching liked posts:', error);
      return { feed: [], cursor: null };
    }
  }

  static async getRepostedPosts(userDid: string, cursor: string | null = null, limit: number = 100, filterVideosOnly: boolean = true): Promise<FeedResponse> {
    await this.ensureSession();
    try {
      const params: any = { actor: userDid, limit: 100 }; // Always use maximum limit
      if (cursor) params.cursor = cursor;
      // Using getAuthorFeed and filtering for reposts as there's no direct repost feed endpoint
      const response = await this.agent.api.app.bsky.feed.getAuthorFeed(params);
      let repostedPosts = response.data.feed.filter(item => 
        item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost'
      );
      
      // Filter for video posts if requested
      if (filterVideosOnly && repostedPosts.length > 0) {
        repostedPosts = await this.filterVideoPostsEfficiently(repostedPosts);
      }
      
      // Apply content moderation at fetch level to reduce downstream compute
      if (repostedPosts.length > 0) {
        const { ModerationService } = await import('../ModerationService');
        const moderationResult = await ModerationService.batchModeratePosts(repostedPosts);
        // Attach moderationDecision to each item
        const moderationMap = moderationResult.moderationDecisions;
        repostedPosts = moderationResult.filteredPosts.map(item => {
          const uri = item?.post?.uri;
          return uri && moderationMap.has(uri)
            ? { ...item, moderationDecision: moderationMap.get(uri) }
            : item;
        });
      }
      
      return { feed: repostedPosts || [], cursor: response.data.cursor || null };
    } catch (error: any) {
      console.error('Error fetching reposted posts:', error);
      return { feed: [], cursor: null };
    }
  }

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
      
      const sessionStr = await SecureStore.getItemAsync('session');
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      
      // Ensure the user owns the post
      if (did !== session.did) {
        throw new Error('Cannot delete a post that you do not own');
      }
      
      // Delete the post
      await this.agent.api.app.bsky.feed.post.delete({
        repo: session.did,
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
          const postResponse = await this.agent.api.app.bsky.feed.getPostThread({ 
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
      
      // Create base agent
      let agentToUse = this.agent;
      
      // If a specific labeler is specified, use the proxy
      if (labelerDid) {
        agentToUse = this.agent.withProxy('atproto_labeler', labelerDid);
      }

      // Create the moderation report
      await agentToUse.api.com.atproto.moderation.createReport({
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
      const sessionStr = await SecureStore.getItemAsync('session');
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      
      // Extract the record key (rkey) from the URI
      const parts = postUri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI format');
      }
      
      const did = parts[2];
      const rkey = parts[4];
      
      // Ensure the user owns the post
      if (did !== session.did) {
        throw new Error('Cannot mute comments on a post that you do not own');
      }
      
      // Create a threadgate with no allow rules (effectively muting all comments)
      const record = {
        $type: 'app.bsky.feed.threadgate',
        post: postUri,
        createdAt: new Date().toISOString(),
        allow: [] // Empty array means no one can comment
      };
      
      await this.agent.api.com.atproto.repo.createRecord({
        repo: session.did,
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
   * Log out the current user
   * Efficiently cleans up all session data and resets the agent state
   */
  static async logout(clearAllAccounts: boolean = false): Promise<void> {
    try {
      // Cancel any pending session checks
      this._sessionPromise = null;
      
      // Create a new clean agent first to avoid using stale credentials
      this.agent = new AtpAgent({ service: SERVICE_URL });
      
      // Clear secure storage in parallel for efficiency
      await Promise.all([
        SecureStore.deleteItemAsync('session'),
        SecureStore.deleteItemAsync('credentials')
      ]);
      
      // Clear all saved accounts if requested
      if (clearAllAccounts) {
        try {
          const AccountManager = (await import('../storage/AccountManager')).default;
          await AccountManager.clearAllAccounts();
        } catch (error) {
          console.warn('Failed to clear accounts from AccountManager:', error);
        }
      }
      
      // console.log('Logout successful');
    } catch (error) {
      console.error('Error during logout:', error);
      throw error; // Re-throw to allow proper error handling upstream
    }
  }

  /**
   * Get profile information for a DID (verifier)
   * @param did - DID of the verifier
   * @returns Profile data or null
   */
  static async getVerifierProfile(did: string): Promise<any | null> {
    try {
      await this.ensureSession();
      const response = await this.agent.api.app.bsky.actor.getProfile({
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
  }): Promise<any> {
    try {
      await this.ensureSession();
      
      // Use the correct upsertProfile method as per Bluesky documentation
      const updatedProfile = await this.agent.upsertProfile(existingProfile => {
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
          const uploadResult = await this.agent.uploadBlob(imageBlob, {
            encoding: 'image/jpeg'
          });

          // Update profile with the new avatar
          await this.agent.upsertProfile(existingProfile => {
            const existing = existingProfile ?? {};
            (existing as any).avatar = uploadResult.data.blob;
            return existing;
          });
        } catch (error) {
          console.error('Error uploading avatar:', error);
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
      const uploadResult = await this.agent.uploadBlob(imageBlob, {
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
    await this.ensureSession();
    try {
      const response = await this.agent.api.app.bsky.actor.getSuggestions({ limit });
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
      const response = await this.agent.api.app.bsky.graph.getFollowers(params);
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
      const response = await this.agent.api.app.bsky.graph.getFollows(params);
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
      const postThread = await this.agent.api.app.bsky.feed.getPostThread({ uri });
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
   * Search for popular feed generators (channels)
   * @param query - Search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects
   */
  static async searchPopularFeeds(query: string, limit: number = 5): Promise<any[]> {
    await this.ensureSession();
    try {
      const response = await this.agent.api.app.bsky.unspecced.getPopularFeedGenerators({
        limit,
        query: query,
      });
      return response.data.feeds || [];
    } catch (error: any) {
      console.error('Error searching popular feeds:', error);
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
      const response = await this.agent.api.app.bsky.unspecced.getPopularFeedGenerators({
        limit,
      });
      return response.data.feeds || [];
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
      const response = await this.agent.api.app.bsky.feed.getFeedGenerator({
        feed: uri,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error getting feed generator:', error);
      return null;
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
      // Get generator details
      const generatorResponse = await this.agent.api.app.bsky.feed.getFeedGenerator({
        feed: uri,
      });
      
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
      const response = await this.agent.api.app.bsky.actor.getPreferences();
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
      await this.agent.api.app.bsky.actor.putPreferences(preferences);
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
      const response = await this.agent.api.app.bsky.graph.getBlocks({
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
      const response = await this.agent.api.app.bsky.graph.getMutes({
        limit: 100
      });
      return response.data.mutes?.map((mute: any) => mute.did) || [];
    } catch (error: any) {
      return [];
    }
  }

  /**
   * Paginated fetch for video posts (no search query supported)
   * @param cursor - Pagination cursor
   * @param limit - Number of results per page
   * @returns Array of video post results and next cursor
   */
  static async searchVideosPaginated(cursor: string | null = null, limit: number = 20): Promise<{ videos: any[], cursor: string | null }> {
    await this.ensureSession();
    try {
      let params: any = { limit };
      if (cursor !== null && cursor !== undefined) params.cursor = cursor;
      let response: any = await this.agent.api.app.bsky.feed.getTimeline(params);
      let posts = response?.data?.feed || [];
      // Normalize to post objects
      posts = posts.map((item: any) => item.post ? item.post : item);
      // Filter for video posts only
      const videoPosts = this.filterVideoPostsEfficiently(posts.map((post: any) => ({ post })));
      // Map back to just the post object
      const videos = videoPosts.map((item: any) => item.post);
      return {
        videos,
        cursor: response?.data?.cursor || null
      };
    } catch (error) {
      console.error('Error searching videos:', error);
      return { videos: [], cursor: null };
    }
  }
}

// Use a named export to ensure TypeScript picks up the type correctly
export { AtprotoService };
// Keep the default export for backward compatibility
export default AtprotoService;