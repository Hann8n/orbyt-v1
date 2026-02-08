/**
 * Seen Video Tracking Service
 * Tracks video visibility across all feeds and filters seen videos in "your-mix" feed
 * Uses dedicated MMKV instance for optimal performance
 */
import { MMKV } from 'react-native-mmkv';
import { logger } from '../utils/logger';
import type { ExtendedFeedViewPost } from './api/types';

class SeenVideoService {
  // Dedicated MMKV instance for seen videos (optimal performance)
  private readonly seenStorage = new MMKV({
    id: 'mmkv.seen-videos',
  });

  private writtenThisSession = new Set<string>(); // In-memory deduplication
  private readonly KEY_PREFIX = 'seen:';
  private userDid: string | null = null; // Current user DID for scoping

  /**
   * Set current user DID (called on login/account switch)
   */
  setUserDid(did: string | null): void {
    this.userDid = did;
    // Clear session cache on user switch to avoid cross-user contamination
    this.writtenThisSession.clear();
  }

  /**
   * Get storage key for video URI (user-scoped)
   */
  private getKey(videoUri: string): string {
    const userPrefix = this.userDid ? `${this.userDid}:` : '';
    return `${this.KEY_PREFIX}${userPrefix}${videoUri}`;
  }

  /**
   * Mark video as seen (immediate synchronous write - MMKV is fast enough)
   */
  markAsSeen(videoUri: string): void {
    if (!videoUri || typeof videoUri !== 'string') return; // Safety check

    try {
      // Skip if already written this session (fast in-memory check)
      // Use full key for session cache to match user scoping
      const key = this.getKey(videoUri);
      if (this.writtenThisSession.has(key)) {
        return;
      }

      // Check MMKV to avoid redundant writes across sessions
      // MMKV: getNumber() returns undefined if key doesn't exist
      const existingTimestamp = this.seenStorage.getNumber(key);
      if (existingTimestamp !== undefined) {
        this.writtenThisSession.add(key);
        return;
      }

      // Write immediately and synchronously - MMKV is fast enough
      // Use set() for timestamp (MMKV infers number type from value)
      this.seenStorage.set(key, Date.now());
      this.writtenThisSession.add(key);
    } catch (error) {
      // Log error but don't throw - visibility tracking shouldn't break feed
      if (__DEV__) {
        logger.warn('SeenVideoService.markAsSeen error', {
          component: 'SeenVideoService',
          videoUri,
          userDid: this.userDid,
          error,
        });
      }
    }
  }

  /**
   * Check if seen (synchronous, fast)
   */
  isSeen(videoUri: string): boolean {
    if (!videoUri || typeof videoUri !== 'string') return false;

    try {
      // Check in-memory cache first (fast)
      // Use full key for session cache to match user scoping
      const key = this.getKey(videoUri);
      if (this.writtenThisSession.has(key)) {
        return true;
      }

      // Check MMKV (synchronous, fast)
      return this.seenStorage.getNumber(key) !== undefined;
    } catch (error) {
      // Log error but return false - don't break feed
      if (__DEV__) {
        logger.warn('SeenVideoService.isSeen error', {
          component: 'SeenVideoService',
          videoUri,
          userDid: this.userDid,
          error,
        });
      }
      return false;
    }
  }

  /**
   * Filter array (efficient batch with Set-based lookups)
   */
  filterSeen(feedItems: ExtendedFeedViewPost[], userDid?: string | null): ExtendedFeedViewPost[] {
    if (!feedItems || feedItems.length === 0) {
      return feedItems;
    }

    try {
      // Use provided userDid or fall back to current userDid
      const targetUserDid = userDid ?? this.userDid;

      // If no userDid is set, don't filter (safety check)
      // This prevents filtering when user is not logged in or userDid is not initialized
      if (!targetUserDid) {
        if (__DEV__) {
          logger.debug('SeenVideoService.filterSeen: No userDid, skipping filter', {
            totalItems: feedItems.length,
          });
        }
        return feedItems;
      }

      const prefix = `${this.KEY_PREFIX}${targetUserDid}:`;

      // Get all keys from dedicated instance (faster - only seen video keys, not entire storage)
      const allKeys = this.seenStorage.getAllKeys();
      const seenUris = new Set<string>();

      for (const key of allKeys) {
        if (key.startsWith(prefix)) {
          // Extract video URI from key: "seen:userDid:videoUri" -> "videoUri"
          const uri = key.substring(prefix.length);
          if (uri) {
            seenUris.add(uri);
          }
        }
      }

      // If no seen videos, return all items
      if (seenUris.size === 0) {
        if (__DEV__) {
          logger.debug('SeenVideoService.filterSeen: No seen videos, returning all items', {
            totalItems: feedItems.length,
            userDid: targetUserDid,
          });
        }
        return feedItems;
      }

      // Filter out seen videos
      const filtered = feedItems.filter(item => {
        const uri = item.post?.uri;
        return uri && !seenUris.has(uri);
      });

      // Debug logging in dev mode
      if (__DEV__) {
        logger.debug('SeenVideoService.filterSeen', {
          totalItems: feedItems.length,
          seenCount: seenUris.size,
          filteredCount: filtered.length,
          userDid: targetUserDid,
        });
      }

      return filtered;
    } catch (error) {
      // Log error but return all items - don't break feed
      if (__DEV__) {
        logger.warn('SeenVideoService.filterSeen error', {
          component: 'SeenVideoService',
          userDid,
          error,
        });
      }
      return feedItems;
    }
  }

  /**
   * Get all seen video URIs with timestamps (for watched videos page)
   */
  getSeenVideos(userDid?: string | null): Array<{ uri: string; timestamp: number }> {
    try {
      const targetUserDid = userDid ?? this.userDid;

      // If no userDid is set, return empty array
      if (!targetUserDid) {
        return [];
      }

      const prefix = `${this.KEY_PREFIX}${targetUserDid}:`;

      // Get all keys from dedicated instance
      const allKeys = this.seenStorage.getAllKeys();
      const seenVideos: Array<{ uri: string; timestamp: number }> = [];

      for (const key of allKeys) {
        if (key.startsWith(prefix)) {
          // Extract video URI from key: "seen:userDid:videoUri" -> "videoUri"
          const uri = key.substring(prefix.length);
          if (uri) {
            const timestamp = this.seenStorage.getNumber(key);
            if (timestamp !== undefined) {
              seenVideos.push({ uri, timestamp });
            }
          }
        }
      }

      // Sort by timestamp (newest first)
      return seenVideos.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      // Log error but return empty array - don't break watched videos page
      if (__DEV__) {
        logger.warn('SeenVideoService.getSeenVideos error', {
          component: 'SeenVideoService',
          userDid,
          error,
        });
      }
      return [];
    }
  }

  /**
   * Cleanup old entries (background, async)
   */
  async cleanupOldEntries(retentionDays: number = 30): Promise<number> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const prefix = `${this.KEY_PREFIX}${this.userDid ? `${this.userDid}:` : ''}`;

    // Get all keys from dedicated instance (faster - only seen video keys)
    const allKeys = this.seenStorage.getAllKeys();
    let deleted = 0;

    for (const key of allKeys) {
      if (key.startsWith(prefix)) {
        const timestamp = this.seenStorage.getNumber(key);
        if (timestamp !== undefined && timestamp < cutoffTime) {
          this.seenStorage.delete(key);
          deleted++;
        }
      }
    }

    return deleted;
  }
}

// Export singleton instance
export const seenVideoService = new SeenVideoService();
export default seenVideoService;
