import { ModerationSettings, ModerationDecision } from './ModerationTypes';
import { logger } from '../utils/logger';
import { queryClient } from '../utils/queryClient';
import { queryKeys } from '../utils/queryKeys';
import type { Agent } from '@atproto/api';
import type { 
  ProfileView, 
  ProfileViewDetailed, 
  Notification,
  ActorPreferences,
  GetPreferencesOutput
} from './api/types';
import type { ExtendedPostView, ExtendedFeedViewPost } from './api/types';

/**
 * Moderation Service for Bluesky content filtering
 * Uses user preferences from API to filter and blur content appropriately
 */
export class ModerationService {
  private static currentSettings: ModerationSettings | null = null;
  private static moderationCache = new Map<string, ModerationDecision>();

  /**
   * Get cached moderation settings (synchronous version for immediate UI access)
   * Tries to read from React Query cache first, then falls back to static cache
   */
  static getCachedModerationSettings(userDid?: string): ModerationSettings {
    // Try to read from React Query cache first
    if (userDid) {
      const queryData = queryClient.getQueryData<ModerationSettings>(
        queryKeys.moderation.byUser(userDid)
      );
      if (queryData) {
        return queryData;
      }
    }
    
    // Fall back to static cache (for backward compatibility)
    return this.currentSettings ?? this.createSafeDefaultSettings();
  }

  /**
   * Clear the in-memory moderation cache (decisions cache)
   */
  static clearModerationCache(): void {
    this.moderationCache.clear();
  }

  /**
   * Clear moderation settings cache (for account switching)
   * This ensures fresh settings are fetched for the new account
   */
  static clearModerationSettings(): void {
    this.currentSettings = null;
    this.moderationCache.clear();
  }

  /**
   * Moderate a profile (simplified implementation)
   */
  static async moderateProfile(_profile: ProfileView | ProfileViewDetailed, _context: 'profileList' | 'profileView' | 'avatar' | 'banner' = 'profileList'): Promise<ModerationDecision> {
    return { filter: false, blur: false, informs: [] };
  }

  /**
   * Moderate a notification (simplified implementation)
   */
  static async moderateNotification(_notification: Notification): Promise<ModerationDecision> {
    return { filter: false, blur: false, informs: [] };
  }

  /**
   * Fetch moderation settings from API (no caching)
   * Used by React Query hook for account-scoped caching
   * @deprecated Use useModerationSettings() hook instead for React Query integration
   */
  static async fetchModerationSettings(agent?: Agent): Promise<ModerationSettings> {
    // If no agent, return safe defaults (fail-safe)
    if (!agent) {
      logger.warn('No agent provided for moderation settings, using safe defaults', { component: 'ModerationService' });
      return this.createSafeDefaultSettings();
    }

    try {
      // Fetch preferences from API
      const response = await agent.api.app.bsky.actor.getPreferences();
      const output = response.data as GetPreferencesOutput;
      const preferences = (Array.isArray(output?.preferences) ? output.preferences : []) as unknown as ActorPreferences[];

      const settings = this.convertPreferencesToSettings(preferences);
      
      return settings;
    } catch (error) {
      // Fail-safe: return strict defaults if API call fails
      logger.error('Failed to fetch moderation settings from API, using safe defaults', error, { component: 'ModerationService' });
      return this.createSafeDefaultSettings();
    }
  }

  /**
   * Get moderation settings from API or cache
   * Fails safe: returns strict defaults if API fails
   * @deprecated Use useModerationSettings() hook instead for React Query integration
   */
  static async getModerationSettings(agent?: Agent): Promise<ModerationSettings> {
    // Return cached settings if available (for backward compatibility)
    if (this.currentSettings) {
      return this.currentSettings;
    }

    // Use fetchModerationSettings and cache the result
    const settings = await this.fetchModerationSettings(agent);
    this.currentSettings = settings;
    
    return settings;
  }

