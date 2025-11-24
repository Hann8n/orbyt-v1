/**
 * Shared utility functions for feed and cache management
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import ModerationService from '../services/ModerationService';
import feedService, { createQueryKeys } from '../services/FeedService';

/**
 * Hook for invalidating feed and moderation caches
 * Use this when moderation settings change or content preferences are updated
 */
export const useFeedCacheInvalidation = () => {
  const queryClient = useQueryClient();

  const invalidateFeeds = useCallback(() => {
    ModerationService.clearModerationCache();
    feedService.clearCurrentFeed();
    feedService.clearFeedCache();
    queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.all });
  }, [queryClient]);

  return { invalidateFeeds };
};
