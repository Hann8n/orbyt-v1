import AsyncStorage from '@react-native-async-storage/async-storage';

const WATCH_HISTORY_KEY = 'WATCH_HISTORY_URIS';

export default class WatchHistory {
  static async addToWatchHistory(uri: string): Promise<void> {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const existingData = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
            const uris = existingData ? JSON.parse(existingData) : [];
            if (!uris.includes(uri)) {
              uris.push(uri);
              await AsyncStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(uris));
            }
            resolve();
          } catch (error) {
            console.error('Error adding to watch history:', error);
            reject(error);
          }
        }, 0);
      });
    });
  }

  static async filterUnwatched(uris: string[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const existingData = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
            const watchedUris = existingData ? JSON.parse(existingData) : [];
            console.debug(`[WatchHistory] Filtering ${uris.length} videos against ${watchedUris.length} watched videos`);
            
            // Process filtering in chunks to avoid blocking main thread
            const chunkSize = 100;
            const filteredChunks: string[] = [];
            
            for (let i = 0; i < uris.length; i += chunkSize) {
              const chunk = uris.slice(i, i + chunkSize);
              const filteredChunk = chunk.filter(uri => !watchedUris.includes(uri));
              filteredChunks.push(...filteredChunk);
              
              // Yield control between chunks
              if (i + chunkSize < uris.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
              }
            }
            
            console.debug(`[WatchHistory] After filtering, ${filteredChunks.length} videos remain`);
            resolve(filteredChunks);
          } catch (error) {
            console.error('Error filtering unwatched URIs:', error);
            resolve(uris);
          }
        }, 0);
      });
    });
  }
  
  // Add debug helper method - moved to background
  static async getWatchHistoryCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const existingData = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
            const uris = existingData ? JSON.parse(existingData) : [];
            resolve(uris.length);
          } catch (error) {
            console.error('Error getting watch history count:', error);
            resolve(0);
          }
        }, 0);
      });
    });
  }
  
  // Add method to clear watch history for testing - moved to background
  static async clearWatchHistory(): Promise<void> {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            await AsyncStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify([]));
            console.debug('[WatchHistory] Watch history cleared');
            resolve();
          } catch (error) {
            console.error('Error clearing watch history:', error);
            reject(error);
          }
        }, 0);
      });
    });
  }

  // Add method to check if a URI is in the watch history - moved to background
  static async isWatched(uri: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const existingData = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
            const uris = existingData ? JSON.parse(existingData) : [];
            resolve(uris.includes(uri));
          } catch (error) {
            console.error('Error checking if URI is watched:', error);
            resolve(false);
          }
        }, 0);
      });
    });
  }

  // Add method to get the watch history - moved to background
  static async getWatchHistory(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const existingData = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
            resolve(existingData ? JSON.parse(existingData) : []);
          } catch (error) {
            console.error('Error getting watch history:', error);
            resolve([]);
          }
        }, 0);
      });
    });
  }
}