import { ModerationSettings, ModerationDecision, ModerationOpts as BlueskyModerationOpts } from './ModerationTypes';
import { 
  ModerationPrefs, 
  InterpretedLabelValueDefinition,
  ModerationUI,
  ModerationCause
} from '@atproto/api';

/**
 * Simplified Moderation Service that works with the actual post structure
 * This version doesn't rely on the Bluesky Moderation API to avoid the 'did' errors
 */
export class ModerationService {
  private static currentSettings: ModerationSettings | null = null;
  private static currentModerationOpts: BlueskyModerationOpts | null = null;
  private static moderationCache = new Map<string, ModerationDecision>();

  /**
   * Get cached moderation settings (synchronous version for immediate UI access)
   */
  static getCachedModerationSettings(): ModerationSettings {
    return this.currentSettings ?? this.createDefaultSettings();
  }

  /**
   * Clear the in-memory moderation cache
   */
  static clearModerationCache(): void {
    this.moderationCache.clear();
  }

  /**
   * Moderate a profile (simplified implementation)
   */
  static async moderateProfile(profile: any, context: 'profileList' | 'profileView' | 'avatar' | 'banner' = 'profileList'): Promise<ModerationDecision> {
    // For now, return default decision for profiles
    return { filter: false, blur: false, informs: [] };
  }

  /**
   * Moderate a notification (simplified implementation)
   */
  static async moderateNotification(notification: any): Promise<ModerationDecision> {
    // For now, return default decision for notifications
    return { filter: false, blur: false, informs: [] };
  }

  /**
   * Get moderation settings from user store
   */
  static async getModerationSettings(agent?: any): Promise<ModerationSettings> {
    if (this.currentSettings) {
      return this.currentSettings;
    }

    try {
      // In future, use provided agent to fetch real preferences
      if (!agent) {
        return this.createDefaultSettings();
      }

      // For now, return default settings to avoid API issues
      return this.createDefaultSettings();
    } catch (error) {
      return this.createDefaultSettings();
    }
  }

  /**
   * Save moderation settings to the API
   */
  static async saveModerationSettings(settings: ModerationSettings, agent?: any): Promise<void> {
    try {
      const currentAgent = agent;
      if (!currentAgent) {
        return;
      }

      // Convert our settings to Bluesky format
      const preferences = [
        {
          $type: 'app.bsky.actor.defs#adultContentPref',
          enabled: settings.adultContentEnabled
        },
        {
          $type: 'app.bsky.actor.defs#contentLabelPref',
          label: 'nsfw',
          visibility: settings.labels.nsfw || 'hide'
        },
        {
          $type: 'app.bsky.actor.defs#contentLabelPref',
          label: 'suggestive',
          visibility: settings.labels.suggestive || 'warn'
        },
        {
          $type: 'app.bsky.actor.defs#contentLabelPref',
          label: 'nudity',
          visibility: settings.labels.nudity || 'warn'
        },
        {
          $type: 'app.bsky.actor.defs#contentLabelPref',
          label: 'gore',
          visibility: settings.labels.gore || 'warn'
        }
      ];

      await currentAgent.api.app.bsky.actor.putPreferences({ preferences });
      this.currentSettings = settings;
      this.currentModerationOpts = null; // Clear cache
    } catch (error) {
      throw error;
    }
  }