  /**
   * Save moderation settings to the API
   */
  static async saveModerationSettings(settings: ModerationSettings, agent?: Agent, userDid?: string): Promise<void> {
    try {
      if (!agent) {
        throw new Error('No agent provided. Cannot save moderation settings.');
      }

      // Fetch existing preferences first to preserve all preference types
      let existingPreferences: ActorPreferences[] = [];
      try {
        const response = await agent.api.app.bsky.actor.getPreferences();
        const output = response.data as GetPreferencesOutput;
        existingPreferences = (Array.isArray(output?.preferences) ? output.preferences : []) as unknown as ActorPreferences[];
      } catch (error) {
        logger.warn('Could not fetch existing preferences before saving', { error, component: 'ModerationService' });
      }

      // Convert settings to preferences format, merging with existing preferences
      const preferences = this.convertSettingsToPreferences(settings, existingPreferences);

      // Save all preferences to the API
      await agent.api.app.bsky.actor.putPreferences({ preferences: preferences as any });
      
      // Update cached settings after successful save (for backward compatibility)
      this.currentSettings = settings;
      
      // Clear moderation decisions cache so posts are re-evaluated with new settings
      this.clearModerationCache();
      
      // Invalidate React Query cache for this user's moderation settings
      if (userDid) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.moderation.byUser(userDid),
          exact: true
        });
      } else {
        // If no DID provided, invalidate all moderation queries (fallback)
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.moderation.all,
          exact: false
        });
      }
    } catch (error) {
      logger.error('Failed to save moderation settings', error, { component: 'ModerationService' });
      throw error;
    }
  }

  /**
   * Sync moderation settings from the API
   */
  static async syncModerationSettings(agent?: Agent): Promise<void> {
    try {
      if (!agent) {
        logger.warn('No agent provided for sync, skipping', { component: 'ModerationService' });
        return;
      }

      const response = await agent.api.app.bsky.actor.getPreferences();
      const output = response.data as GetPreferencesOutput;
      const preferences = (Array.isArray(output?.preferences) ? output.preferences : []) as unknown as ActorPreferences[];
      const settings = this.convertPreferencesToSettings(preferences);
      this.currentSettings = settings;
      
      // Clear cache when settings are synced
      this.clearModerationCache();
    } catch (error) {
      logger.error('Failed to sync moderation settings', error, { component: 'ModerationService' });
      throw error;
    }
  }

  /**
   * Moderate a single post based on labels and user preferences
   * Fail-safe: defaults to hiding sensitive content if moderation fails
   */
  static async moderatePost(
    post: ExtendedFeedViewPost | ExtendedPostView, 
    _context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList', 
    agent?: Agent
  ): Promise<ModerationDecision> {
    const postView = 'post' in post ? post.post : post;
    if (!postView) {
      return { filter: false, blur: false, informs: [] };
    }

    const uri = postView.uri;
    if (!uri) {
      return { filter: false, blur: false, informs: [] };
    }

    // Check cache first
    if (this.moderationCache.has(uri)) {
      return this.moderationCache.get(uri)!;
    }

    // Fail-safe decision: if moderation fails, hide sensitive content
    const failSafeDecision: ModerationDecision = {
      filter: true,
      blur: false,
      informs: [],
      reason: 'Content Warning'
    };

    try {
      // Get settings - will return safe defaults if API fails
      const settings = await this.getModerationSettings(agent);
      
      // Get labels from post
      const labels = postView.labels || [];
      const text = (typeof postView.record === 'object' && postView.record && 'text' in postView.record && typeof postView.record.text === 'string') 
        ? postView.record.text.toLowerCase() 
        : '';

      const decision: ModerationDecision = {
        filter: false,
        blur: false,
        informs: [],
        reason: undefined
      };

      const reasons: string[] = [];

      // Check each content type and apply user preferences
      const contentChecks = [
        { 
          detected: this.detectContentType('nsfw', text, labels),
          preference: settings.labels.nsfw,
          reason: 'NSFW Content'
        },
        {
          detected: this.detectContentType('suggestive', text, labels),
          preference: settings.labels.suggestive,
          reason: 'Suggestive Content'
        },
        {
          detected: this.detectContentType('nudity', text, labels),
          preference: settings.labels.nudity,
          reason: 'Nudity'
        },
        {
          detected: this.detectContentType('gore', text, labels),
          preference: settings.labels.gore,
          reason: 'Graphic Media'
        }
      ];

      for (const check of contentChecks) {
        if (check.detected) {
          if (check.preference === 'hide') {
            decision.filter = true;
            if (!reasons.includes(check.reason)) {
              reasons.push(check.reason);
            }
          } else if (check.preference === 'warn') {
            decision.blur = true;
            if (!reasons.includes(check.reason)) {
              reasons.push(check.reason);
            }
          }
          // Track content type for informs
          decision.informs.push(check.detected);
        }
      }

      // Set reason field for UI display
      if (reasons.length > 0) {
        decision.reason = reasons.join(', ');
      }

      // Cache the decision
      this.moderationCache.set(uri, decision);
      return decision;
    } catch (error) {
      // Fail-safe: if moderation fails, hide content by default
      logger.error('Error moderating post, using fail-safe decision', error, { 
        component: 'ModerationService',
        uri: uri.substring(0, 50)
      });
      
      // Cache fail-safe decision to avoid repeated errors
      this.moderationCache.set(uri, failSafeDecision);
      return failSafeDecision;
    }
  }

  /**
   * Batch moderate multiple posts efficiently
   * Fail-safe: filters out posts if moderation fails
   */
  static async batchModeratePosts(
    posts: (ExtendedFeedViewPost | ExtendedPostView)[], 
    context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList', 
    agent?: Agent
  ): Promise<{
    filteredPosts: (ExtendedFeedViewPost | ExtendedPostView)[];
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

    // Pre-fetch settings once for all posts (more efficient)
    try {
      await this.getModerationSettings(agent);
    } catch (error) {
      logger.error('Failed to load moderation settings for batch moderation, using safe defaults', error, { component: 'ModerationService' });
    }

    const moderationDecisions = new Map<string, ModerationDecision>();
    const filteredPosts: (ExtendedFeedViewPost | ExtendedPostView)[] = [];
    let filteredCount = 0;
    let blurredCount = 0;
    let allowedCount = 0;

    // Process posts - can be parallelized if needed, but sequential is safer for now
    for (const post of posts) {
      try {
        const decision = await this.moderatePost(post, context, agent);
        const postUri = ('post' in post && post.post?.uri) || ('uri' in post ? post.uri : undefined);
        
        if (postUri) {
          moderationDecisions.set(postUri, decision);
          
          // Attach the moderation decision to the post
          if ('post' in post && post.post) {
            (post.post as any).moderationDecision = decision;
          }
          (post as any).moderationDecision = decision;
        }
        
        // Apply filtering based on decision
        if (decision.filter) {
          filteredCount++;
          // Don't include filtered posts in feed
        } else if (decision.blur) {
          blurredCount++;
          filteredPosts.push(post);
        } else {
          allowedCount++;
          filteredPosts.push(post);
        }
      } catch (error) {
        // Fail-safe: if moderation fails for a post, filter it out (don't show)
        const postUri = ('post' in post && post.post?.uri) || ('uri' in post ? post.uri : undefined);
        logger.warn('Error moderating post in batch, filtering out', { 
          error, 
          component: 'ModerationService',
          uri: postUri?.substring(0, 50)
        });
        filteredCount++;
        // Don't include the post in filteredPosts (fail-safe)
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

  /**
   * Basic fail-safe filtering: filter out posts with sensitive labels
   * Used when moderation service is unavailable
   */
  static filterSensitiveByLabels(posts: (ExtendedFeedViewPost | ExtendedPostView)[]): (ExtendedFeedViewPost | ExtendedPostView)[] {
    if (!posts || posts.length === 0) {
      return [];
    }

    const sensitiveLabels = ['nsfw', 'porn', 'sexual', 'suggestive', 'nudity', 'gore', 'graphic-media'];
    
    return posts.filter((post) => {
      const postView = 'post' in post ? post.post : post;
      const labels = postView?.labels || [];
      const hasSensitiveLabel = labels.some((label: unknown) => {
        if (typeof label === 'string') {
          const lowerLabel = label.toLowerCase();
          return sensitiveLabels.some(sensitive => lowerLabel.includes(sensitive));
        }
        if (label && typeof label === 'object') {
          const val = ('val' in label && typeof label.val === 'string' ? label.val : null) || 
                      ('value' in label && typeof label.value === 'string' ? label.value : null);
          if (val) {
            return sensitiveLabels.some(sensitive => val.toLowerCase().includes(sensitive));
          }
        }
        return false;
      });
      return !hasSensitiveLabel;
    });
  }

  /**
   * Unified content detection method
   * Detects content type based on labels and text
   */
  private static detectContentType(type: 'nsfw' | 'suggestive' | 'nudity' | 'gore', text: string, labels: Array<string | { val?: string; value?: string }>): string | null {
    if (!labels || !Array.isArray(labels)) {
      labels = [];
    }

    const typeConfig = {
      nsfw: {
        labelValues: ['nsfw', 'porn', 'sexual'],
        keywords: ['nsfw', 'porn', 'sex', 'adult', 'explicit']
      },
      suggestive: {
        labelValues: ['suggestive', 'sexual'],
        keywords: ['suggestive', 'provocative', 'sexy', 'hot']
      },
      nudity: {
        labelValues: ['nudity', 'artistic-nudity'],
        keywords: ['nude', 'nudity', 'naked', 'artistic']
      },
      gore: {
        labelValues: ['gore', 'graphic-media'],
        keywords: ['gore', 'blood', 'violence', 'graphic']
      }
    };

    const config = typeConfig[type];
    
    // Check labels
    const hasLabel = labels.some(label => {
      let labelVal: string | null = null;
      if (typeof label === 'string') {
        labelVal = label;
      } else if (label && typeof label === 'object') {
        labelVal = ('val' in label && typeof label.val === 'string' ? label.val : null) || 
                   ('value' in label && typeof label.value === 'string' ? label.value : null);
      }
      if (!labelVal) return false;
      
      const lowerVal = labelVal.toLowerCase();
      return config.labelValues.some(val => 
        lowerVal === val || lowerVal.includes(val)
      );
    });

    // Check keywords in text (text is always a string at this point)
    const hasKeyword = typeof text === 'string' && config.keywords.some(keyword => text.includes(keyword));

    return (hasLabel || hasKeyword) ? type : null;
  }

  /**
   * Create safe default settings (fail-safe: hide sensitive content by default)
   */
  private static createSafeDefaultSettings(): ModerationSettings {
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
      // Fail-safe: hide sensitive content by default
      labels: {
        nsfw: 'hide',
        suggestive: 'hide',
        nudity: 'hide',
        gore: 'hide',
      },
      labelers: [],
      hiddenPosts: [],
    };
  }

  /**
   * Convert API preferences to ModerationSettings
   */
  private static convertPreferencesToSettings(preferences: ActorPreferences[]): ModerationSettings {
    const settings = this.createSafeDefaultSettings();
    
    if (!preferences || !Array.isArray(preferences)) {
      return settings;
    }
    
    for (const pref of preferences) {
      if (!pref || typeof pref !== 'object' || !('$type' in pref) || typeof pref.$type !== 'string') {
        continue;
      }
      
      switch (pref.$type) {
        case 'app.bsky.actor.defs#adultContentPref': {
          const adultPref = pref as any;
          if ('enabled' in adultPref && typeof adultPref.enabled === 'boolean') {
            settings.adultContentEnabled = adultPref.enabled;
          }
          break;
        }
          
        case 'app.bsky.actor.defs#contentLabelPref': {
          const labelPref = pref as any;
          if ('label' in labelPref && typeof labelPref.label === 'string' && 'visibility' in labelPref && typeof labelPref.visibility === 'string') {
            const validVisibility = ['hide', 'warn', 'ignore'].includes(labelPref.visibility) 
              ? labelPref.visibility as 'hide' | 'warn' | 'ignore'
              : 'hide'; // Fail-safe: default to hide
            settings.labels[labelPref.label] = validVisibility;
          }
          break;
        }
          
        case 'app.bsky.actor.defs#hiddenPostsPref': {
          const hiddenPref = pref as any;
          if ('items' in hiddenPref && Array.isArray(hiddenPref.items)) {
            settings.hiddenPosts = hiddenPref.items
              .map((item: unknown) => (item && typeof item === 'object' && 'uri' in item && typeof item.uri === 'string' ? item.uri : ''))
              .filter(Boolean);
          }
          break;
        }
          
        case 'app.bsky.actor.defs#labelersPref': {
          const labelersPref = pref as any;
          if ('labelers' in labelersPref && Array.isArray(labelersPref.labelers)) {
            settings.labelers = labelersPref.labelers
              .map((labeler: unknown) => {
                if (labeler && typeof labeler === 'object' && 'did' in labeler && typeof labeler.did === 'string') {
                  return {
                    did: labeler.did,
                    labels: ('labels' in labeler && typeof labeler.labels === 'object' && labeler.labels ? labeler.labels as Record<string, string> : {})
                  };
                }
                return null;
              })
              .filter((l: any): l is { did: string; labels: Record<string, string> } => l !== null);
          }
          break;
        }
          
        // Other preference types are preserved but not parsed
        default:
          break;
      }
    }
    
    return settings;
  }

  /**
   * Convert ModerationSettings to Bluesky preferences format
   * Merges with existing preferences to preserve all preference types
   */
  private static convertSettingsToPreferences(
    settings: ModerationSettings,
    existingPreferences: ActorPreferences[]
  ): ActorPreferences[] {
    const managedLabels = new Set(['nsfw', 'suggestive', 'nudity', 'gore']);
    const preservedPreferences: ActorPreferences[] = [];
    
    // Preserve non-managed preferences
    for (const pref of existingPreferences || []) {
      if (!pref || typeof pref !== 'object' || !('$type' in pref) || typeof pref.$type !== 'string') {
        continue;
      }
      
      if (pref.$type === 'app.bsky.actor.defs#adultContentPref') {
        // We'll replace this one
        continue;
      } else if (pref.$type === 'app.bsky.actor.defs#contentLabelPref') {
        // Only preserve content label prefs we don't manage
        const labelPref = pref as any;
        if ('label' in labelPref && typeof labelPref.label === 'string' && !managedLabels.has(labelPref.label)) {
          preservedPreferences.push(pref);
        }
      } else {
        // Preserve all other preference types
        preservedPreferences.push(pref);
      }
    }
    
    // Build preferences array
    const preferences: ActorPreferences[] = [];
    
    // Add adult content preference
    preferences.push({
      $type: 'app.bsky.actor.defs#adultContentPref',
      enabled: settings.adultContentEnabled || false
    } as unknown as ActorPreferences);
    
    // Add content label preferences for labels we manage
    const labelKeys = ['nsfw', 'suggestive', 'nudity', 'gore'];
    for (const labelKey of labelKeys) {
      const visibility = settings.labels[labelKey] || 'hide';
      preferences.push({
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: labelKey,
        visibility: visibility
      } as unknown as ActorPreferences);
    }
    
    // Add all preserved preferences
    preferences.push(...preservedPreferences);
    
    return preferences;
  }
}
