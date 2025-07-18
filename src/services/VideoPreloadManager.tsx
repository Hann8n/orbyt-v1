/**
 * VideoPreloadManager.tsx
 * Manages the preloading and unloading of videos to optimize performance.
 * Simplified and optimized for React Query integration.
 */

import ProfileCache from '../../src/services/cache/ProfileCache';

interface PreloadStatus {
  status: 'queued' | 'preloading' | 'preloaded' | 'error';
}

interface PreloadEntry extends PreloadStatus {
  preloadFn: () => Promise<any>;
  stillNeeded: boolean;
  addedAt: number;
  error?: any;
  readyCallbacks?: Array<() => void>;
  authorHandle?: string;
}

interface ProfilePreloadEntry extends PreloadEntry {
  handle: string;
}

type PreloadStatusType = 'queued' | 'preloading' | 'preloaded' | 'error';

class VideoPreloadManager {
  private preloadQueue: Map<string, PreloadEntry>;
  private profilePreloadQueue: Map<string, ProfilePreloadEntry>;
  private maxPreloadCount: number;
  private maxProfilePreloadCount: number;
  private currentlyPreloading: number;
  private currentlyPreloadingProfiles: number;
  private priorityUris: Set<string>;
  private priorityProfiles: Set<string>;
  private statusUpdateCallbacks: Map<string, Set<(status: string) => void>>;

  constructor() {
    this.preloadQueue = new Map<string, PreloadEntry>();
    this.profilePreloadQueue = new Map<string, ProfilePreloadEntry>();
    this.maxPreloadCount = 8;
    this.maxProfilePreloadCount = 5;
    this.currentlyPreloading = 0;
    this.currentlyPreloadingProfiles = 0;
    this.priorityUris = new Set<string>();
    this.priorityProfiles = new Set<string>();
    this.statusUpdateCallbacks = new Map();
  }

  /**
   * Add a video to the preload queue.
   * Simplified and more efficient.
   */
  addToPreloadQueue(
    uri: string, 
    preloadFn: () => Promise<any>, 
    priority: boolean = false,
    authorHandle?: string
  ): Promise<void> {
    // Check if already exists
    if (this.preloadQueue.has(uri)) {
      const existingEntry = this.preloadQueue.get(uri)!;
      
      if (priority && !this.priorityUris.has(uri)) {
        this.priorityUris.add(uri);
      }
      
      if (authorHandle && !existingEntry.authorHandle) {
        existingEntry.authorHandle = authorHandle;
      }
      
      return Promise.resolve();
    }

    // Create new entry
    const entry: PreloadEntry = {
      status: 'queued',
      preloadFn,
      stillNeeded: true,
      addedAt: Date.now(),
      authorHandle,
      readyCallbacks: []
    };

    this.preloadQueue.set(uri, entry);
    
    if (priority) {
      this.priorityUris.add(uri);
    }

    this.notifyStatusUpdate(uri, 'queued');
    this.processQueue();
    
    return Promise.resolve();
  }

  /**
   * Efficiently add multiple videos to the preload queue in a single batch operation.
   * Optimized for cursor-based loading with priority based on position.
   */
  batchAddToPreloadQueue(
    uris: string[],
    priorityUris: string[] = [],
    cursorPosition?: number
  ): Promise<void> {
    const prioritySet = new Set(priorityUris);
    
    // Sort URIs by cursor position if provided for better loading order
    const sortedUris = cursorPosition !== undefined 
      ? uris.sort((a, b) => {
          // Prioritize URIs closer to cursor position
          const aIndex = uris.indexOf(a);
          const bIndex = uris.indexOf(b);
          const aDistance = Math.abs(aIndex - cursorPosition);
          const bDistance = Math.abs(bIndex - cursorPosition);
          return aDistance - bDistance;
        })
      : uris;
    
    for (const uri of sortedUris) {
      if (!this.preloadQueue.has(uri)) {
        const entry: PreloadEntry = {
          status: 'queued',
          preloadFn: () => Promise.resolve(),
          stillNeeded: true,
          addedAt: Date.now()
        };
        
        this.preloadQueue.set(uri, entry);
        this.notifyStatusUpdate(uri, 'queued');
      }
      
      if (prioritySet.has(uri)) {
        this.priorityUris.add(uri);
      }
    }
    
    this.processQueue();
    return Promise.resolve();
  }

