import { AtpAgent } from '@atproto/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProfileColors {
  textColor: string;
  accentColor?: string;
  secondaryColor?: string;
  backgroundColor: string;
  createdAt?: string;
}

interface CachedColorRecord {
  colors: ProfileColors | null;
  timestamp: number;
  source: 'record' | 'fallback' | 'error';
}

class ProfileColorsService {
  private static agent: AtpAgent | null = null;
  private static memoryCache = new Map<string, CachedColorRecord>();
  private static pendingRequests = new Map<string, Promise<ProfileColors | null>>();
  private static CACHE_KEY_PREFIX = 'profile_colors_';
  private static CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  // Batch processing
  private static batchQueue: string[] = [];
  private static batchTimer: NodeJS.Timeout | null = null;
  private static BATCH_DELAY = 100; // ms
  private static BATCH_SIZE = 10;

  // PDS endpoint caching
  private static pdsEndpointCache = new Map<string, { endpoint: string; timestamp: number }>();
  private static PDS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  static initialize(agent: AtpAgent) {
    this.agent = agent;
  }

  /**
   * Main method to get profile colors for a user
   */
  static async getProfileColors(did: string): Promise<ProfileColors | null> {
    // Check memory cache first
    const cached = this.memoryCache.get(did);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.colors;
    }

    // Deduplicate concurrent requests
    if (this.pendingRequests.has(did)) {
      return this.pendingRequests.get(did)!;
    }

    // Check AsyncStorage cache
    const storageCache = await this.getFromStorage(did);
    if (storageCache && Date.now() - storageCache.timestamp < this.CACHE_DURATION) {
      this.memoryCache.set(did, storageCache);
      return storageCache.colors;
    }

    // Fetch from AT Protocol
    const promise = this.fetchProfileColors(did);
    this.pendingRequests.set(did, promise);

