/**
 * VideoPreloadManager.tsx
 * Manages the preloading and unloading of videos to optimize performance.
 * Simplified and optimized for React Query integration.
 */

import ProfileCache from './cache/ProfileCache';

interface PreloadStatus {
  status: 'queued' | 'preloading' | 'preloaded' | 'error';
}

interface BasePreloadEntry extends PreloadStatus {
  preloadFn: () => Promise<any>;
  stillNeeded: boolean;
  addedAt: number;
  error?: any;
  readyCallbacks?: Array<() => void>;
}

interface VideoPreloadEntry extends BasePreloadEntry {
  type: 'video';
  authorHandle?: string;
}

interface ProfilePreloadEntry extends BasePreloadEntry {
  type: 'profile';
  handle: string;
}

type PreloadEntry = VideoPreloadEntry | ProfilePreloadEntry;

class VideoPreloadManager {
  private preloadQueue: Map<string, PreloadEntry>;
  private maxConcurrentPreloads: number;
  private currentlyPreloading: number;
  private priorityItems: Set<string>;
  private statusUpdateCallbacks: Map<string, Set<(status: string) => void>>;

  constructor() {
    this.preloadQueue = new Map<string, PreloadEntry>();
    this.maxConcurrentPreloads = 8;
    this.currentlyPreloading = 0;
    this.priorityItems = new Set<string>();
    this.statusUpdateCallbacks = new Map();
  }

  /**
   * Unified method to add items to the preload queue
   */
  private addToQueue(
    key: string,
    entry: PreloadEntry,
    priority: boolean = false
  ): Promise<void> {
    if (this.preloadQueue.has(key)) {
      const existingEntry = this.preloadQueue.get(key)!;
      
      if (priority && !this.priorityItems.has(key)) {
        this.priorityItems.add(key);
      }
      
      // Update video-specific fields if needed
      if (entry.type === 'video' && existingEntry.type === 'video') {
        const videoEntry = entry as VideoPreloadEntry;
        const existingVideoEntry = existingEntry as VideoPreloadEntry;
        if (videoEntry.authorHandle && !existingVideoEntry.authorHandle) {
          existingVideoEntry.authorHandle = videoEntry.authorHandle;
        }
      }
      
      return Promise.resolve();
    }

    this.preloadQueue.set(key, entry);
    
    if (priority) {
      this.priorityItems.add(key);
    }

    this.notifyStatusUpdate(key, 'queued');
    this.processQueue();
    
    return Promise.resolve();
  }

  /**
   * Add a video to the preload queue.
   */
  addToPreloadQueue(
    uri: string, 
    preloadFn: () => Promise<any>, 
    priority: boolean = false,
    authorHandle?: string
  ): Promise<void> {
    const entry: VideoPreloadEntry = {
      type: 'video',
      status: 'queued',
      preloadFn,
      stillNeeded: true,
      addedAt: Date.now(),
      authorHandle,
      readyCallbacks: []
    };

    return this.addToQueue(uri, entry, priority);
  }

  /**
   * Add multiple videos to the preload queue efficiently.
   */
  addVideosToPreloadQueue(
    uris: string[],
    priorityUris: string[] = []
  ): Promise<void> {
    const prioritySet = new Set(priorityUris);
    
    for (const uri of uris) {
      if (!this.preloadQueue.has(uri)) {
        const preloadFn = async () => {
          // Simple HTTP HEAD request to preload video metadata
          return fetch(uri, { method: 'HEAD' })
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              return response;
            });
        };
        
        const entry: VideoPreloadEntry = {
          type: 'video',
          status: 'queued',
          preloadFn,
          stillNeeded: true,
          addedAt: Date.now(),
          readyCallbacks: []
        };
        
        this.preloadQueue.set(uri, entry);
        this.notifyStatusUpdate(uri, 'queued');
      }
      
      if (prioritySet.has(uri)) {
        this.priorityItems.add(uri);
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
    const preloadFn = async () => {
      return await ProfileCache.getProfile(handle);
    };

    const entry: ProfilePreloadEntry = {
      type: 'profile',
      handle,
      status: 'queued',
      preloadFn,
      stillNeeded: true,
      addedAt: Date.now()
    };

    return this.addToQueue(handle, entry, priority);
  }

  /**
   * Unified queue processing for both videos and profiles
   */
  private processQueue(): void {
    if (this.currentlyPreloading >= this.maxConcurrentPreloads) {
      return;
    }

    // Get priority items first
    const priorityEntries = Array.from(this.preloadQueue.entries())
      .filter(([key, entry]) => 
        this.priorityItems.has(key) && 
        entry.status === 'queued' && 
        entry.stillNeeded
      )
      .sort((a, b) => a[1].addedAt - b[1].addedAt);

    // Get regular items
    const regularEntries = Array.from(this.preloadQueue.entries())
      .filter(([key, entry]) => 
        !this.priorityItems.has(key) && 
        entry.status === 'queued' && 
        entry.stillNeeded
      )
      .sort((a, b) => a[1].addedAt - b[1].addedAt);

    const allEntries = [...priorityEntries, ...regularEntries];
    
    for (const [key, entry] of allEntries) {
      if (this.currentlyPreloading >= this.maxConcurrentPreloads) break;
      
      this.currentlyPreloading++;
      entry.status = 'preloading';
      this.notifyStatusUpdate(key, 'preloading');

      entry.preloadFn()
        .then(() => {
          entry.status = 'preloaded';
          this.currentlyPreloading--;
          this.notifyStatusUpdate(key, 'preloaded');
          this.processQueue();
        })
        .catch((error) => {
          entry.status = 'error';
          entry.error = error;
          this.currentlyPreloading--;
          this.notifyStatusUpdate(key, 'error');
          this.processQueue();
        });
    }
  }