  /**
   * Add a profile to the preload queue
   */
  async addProfileToPreloadQueue(
    handle: string,
    priority: boolean = false
  ): Promise<void> {
    if (this.profilePreloadQueue.has(handle)) {
      if (priority && !this.priorityProfiles.has(handle)) {
        this.priorityProfiles.add(handle);
      }
      return;
    }

    const preloadFn = async () => {
      return await ProfileCache.getProfile(handle);
    };

    const entry: ProfilePreloadEntry = {
      handle,
      status: 'queued',
      preloadFn,
      stillNeeded: true,
      addedAt: Date.now()
    };

    this.profilePreloadQueue.set(handle, entry);
    
    if (priority) {
      this.priorityProfiles.add(handle);
    }

    this.processProfileQueue();
  }

  /**
   * Sets priority for certain URIs to be preloaded first
   */
  setPriorityUris(uris: string[]): void {
    this.priorityUris.clear();
    uris.forEach(uri => this.priorityUris.add(uri));
    this.processQueue();
  }

  /**
   * Optimized queue processing
   */
  processQueue(): void {
    if (this.currentlyPreloading >= this.maxPreloadCount) {
      return;
    }

    // Get priority items first
    const priorityEntries = Array.from(this.preloadQueue.entries())
      .filter(([uri, entry]) => 
        this.priorityUris.has(uri) && 
        entry.status === 'queued' && 
        entry.stillNeeded
      )
      .sort((a, b) => a[1].addedAt - b[1].addedAt);

    // Get regular items
    const regularEntries = Array.from(this.preloadQueue.entries())
      .filter(([uri, entry]) => 
        !this.priorityUris.has(uri) && 
        entry.status === 'queued' && 
        entry.stillNeeded
      )
      .sort((a, b) => a[1].addedAt - b[1].addedAt);

    const allEntries = [...priorityEntries, ...regularEntries];
    
    for (const [uri, entry] of allEntries) {
      if (this.currentlyPreloading >= this.maxPreloadCount) break;
      
      this.currentlyPreloading++;
      entry.status = 'preloading';
      this.notifyStatusUpdate(uri, 'preloading');

      entry.preloadFn()
        .then(() => {
          entry.status = 'preloaded';
          this.currentlyPreloading--;
          this.notifyStatusUpdate(uri, 'preloaded');
          this.processQueue();
        })
        .catch((error) => {
          entry.status = 'error';
          entry.error = error;
          this.currentlyPreloading--;
          this.notifyStatusUpdate(uri, 'error');
          this.processQueue();
        });
    }
  }

  /**
   * Process the profile preload queue
   */
  private processProfileQueue(): void {
    if (this.currentlyPreloadingProfiles >= this.maxProfilePreloadCount) {
      return;
    }

    // Get priority profiles first
    const priorityEntries = Array.from(this.profilePreloadQueue.entries())
      .filter(([handle, entry]) => 
        this.priorityProfiles.has(handle) && 
        entry.status === 'queued' && 
        entry.stillNeeded
      )
      .sort((a, b) => a[1].addedAt - b[1].addedAt);

    // Get regular profiles
    const regularEntries = Array.from(this.profilePreloadQueue.entries())
      .filter(([handle, entry]) => 
        !this.priorityProfiles.has(handle) && 
        entry.status === 'queued' && 
        entry.stillNeeded
      )
      .sort((a, b) => a[1].addedAt - b[1].addedAt);

    const allEntries = [...priorityEntries, ...regularEntries];
    
    for (const [handle, entry] of allEntries) {
      if (this.currentlyPreloadingProfiles >= this.maxProfilePreloadCount) break;
      
      this.currentlyPreloadingProfiles++;
      entry.status = 'preloading';

      entry.preloadFn()
        .then(() => {
          entry.status = 'preloaded';
          this.currentlyPreloadingProfiles--;
          this.processProfileQueue();
        })
        .catch((error) => {
          entry.status = 'error';
          entry.error = error;
          this.currentlyPreloadingProfiles--;
          this.processProfileQueue();
        });
    }
  }

