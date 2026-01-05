import { ModerationSettings, ModerationDecision, LabelPreference } from '../../ModerationTypes';
import { logger } from '../../../utils/logger';
import { queryClient } from '../../../utils/queryClient';
import { queryKeys } from '../../../utils/queryKeys';
import type { Agent } from '@atproto/api';
import type { 
  ExtendedFeedViewPost, 
  ExtendedPostView,
  ProfileView,
  ProfileViewBasic,
  ProfileViewDetailed,
  Notification,
  ActorPreferences
} from '../types';

export class ModerationService {
  private static moderationCache = new Map<string, ModerationDecision>();

  static getCachedModerationSettings(userDid?: string): ModerationSettings {
    if (userDid) {
      const queryData = queryClient.getQueryData<ModerationSettings>(
        queryKeys.moderation.byUser(userDid)
      );
      if (queryData) {
        return queryData;
      }
    }
    return this.createSafeDefaultSettings();
  }

  static clearModerationCache(): void {
    this.moderationCache.clear();
  }

  /**
   * Moderate a profile (simplified implementation)
   */
  static async moderateProfile(
    _profile: ProfileView | ProfileViewBasic | ProfileViewDetailed,
    _context: 'profileList' | 'profileView' | 'avatar' | 'banner' = 'profileList'
  ): Promise<ModerationDecision> {
    return { filter: false, blur: false, informs: [] };
  }

  /**
   * Moderate a notification (simplified implementation)
   */
  static async moderateNotification(_notification: Notification): Promise<ModerationDecision> {
    return { filter: false, blur: false, informs: [] };
  }