  /**
   * Subscribe to status updates for a specific item.
   */
  subscribeToStatusUpdates(key: string, callback: (status: string) => void): () => void {
    if (!this.statusUpdateCallbacks.has(key)) {
      this.statusUpdateCallbacks.set(key, new Set());
    }
    
    const callbacks = this.statusUpdateCallbacks.get(key)!;
    callbacks.add(callback);
    
    const entry = this.preloadQueue.get(key);
    if (entry) {
      callback(entry.status);
    }
    
    return () => {
      const callbacks = this.statusUpdateCallbacks.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.statusUpdateCallbacks.delete(key);
        }
      }
    };
  }
  
  /**
   * Notify subscribers of status updates
   */
  private notifyStatusUpdate(key: string, status: string): void {
    const callbacks = this.statusUpdateCallbacks.get(key);
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
   * Clear unneeded items from the queue
   */
  clearUnneededItems(activeKeys: string[]): void {
    const activeSet = new Set(activeKeys);
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.preloadQueue.entries()) {
      if (!activeSet.has(key)) {
        entry.stillNeeded = false;
        if (entry.status === 'queued') {
          keysToDelete.push(key);
        }
      }
    }
    
    for (const key of keysToDelete) {
      this.preloadQueue.delete(key);
      this.priorityItems.delete(key);
      this.statusUpdateCallbacks.delete(key);
    }
  }

  /**
   * Clear unneeded videos from the queue
   */
  clearUnneededVideos(activeVideoUris: string[]): void {
    this.clearUnneededItems(activeVideoUris);
  }

  /**
   * Clear unneeded profiles from the queue
   */
  clearUnneededProfiles(activeHandles: string[]): void {
    this.clearUnneededItems(activeHandles);
  }

  /**
   * Clean up the preload queue
   */
  cleanupQueue(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.preloadQueue.entries()) {
      if (!entry.stillNeeded || (now - entry.addedAt > maxAge)) {
        if (entry.status !== 'preloading') {
          keysToDelete.push(key);
        }
      }
    }
    
    for (const key of keysToDelete) {
      this.preloadQueue.delete(key);
      this.priorityItems.delete(key);
      this.statusUpdateCallbacks.delete(key);
    }
  }

  /**
   * Check if a video is preloaded.
   */
  async isPreloaded(uri: string): Promise<boolean> {
    const entry = this.preloadQueue.get(uri);
    return entry && entry.type === 'video' ? entry.status === 'preloaded' : false;
  }

  /**
   * Get the preload status of a video.
   */
  getPreloadStatus(uri: string): 'queued' | 'preloading' | 'preloaded' | 'error' | null {
    const entry = this.preloadQueue.get(uri);
    return entry && entry.type === 'video' ? entry.status : null;
  }

  /**
   * Wait for a video to be preloaded.
   */
  waitForPreload(uri: string): Promise<void> {
    return new Promise((resolve) => {
      const entry = this.preloadQueue.get(uri);
      if (!entry || entry.type !== 'video') {
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
      .filter(([_, entry]) => entry.type === 'video' && entry.status === 'preloading')
      .map(([uri, _]) => uri);
  }

  /**
   * Get all preloaded URIs.
   */
  getPreloadedUris(): string[] {
    return Array.from(this.preloadQueue.entries())
      .filter(([_, entry]) => entry.type === 'video' && entry.status === 'preloaded')
      .map(([uri, _]) => uri);
  }
  
  /**
   * Get all preloaded, preloading and queued URIs with their status.
   */
  getAllVideoStates(): Map<string, string> {
    const states = new Map<string, string>();
    for (const [key, entry] of this.preloadQueue.entries()) {
      if (entry.type === 'video') {
        states.set(key, entry.status);
      }
    }
    return states;
  }

  /**
   * Get the current preload queue statistics.
   */
  getQueueStats(): { total: number; queued: number; preloading: number; preloaded: number; errors: number } {
    const stats = { total: 0, queued: 0, preloading: 0, preloaded: 0, errors: 0 };
    
    for (const [_, entry] of this.preloadQueue.entries()) {
      if (entry.type === 'video') {
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
    }
    
    return stats;
  }

  /**
   * Reset the preload manager, clearing all queues.
   */
  reset(): void {
    this.preloadQueue.clear();
    this.priorityItems.clear();
    this.statusUpdateCallbacks.clear();
    this.currentlyPreloading = 0;
  }

  /**
   * Cleanup method for app lifecycle management
   */
  cleanup(): void {
    try {
      this.preloadQueue.clear();
      this.priorityItems.clear();
      this.statusUpdateCallbacks.clear();
      this.currentlyPreloading = 0;
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

  /**
   * Set the current video and prioritize the next N videos for preloading.
   */
  prioritizeNextVideos(currentUri: string, allUris: string[], lookahead: number = 3): void {
    const currentIdx = allUris.indexOf(currentUri);
    if (currentIdx === -1) return;
    const nextUris = allUris.slice(currentIdx + 1, currentIdx + 1 + lookahead);
    this.priorityItems.clear();
    nextUris.forEach(uri => this.priorityItems.add(uri));
    if (currentUri) {
      this.priorityItems.add(currentUri);
    }
    this.processQueue();
  }
}

// Export a singleton instance.
export default new VideoPreloadManager();