    try {
      const colors = await promise;
      return colors;
    } finally {
      this.pendingRequests.delete(did);
    }
  }

  /**
   * Batch fetch multiple profile colors efficiently
   */
  static async batchGetProfileColors(dids: string[]): Promise<Map<string, ProfileColors | null>> {
    const results = new Map<string, ProfileColors | null>();
    
    // Split into cached and uncached
    const uncached: string[] = [];
    
    for (const did of dids) {
      const cached = this.memoryCache.get(did);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        results.set(did, cached.colors);
      } else {
        uncached.push(did);
      }
    }

    // Fetch uncached in parallel (with concurrency limit)
    const CONCURRENCY = 5;
    for (let i = 0; i < uncached.length; i += CONCURRENCY) {
      const batch = uncached.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(did => this.getProfileColors(did))
      );
      
      batch.forEach((did, index) => {
        const result = batchResults[index];
        if (result.status === 'fulfilled') {
          results.set(did, result.value);
        } else {
          results.set(did, null);
        }
      });
    }

    return results;
  }

  /**
   * Fetch profile colors using multiple strategies
   */
  private static async fetchProfileColors(did: string): Promise<ProfileColors | null> {
    // Strategy 1: Try via authenticated Bluesky AppView agent
    const appViewColors = await this.tryAppViewFetch(did);
    if (appViewColors) {
      await this.cacheColors(did, appViewColors, 'record');
      return appViewColors;
    }

    // Strategy 2: Try PLC directory + direct PDS (fallback)
    const pdsColors = await this.tryDirectPDSFetch(did);
    if (pdsColors) {
      await this.cacheColors(did, pdsColors, 'record');
      return pdsColors;
    }

    // Strategy 3: Record that this user doesn't have colors
    await this.cacheColors(did, null, 'error');
    return null;
  }

  /**
   * Strategy 1: Fetch via AppView (recommended)
   * Uses the authenticated agent to proxy through AppView
   */
  private static async tryAppViewFetch(did: string): Promise<ProfileColors | null> {
    if (!this.agent) return null;
    
    try {
      // The AppView can proxy getRecord requests if the record type is public
      const response = await this.agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'com.getorbyt.profileColors',
        limit: 1,
      });

      if (response.data.records && response.data.records.length > 0) {
        return response.data.records[0].value as ProfileColors;
      }
    } catch (error: any) {
      // AppView doesn't index custom records, this is expected to fail
      // Don't log as error, just move to next strategy
    }
    return null;
  }

  /**
   * Strategy 2: Direct PDS fetch (with improvements)
   */
  private static async tryDirectPDSFetch(did: string): Promise<ProfileColors | null> {
    try {
      // Resolve PDS endpoint
      const pdsEndpoint = await this.resolvePDSEndpoint(did);
      if (!pdsEndpoint) {
        return null;
      }

      // Use a single unauthenticated agent per PDS
      const pdsAgent = new AtpAgent({ service: pdsEndpoint });

      // Try listRecords first (more likely to work)
      try {
        const response = await pdsAgent.com.atproto.repo.listRecords({
          repo: did,
          collection: 'com.getorbyt.profileColors',
          limit: 1,
        });

        if (response.data.records && response.data.records.length > 0) {
          return response.data.records[0].value as ProfileColors;
        }
      } catch (listError: any) {
        // If listRecords fails, try getRecord with rkey 'self'
        try {
          const response = await pdsAgent.com.atproto.repo.getRecord({
            repo: did,
            collection: 'com.getorbyt.profileColors',
            rkey: 'self',
          });
          return response.data.value as ProfileColors;
        } catch (getError) {
          // Record doesn't exist or not accessible
        }
      }
    } catch (error: any) {
      // Don't log "Could not find repo" errors - they're expected
      if (!error.message?.includes('Could not find repo')) {
        // Silent - no logging for expected errors
      }
    }
    return null;
  }

  /**
   * Resolve PDS endpoint from DID (with caching)
   */
  private static async resolvePDSEndpoint(did: string): Promise<string | null> {
    // Check cache first
    const cached = this.pdsEndpointCache.get(did);
    if (cached && Date.now() - cached.timestamp < this.PDS_CACHE_DURATION) {
      return cached.endpoint;
    }

    try {
      const didDoc = await fetch(`https://plc.directory/${did}`).then(r => r.json());
      const service = didDoc.service?.find(
        (s: any) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
      );
      
      if (service?.serviceEndpoint) {
        this.pdsEndpointCache.set(did, {
          endpoint: service.serviceEndpoint,
          timestamp: Date.now(),
        });
        return service.serviceEndpoint;
      }
    } catch (error) {
      // Silent - no logging for expected errors
    }
    return null;
  }

  /**
   * Cache colors with metadata
   */
  private static async cacheColors(
    did: string,
    colors: ProfileColors | null,
    source: 'record' | 'fallback' | 'error'
  ): Promise<void> {
    const record: CachedColorRecord = {
      colors,
      timestamp: Date.now(),
      source,
    };

    // Update memory cache
    this.memoryCache.set(did, record);

    // Update AsyncStorage in background
    requestAnimationFrame(() => {
      setTimeout(() => {
        AsyncStorage.setItem(
          `${this.CACHE_KEY_PREFIX}${did}`,
          JSON.stringify(record)
        ).catch(() => {});
      }, 0);
    });
  }

  /**
   * Get from AsyncStorage
   */
  private static async getFromStorage(did: string): Promise<CachedColorRecord | null> {
    try {
      const cached = await AsyncStorage.getItem(`${this.CACHE_KEY_PREFIX}${did}`);
      if (cached) {
        return JSON.parse(cached) as CachedColorRecord;
      }
    } catch (error) {
      // Ignore storage errors
    }
    return null;
  }

  /**
   * Prefetch colors for multiple users (fire and forget)
   */
  static prefetchColors(dids: string[]): void {
    // Add to batch queue
    this.batchQueue.push(...dids);

    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Set new timer to process batch
    this.batchTimer = setTimeout(() => {
      this.processBatchQueue();
    }, this.BATCH_DELAY);
  }

  /**
   * Process the batch queue
   */
  private static async processBatchQueue(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    // Get unique DIDs from queue
    const uniqueDids = [...new Set(this.batchQueue)];
    this.batchQueue = [];

    // Filter out already cached DIDs
    const uncached = uniqueDids.filter(did => {
      const cached = this.memoryCache.get(did);
      return !cached || Date.now() - cached.timestamp >= this.CACHE_DURATION;
    });

    // Process in batches
    for (let i = 0; i < uncached.length; i += this.BATCH_SIZE) {
      const batch = uncached.slice(i, i + this.BATCH_SIZE);
      
      // Process batch in background
      requestAnimationFrame(() => {
        setTimeout(() => {
          Promise.allSettled(
            batch.map(did => this.getProfileColors(did))
          ).catch(() => {});
        }, i * 50); // Stagger batches by 50ms
      });
    }
  }

  /**
   * Clear cache for testing/debugging
   */
  static async clearCache(): Promise<void> {
    this.memoryCache.clear();
    this.pdsEndpointCache.clear();
    
    const keys = await AsyncStorage.getAllKeys();
    const colorKeys = keys.filter(k => k.startsWith(this.CACHE_KEY_PREFIX));
    if (colorKeys.length > 0) {
      await AsyncStorage.multiRemove(colorKeys);
    }
  }
}

export default ProfileColorsService;