  static async fetchModerationSettings(agent?: Agent): Promise<ModerationSettings> {
    if (!agent) {
      logger.warn('No agent provided for moderation settings, using safe defaults', { component: 'ModerationService' });
      return this.createSafeDefaultSettings();
    }

    try {
      const response = await agent.api.app.bsky.actor.getPreferences();
      const preferences = response.data?.preferences || [];
      
      if (!Array.isArray(preferences)) {
        logger.warn('Invalid preferences format from API', { component: 'ModerationService' });
        return this.createSafeDefaultSettings();
      }

      return this.convertPreferencesToSettings(preferences as Array<Record<string, unknown>>);
    } catch (error) {
      logger.error('Failed to fetch moderation settings from API, using safe defaults', error, { component: 'ModerationService' });
      return this.createSafeDefaultSettings();
    }
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
      let existingPreferences: ActorPreferences = [];
      try {
        const response = await agent.api.app.bsky.actor.getPreferences();
        existingPreferences = response.data?.preferences || [];
      } catch (error) {
        logger.warn('Could not fetch existing preferences before saving', { error, component: 'ModerationService' });
      }

      // Convert settings to preferences format, merging with existing preferences
      const preferences = this.convertSettingsToPreferences(settings, existingPreferences as Array<Record<string, unknown>>);

      await agent.api.app.bsky.actor.putPreferences({ preferences: preferences as ActorPreferences });
      
      this.clearModerationCache();
      
      if (userDid) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.moderation.byUser(userDid),
          exact: true
        });
      } else {
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


  static async moderatePost(
    post: ExtendedFeedViewPost | ExtendedPostView, 
    _context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList', 
    agent?: Agent,
    userDid?: string
  ): Promise<ModerationDecision> {
    if (!post) {
      return { filter: false, blur: false, informs: [] };
    }

    const uri = 'post' in post ? post.post?.uri : post.uri;
    if (!uri) {
      return { filter: false, blur: false, informs: [] };
    }

    if (this.moderationCache.has(uri)) {
      return this.moderationCache.get(uri)!;
    }

    const failSafeDecision: ModerationDecision = {
      filter: true,
      blur: false,
      informs: [],
      reason: 'Content Warning'
    };

    try {
      let settings: ModerationSettings;
      if (userDid) {
        const cachedSettings = this.getCachedModerationSettings(userDid);
        if (cachedSettings && Object.keys(cachedSettings.labels || {}).length > 0) {
          settings = cachedSettings;
        } else {
          settings = await this.fetchModerationSettings(agent);
        }
      } else {
        settings = await this.fetchModerationSettings(agent);
      }
      const labels = ('post' in post ? post.post?.labels : post.labels) || [];
      const postRecord = 'post' in post ? post.post?.record : post.record;
      const text = (postRecord && typeof postRecord === 'object' && 'text' in postRecord && typeof postRecord.text === 'string')
        ? postRecord.text.toLowerCase()
        : '';

      const decision: ModerationDecision = {
        filter: false,
        blur: false,
        informs: [],
        reason: undefined
      };

      const reasons: string[] = [];

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
          decision.informs.push(check.detected);
        }
      }

      if (reasons.length > 0) {
        decision.reason = reasons.join(', ');
      }

      this.moderationCache.set(uri, decision);
      return decision;
    } catch (error) {
      logger.error('Error moderating post, using fail-safe decision', error, { 
        component: 'ModerationService',
        uri: uri.substring(0, 50)
      });
      
      this.moderationCache.set(uri, failSafeDecision);
      return failSafeDecision;
    }
  }

  static async batchModeratePosts(
    posts: (ExtendedFeedViewPost | ExtendedPostView)[], 
    context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList', 
    agent?: Agent,
    userDid?: string
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
    
    const moderationDecisions = new Map<string, ModerationDecision>();
    const filteredPosts: (ExtendedFeedViewPost | ExtendedPostView)[] = [];
    let filteredCount = 0;
    let blurredCount = 0;
    let allowedCount = 0;

    for (const post of posts) {
      try {
        const decision = await this.moderatePost(post, context, agent, userDid);
        const postUri = 'post' in post ? post.post?.uri : post.uri;
        
        if (postUri) {
          moderationDecisions.set(postUri, decision);
          
          // Attach the moderation decision to the post
          if ('post' in post && post.post) {
            (post.post as ExtendedPostView & { moderationDecision?: ModerationDecision }).moderationDecision = decision;
          }
          (post as (ExtendedFeedViewPost | ExtendedPostView) & { moderationDecision?: ModerationDecision }).moderationDecision = decision;
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
        logger.warn('Error moderating post in batch, filtering out', { 
          error, 
          component: 'ModerationService',
          uri: ('post' in post ? post.post?.uri : post.uri)?.substring(0, 50)
        });
        filteredCount++;
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

  static filterSensitiveByLabels(posts: (ExtendedFeedViewPost | ExtendedPostView)[]): (ExtendedFeedViewPost | ExtendedPostView)[] {
    if (!posts || posts.length === 0) {
      return [];
    }

    const sensitiveLabels = ['nsfw', 'porn', 'sexual', 'suggestive', 'nudity', 'gore', 'graphic-media'];
    
    return posts.filter((post) => {
      const labels = ('post' in post ? post.post?.labels : post.labels) || [];
      const hasSensitiveLabel = labels.some((label: unknown) => {
        const labelObj = label as { val?: string; value?: string } | string | null | undefined;
        const val = typeof labelObj === 'object' && labelObj !== null 
          ? (labelObj.val || labelObj.value)
          : (typeof labelObj === 'string' ? labelObj : undefined);
        if (typeof val !== 'string') return false;
        const lowerVal = val.toLowerCase();
        return sensitiveLabels.some(sensitive => lowerVal.includes(sensitive));
      });
      return !hasSensitiveLabel;
    });
  }

  private static detectContentType(type: 'nsfw' | 'suggestive' | 'nudity' | 'gore', text: string, labels: Array<{ val?: string; value?: string } | string>): string | null {
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
    
    const hasLabel = labels.some(label => {
      const labelObj = label as { val?: string; value?: string } | string | null | undefined;
      const labelVal = typeof labelObj === 'object' && labelObj !== null 
        ? (labelObj.val || labelObj.value)
        : (typeof labelObj === 'string' ? labelObj : undefined);
      if (typeof labelVal !== 'string') return false;
      
      const lowerVal = labelVal.toLowerCase();
      return config.labelValues.some(val => 
        lowerVal === val || lowerVal.includes(val)
      );
    });

    const hasKeyword = config.keywords.some(keyword => text.includes(keyword));

    return (hasLabel || hasKeyword) ? type : null;
  }

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

  private static convertPreferencesToSettings(preferences: Array<Record<string, unknown>>): ModerationSettings {
    const settings = this.createSafeDefaultSettings();
    
    if (!preferences || !Array.isArray(preferences)) {
      return settings;
    }
    
    for (const pref of preferences) {
      if (!pref || !pref.$type) {
        continue;
      }
      
      switch (pref.$type) {
        case 'app.bsky.actor.defs#adultContentPref':
          if (typeof pref.enabled === 'boolean') {
            settings.adultContentEnabled = pref.enabled;
          }
          break;
          
        case 'app.bsky.actor.defs#contentLabelPref':
          if ('label' in pref && typeof pref.label === 'string' && 'visibility' in pref && typeof pref.visibility === 'string') {
            const validVisibility = ['hide', 'warn', 'ignore'].includes(pref.visibility) 
              ? pref.visibility as 'hide' | 'warn' | 'ignore'
              : 'hide';
            settings.labels[pref.label] = validVisibility;
          }
          break;
          
        case 'app.bsky.actor.defs#hiddenPostsPref':
          if (pref.items && Array.isArray(pref.items)) {
            settings.hiddenPosts = pref.items
              .map((item: unknown) => {
                const itemObj = item as { uri?: string } | null | undefined;
                return itemObj?.uri || '';
              })
              .filter(Boolean);
          }
          break;
          
        case 'app.bsky.actor.defs#labelersPref':
          if (pref.labelers && Array.isArray(pref.labelers)) {
            settings.labelers = pref.labelers
              .map((labeler: unknown) => {
                const labelerObj = labeler as { did?: string; labels?: Record<string, LabelPreference> } | null | undefined;
                return {
                  did: labelerObj?.did || '',
                  labels: labelerObj?.labels || {}
                };
              })
              .filter((l) => l.did);
          }
          break;
          
        default:
          break;
      }
    }
    
    return settings;
  }

  private static convertSettingsToPreferences(
    settings: ModerationSettings,
    existingPreferences: Array<Record<string, unknown>>
  ): Array<Record<string, unknown>> {
    const managedLabels = new Set(['nsfw', 'suggestive', 'nudity', 'gore']);
    const preservedPreferences: Array<Record<string, unknown>> = [];
    
    for (const pref of existingPreferences || []) {
      if (!pref || typeof pref !== 'object' || !('$type' in pref)) {
        continue;
      }
      
      const prefType = pref.$type as string;
      if (prefType === 'app.bsky.actor.defs#adultContentPref') {
        continue;
      } else if (prefType === 'app.bsky.actor.defs#contentLabelPref') {
        if ('label' in pref && typeof pref.label === 'string' && !managedLabels.has(pref.label)) {
          preservedPreferences.push(pref);
        }
      } else {
        preservedPreferences.push(pref);
      }
    }
    
    const preferences: Array<Record<string, unknown>> = [];
    
    preferences.push({
      $type: 'app.bsky.actor.defs#adultContentPref',
      enabled: settings.adultContentEnabled || false
    });
    
    const labelKeys = ['nsfw', 'suggestive', 'nudity', 'gore'];
    for (const labelKey of labelKeys) {
      const visibility = settings.labels[labelKey] || 'hide';
      preferences.push({
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: labelKey,
        visibility: visibility
      });
    }
    
    preferences.push(...preservedPreferences);
    
    return preferences;
  }
}