  /**
   * Sync moderation settings from the API
   */
  static async syncModerationSettings(agent?: any): Promise<void> {
    try {
      const currentAgent = agent;
      if (!currentAgent) {
        return;
      }

      const response = await currentAgent.api.app.bsky.actor.getPreferences();
      const settings = this.convertPreferencesToSettings(response.data.preferences || []);
      this.currentSettings = settings;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Simple moderation check based on content keywords
   * This is a basic implementation that doesn't rely on the Bluesky API
   */
  static async moderatePost(post: any, context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList'): Promise<ModerationDecision> {
    if (!post || !post.post) {
      return { filter: false, blur: false, informs: [] };
    }

    const uri = post.post.uri;
    if (this.moderationCache.has(uri)) {
      return this.moderationCache.get(uri)!;
    }

    try {
      const settings = await this.getModerationSettings();
      const decision: ModerationDecision = {
        filter: false,
        blur: false,
        informs: []
      };

      // Simple keyword-based moderation
      const text = post.post.text?.toLowerCase() || '';
      const labels = post.post.labels || [];

      // Check for NSFW content
      if (this.containsNSFWContent(text, labels)) {
        if (settings.labels.nsfw === 'hide') {
          decision.filter = true;
        } else if (settings.labels.nsfw === 'warn') {
          decision.blur = true;
        }
        decision.informs.push('nsfw');
      }

      // Check for suggestive content
      if (this.containsSuggestiveContent(text, labels)) {
        if (settings.labels.suggestive === 'hide') {
          decision.filter = true;
        } else if (settings.labels.suggestive === 'warn') {
          decision.blur = true;
        }
        decision.informs.push('suggestive');
      }

      // Check for nudity
      if (this.containsNudityContent(text, labels)) {
        if (settings.labels.nudity === 'hide') {
          decision.filter = true;
        } else if (settings.labels.nudity === 'warn') {
          decision.blur = true;
        }
        decision.informs.push('nudity');
      }

      // Check for gore
      if (this.containsGoreContent(text, labels)) {
        if (settings.labels.gore === 'hide') {
          decision.filter = true;
        } else if (settings.labels.gore === 'warn') {
          decision.blur = true;
        }
        decision.informs.push('gore');
      }

      // Cache the decision
      this.moderationCache.set(uri, decision);
      return decision;
    } catch (error) {
      return { filter: false, blur: false, informs: [] };
    }
  }

  /**
   * Batch moderate multiple posts
   */
  static async batchModeratePosts(posts: any[], context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList'): Promise<{
    filteredPosts: any[];
    moderationDecisions: Map<string, ModerationDecision>;
    stats: {
      total: number;
      filtered: number;
      blurred: number;
      allowed: number;
    };
  }> {
    if (!posts || posts.length === 0) {
      return {
        filteredPosts: [],
        moderationDecisions: new Map(),
        stats: { total: 0, filtered: 0, blurred: 0, allowed: 0 }
      };
    }

    const moderationDecisions = new Map<string, ModerationDecision>();
    const filteredPosts: any[] = [];
    let filteredCount = 0;
    let blurredCount = 0;
    let allowedCount = 0;

    // Process posts sequentially to avoid overwhelming the system
    for (const post of posts) {
      try {
        const decision = await this.moderatePost(post, context);
        const postUri = post?.post?.uri;
        
        if (postUri) {
          moderationDecisions.set(postUri, decision);
          
          // Attach the moderation decision to the post for UI components to use
          if (post.post) {
            post.post.moderationDecision = decision;
          }
          if (post) {
            post.moderationDecision = decision;
          }
        }
        
        if (decision.filter) {
          filteredCount++;
        } else if (decision.blur) {
          blurredCount++;
          filteredPosts.push(post);
        } else {
          allowedCount++;
          filteredPosts.push(post);
        }
      } catch (error) {
        // Include the post even if moderation fails
        filteredPosts.push(post);
        allowedCount++;
      }
    }

    return {
      filteredPosts,
      moderationDecisions,
      stats: {
        total: posts.length,
        filtered: filteredCount,
        blurred: blurredCount,
        allowed: allowedCount
      }
    };
  }

  // Helper methods for content detection
  private static containsNSFWContent(text: string, labels: any[]): boolean {
    const nsfwKeywords = ['nsfw', 'porn', 'sex', 'adult', 'explicit'];
    const hasNSFWLabel = labels.some(label => 
      label.val === 'nsfw' || label.val === 'porn' || label.val === 'sexual'
    );
    const hasNSFWKeyword = nsfwKeywords.some(keyword => text.includes(keyword));
    return hasNSFWLabel || hasNSFWKeyword;
  }

  private static containsSuggestiveContent(text: string, labels: any[]): boolean {
    const suggestiveKeywords = ['suggestive', 'provocative', 'sexy', 'hot'];
    const hasSuggestiveLabel = labels.some(label => 
      label.val === 'suggestive' || label.val === 'sexual'
    );
    const hasSuggestiveKeyword = suggestiveKeywords.some(keyword => text.includes(keyword));
    return hasSuggestiveLabel || hasSuggestiveKeyword;
  }

  private static containsNudityContent(text: string, labels: any[]): boolean {
    const nudityKeywords = ['nude', 'nudity', 'naked', 'artistic'];
    const hasNudityLabel = labels.some(label => 
      label.val === 'nudity' || label.val === 'artistic-nudity'
    );
    const hasNudityKeyword = nudityKeywords.some(keyword => text.includes(keyword));
    return hasNudityLabel || hasNudityKeyword;
  }

  private static containsGoreContent(text: string, labels: any[]): boolean {
    const goreKeywords = ['gore', 'blood', 'violence', 'graphic'];
    const hasGoreLabel = labels.some(label => 
      label.val === 'gore' || label.val === 'graphic-media'
    );
    const hasGoreKeyword = goreKeywords.some(keyword => text.includes(keyword));
    return hasGoreLabel || hasGoreKeyword;
  }

  private static createDefaultSettings(): ModerationSettings {
    return {
      hideSensitiveContent: true,
      hideAdultContent: true,
      hideViolence: true,
      hideSpam: true,
      hideMisleading: true,
      hideBlockedUsers: true,
      hideMutedUsers: true,
      showContentWarnings: true,
      autoExpandContentWarnings: false,
      adultContentEnabled: false,
      labels: {
        nsfw: 'hide',
        suggestive: 'warn',
        nudity: 'warn',
        gore: 'warn',
      },
      labelers: [],
      hiddenPosts: [],
    };
  }

  private static convertPreferencesToSettings(preferences: any): ModerationSettings {
    const settings = this.createDefaultSettings();
    
    for (const pref of preferences) {
      if (pref.$type === 'app.bsky.actor.defs#adultContentPref') {
        settings.adultContentEnabled = pref.enabled;
      } else if (pref.$type === 'app.bsky.actor.defs#contentLabelPref') {
        settings.labels[pref.label] = pref.visibility;
      }
    }
    
    return settings;
  }
} 