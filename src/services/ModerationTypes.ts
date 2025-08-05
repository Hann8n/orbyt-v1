// ModerationTypes.ts

export interface ModerationSettings {
  // Content filtering preferences
  hideSensitiveContent: boolean;
  hideAdultContent: boolean;
  hideViolence: boolean;
  hideSpam: boolean;
  hideMisleading: boolean;

  // User interaction preferences
  hideBlockedUsers: boolean;
  hideMutedUsers: boolean;

  // Content warning preferences
  showContentWarnings: boolean;
  autoExpandContentWarnings: boolean;

  // Bluesky-specific settings
  adultContentEnabled: boolean;
  labels: Record<string, LabelPreference>;
  labelers: Array<{did: string, labels: Record<string, LabelPreference>}>;
  mutedWords: string[];
  hiddenPosts: string[];
}

export type LabelPreference = 'hide' | 'warn' | 'ignore';

export interface ModerationFilters {
  // Content types to filter out
  sensitiveContent: boolean;
  adultContent: boolean;
  violence: boolean;
  spam: boolean;
  misleading: boolean;

  // User-based filtering
  blockedUsers: boolean;
  mutedUsers: boolean;

  // Content warning handling
  respectContentWarnings: boolean;
}

export interface ModerationDecision {
  filter: boolean;
  blur: boolean;
  informs: string[];
  reason?: string;
  source?: string;
}

export interface ModerationOpts {
  userDid: string;
  prefs: {
    adultContentEnabled: boolean;
    labels: Record<string, LabelPreference>;
    labelers: Array<{did: string, labels: Record<string, LabelPreference>}>;
    mutedWords: string[];
    hiddenPosts: string[];
  };
  labelDefs: Record<string, LabelDefinition>;
}

export interface LabelDefinition {
  identifier: string;
  severity: 'alert' | 'inform';
  description: string;
  color: string;
} 