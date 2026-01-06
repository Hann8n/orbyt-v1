/**
 * Pure function to compute moderation decision for a post
 * Synchronous, no side effects - can be called inline in components
 */

import type {
  ModerationDecision,
  ModerationSettings,
} from '../../services/moderation/ModerationTypes';
import type { ExtendedPostView, ExtendedFeedViewPost } from '../../services/api/types';

/**
 * Detect content type based on labels and text
 * Extracted from ModerationService.detectContentType()
 */
function detectContentType(
  type: 'nsfw' | 'suggestive' | 'nudity' | 'gore',
  text: string,
  labels: Array<string | { val?: string; value?: string }>
): string | null {
  if (!labels || !Array.isArray(labels)) {
    labels = [];
  }

  const typeConfig = {
    nsfw: {
      labelValues: ['nsfw', 'porn', 'sexual'],
      keywords: ['nsfw', 'porn', 'sex', 'adult', 'explicit'],
    },
    suggestive: {
      labelValues: ['suggestive', 'sexual'],
      keywords: ['suggestive', 'provocative', 'sexy', 'hot'],
    },
    nudity: {
      labelValues: ['nudity', 'artistic-nudity'],
      keywords: ['nude', 'nudity', 'naked', 'artistic'],
    },
    gore: {
      labelValues: ['gore', 'graphic-media'],
      keywords: ['gore', 'blood', 'violence', 'graphic'],
    },
  };

  const config = typeConfig[type];

  // Check labels
  const hasLabel = labels.some(label => {
    let labelVal: string | null = null;
    if (typeof label === 'string') {
      labelVal = label;
    } else if (label && typeof label === 'object') {
      labelVal =
        ('val' in label && typeof label.val === 'string' ? label.val : null) ||
        ('value' in label && typeof label.value === 'string' ? label.value : null);
    }
    if (!labelVal) return false;

    const lowerVal = labelVal.toLowerCase();
    return config.labelValues.some(val => lowerVal === val || lowerVal.includes(val));
  });

  // Check keywords in text
  const hasKeyword =
    typeof text === 'string' && config.keywords.some(keyword => text.includes(keyword));

  return hasLabel || hasKeyword ? type : null;
}

/**
 * Compute moderation decision for a post
 * Pure function - no side effects, synchronous
 *
 * @param post - ExtendedPostView or ExtendedFeedViewPost
 * @param settings - ModerationSettings from useModerationSettings hook
 * @returns ModerationDecision
 */
export function computeModerationDecision(
  post: ExtendedPostView | ExtendedFeedViewPost,
  settings: ModerationSettings
): ModerationDecision {
  // Handle ExtendedFeedViewPost by extracting post
  const postView = 'post' in post ? post.post : post;

  // Early return if no post view
  if (!postView) {
    return { filter: false, blur: false, informs: [] };
  }

  // Check if author is blocked or muted (author's viewer state)
  const isAuthorBlocked = postView.author?.viewer?.blocking;
  const isAuthorMuted = postView.author?.viewer?.muted;

  // Filter blocked users if setting is enabled
  if (settings.hideBlockedUsers && isAuthorBlocked) {
    return { filter: true, blur: false, informs: [], reason: 'Blocked User' };
  }

  // Filter muted users if setting is enabled
  if (settings.hideMutedUsers && isAuthorMuted) {
    return { filter: true, blur: false, informs: [], reason: 'Muted User' };
  }

  // Get labels from post
  const labels = postView.labels || [];

  // Extract text from post record
  const text =
    typeof postView.record === 'object' &&
    postView.record &&
    'text' in postView.record &&
    typeof postView.record.text === 'string'
      ? postView.record.text.toLowerCase()
      : '';

  // Initialize decision
  const decision: ModerationDecision = {
    filter: false,
    blur: false,
    informs: [],
    reason: undefined,
  };

  const reasons: string[] = [];

  // Check for NSFW content first - if adultContentEnabled is false, filter all NSFW
  const nsfwDetected = detectContentType('nsfw', text, labels);
  if (nsfwDetected && !settings.adultContentEnabled) {
    return { filter: true, blur: false, informs: [nsfwDetected], reason: 'NSFW Content' };
  }

  // Check each content type and apply user preferences
  const contentChecks = [
    {
      detected: nsfwDetected,
      preference: settings.labels.nsfw,
      reason: 'NSFW Content',
    },
    {
      detected: detectContentType('suggestive', text, labels),
      preference: settings.labels.suggestive,
      reason: 'Suggestive Content',
    },
    {
      detected: detectContentType('nudity', text, labels),
      preference: settings.labels.nudity,
      reason: 'Nudity',
    },
    {
      detected: detectContentType('gore', text, labels),
      preference: settings.labels.gore,
      reason: 'Graphic Media',
    },
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

  return decision;
}
