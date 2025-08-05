/**
 * Feed Configuration
 * Centralized settings for feed management and limits
 */

export interface FeedConfig {
  maxFeedsPerFetch: number;
  maxPostsPerFetch: number;
  feedSelectionStrategy: 'engagement' | 'recency' | 'diversity' | 'chronological' | 'weighted';
  enableSmartFeedSelection: boolean;
  maxSubscribedChannels: number;
}

export const DEFAULT_FEED_CONFIG: FeedConfig = {
  maxFeedsPerFetch: 5,
  maxPostsPerFetch: 100,
  feedSelectionStrategy: 'engagement',
  enableSmartFeedSelection: true,
  maxSubscribedChannels: 50, // Limit total number of subscribed channels
};

class FeedConfigManager {
  private static config: FeedConfig = DEFAULT_FEED_CONFIG;

  static getConfig(): FeedConfig {
    return { ...this.config };
  }

  static updateConfig(updates: Partial<FeedConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  static getMaxFeedsPerFetch(): number {
    return this.config.maxFeedsPerFetch;
  }

  static getMaxPostsPerFetch(): number {
    return this.config.maxPostsPerFetch;
  }

  static getFeedSelectionStrategy(): string {
    return this.config.feedSelectionStrategy;
  }

  static isSmartFeedSelectionEnabled(): boolean {
    return this.config.enableSmartFeedSelection;
  }

  static getMaxSubscribedChannels(): number {
    return this.config.maxSubscribedChannels;
  }
}

export default FeedConfigManager; 