  /**
   * Subscribe to status updates for a specific video.
   */
  subscribeToStatusUpdates(uri: string, callback: (status: string) => void): () => void {
    if (!this.statusUpdateCallbacks.has(uri)) {
      this.statusUpdateCallbacks.set(uri, new Set());
    }
    
    const callbacks = this.statusUpdateCallbacks.get(uri)!;
    callbacks.add(callback);
    
    // Check current status and notify immediately
    const entry = this.preloadQueue.get(uri);
    if (entry) {
      callback(entry.status);
    }
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.statusUpdateCallbacks.get(uri);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.statusUpdateCallbacks.delete(uri);
        }
      }
    };
  }
  
  /**
   * Notify subscribers of status updates
   */
  private notifyStatusUpdate(uri: string, status: string): void {
    const callbacks = this.statusUpdateCallbacks.get(uri);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(status);
        } catch (error) {
          console.warn('Error in status update callback:', error);
        }
      });
    }
  }

  /**
   * Mark videos as not needed if they're not in the list of active URIs.
   */
  clearUnneededVideos(activeVideoUris: string[]): void {
    const activeSet = new Set(activeVideoUris);
    const urisToDelete: string[] = [];
    
    for (const [uri, entry] of this.preloadQueue.entries()) {
      if (!activeSet.has(uri)) {
        entry.stillNeeded = false;
        if (entry.status === 'queued') {
          urisToDelete.push(uri);
        }
      }
    }
    
    for (const uri of urisToDelete) {
      this.preloadQueue.delete(uri);
      this.priorityUris.delete(uri);
      this.statusUpdateCallbacks.delete(uri);
    }
  }

  /**
   * Clear unneeded profiles from the queue
   */
  clearUnneededProfiles(activeHandles: string[]): void {
    const activeSet = new Set(activeHandles);
    const handlesToDelete: string[] = [];
    
    for (const [handle, entry] of this.profilePreloadQueue.entries()) {
      if (!activeSet.has(handle)) {
        entry.stillNeeded = false;
        if (entry.status === 'queued') {
          handlesToDelete.push(handle);
        }
      }
    }
    
    for (const handle of handlesToDelete) {
      this.profilePreloadQueue.delete(handle);
      this.priorityProfiles.delete(handle);
    }
  }

  /**
   * Clean up the preload queue by removing entries that are no longer needed.
   */
  cleanupQueue(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const urisToDelete: string[] = [];
    
    for (const [uri, entry] of this.preloadQueue.entries()) {
      if (!entry.stillNeeded || (now - entry.addedAt > maxAge)) {
        if (entry.status !== 'preloading') {
          urisToDelete.push(uri);
        }
      }
    }
    
    for (const uri of urisToDelete) {
      this.preloadQueue.delete(uri);
      this.priorityUris.delete(uri);
      this.statusUpdateCallbacks.delete(uri);
    }
    
    // Also cleanup profiles
    this.cleanupProfileQueue();
  }

  /**
   * Clean up the profile preload queue
   */
  private cleanupProfileQueue(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const handlesToDelete: string[] = [];
    
    for (const [handle, entry] of this.profilePreloadQueue.entries()) {
      if (!entry.stillNeeded || (now - entry.addedAt > maxAge)) {
        if (entry.status !== 'preloading') {
          handlesToDelete.push(handle);
        }
      }
    }
    
    for (const handle of handlesToDelete) {
      this.profilePreloadQueue.delete(handle);
      this.priorityProfiles.delete(handle);
    }
  }

  /**
   * Check if a video is preloaded.
   */
  async isPreloaded(uri: string): Promise<boolean> {
    const entry = this.preloadQueue.get(uri);
    return entry ? entry.status === 'preloaded' : false;
  }

  /**
   * Get the preload status of a video.
   */
  getPreloadStatus(uri: string): 'queued' | 'preloading' | 'preloaded' | 'error' | null {
    const entry = this.preloadQueue.get(uri);
    return entry ? entry.status : null;
  }

  /**
   * Wait for a video to be preloaded.
   */
  waitForPreload(uri: string): Promise<void> {
    return new Promise((resolve) => {
      const entry = this.preloadQueue.get(uri);
      if (!entry) {
        resolve();
        return;
      }
      
      if (entry.status === 'preloaded') {
        resolve();
        return;
      }
      
      if (!entry.readyCallbacks) {
        entry.readyCallbacks = [];
      }
      
      entry.readyCallbacks.push(() => resolve());
    });
  }

  /**
   * Get all preloading or queued URIs.
   */
  getAllPreloadingUris(): string[] {
    return Array.from(this.preloadQueue.entries())
      .filter(([_, entry]) => entry.status === 'preloading')
      .map(([uri, _]) => uri);
  }

  /**
   * Get all preloaded URIs.
   */
  getPreloadedUris(): string[] {
    return Array.from(this.preloadQueue.entries())
      .filter(([_, entry]) => entry.status === 'preloaded')
      .map(([uri, _]) => uri);
  }
  
  /**
   * Get all preloaded, preloading and queued URIs with their status.
   */
  getAllVideoStates(): Map<string, string> {
    const states = new Map<string, string>();
    for (const [uri, entry] of this.preloadQueue.entries()) {
      states.set(uri, entry.status);
    }
    return states;
  }

  /**
   * Get the current preload queue statistics.
   */
  getQueueStats(): { total: number; queued: number; preloading: number; preloaded: number; errors: number } {
    const stats = { total: 0, queued: 0, preloading: 0, preloaded: 0, errors: 0 };
    
    for (const [_, entry] of this.preloadQueue.entries()) {
      stats.total++;
      switch (entry.status) {
        case 'queued':
          stats.queued++;
          break;
        case 'preloading':
          stats.preloading++;
          break;
        case 'preloaded':
          stats.preloaded++;
          break;
        case 'error':
          stats.errors++;
          break;
      }
    }
    
    return stats;
  }

  /**
   * Reset the preload manager, clearing all queues.
   */
  reset(): void {
    this.preloadQueue.clear();
    this.profilePreloadQueue.clear();
    this.priorityUris.clear();
    this.priorityProfiles.clear();
    this.statusUpdateCallbacks.clear();
    this.currentlyPreloading = 0;
    this.currentlyPreloadingProfiles = 0;
  }

  /**
   * Cleanup method for app lifecycle management
   */
  cleanup(): void {
    try {
      // Clear memory-intensive data structures
      this.preloadQueue.clear();
      this.profilePreloadQueue.clear();
      this.priorityUris.clear();
      this.priorityProfiles.clear();
      this.statusUpdateCallbacks.clear();
      
      // Reset counters
      this.currentlyPreloading = 0;
      this.currentlyPreloadingProfiles = 0;
    } catch (error) {
      console.error('[VideoPreloadManager] Error during cleanup:', error);
    }
  }

  /**
   * Initialize/reinitialize the VideoPreloadManager
   */
  initialize(): void {
    try {
      // No specific initialization needed
    } catch (error) {
      console.error('[VideoPreloadManager] Error during initialization:', error);
    }
  }
}

// Export a singleton instance.
export default new VideoPreloadManager();