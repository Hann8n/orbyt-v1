/**
 * Centralized Storage Utility
 * Uses MMKV for fast, synchronous storage operations
 * Provides AsyncStorage-compatible API for easy migration
 */
import { MMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

// Create default MMKV storage instance
export const storage = new MMKV({
  id: 'mmkv.default',
});

/**
 * Migrate data from AsyncStorage to MMKV
 * Should be called once on app initialization
 * Follows official MMKV migration pattern: https://github.com/mrousavy/react-native-mmkv/blob/main/docs/MIGRATE_FROM_ASYNC_STORAGE.md
 * 
 * TODO: Remove `hasMigratedFromAsyncStorage` after a while (when everyone has migrated)
 */
const MIGRATION_FLAG_KEY = 'hasMigratedFromAsyncStorage';

// Check if migration has already completed
export const hasMigratedFromAsyncStorage = storage.getBoolean(MIGRATION_FLAG_KEY) ?? false;

export async function migrateAsyncStorageToMMKV(): Promise<void> {
  try {
    // Check if migration already completed
    if (hasMigratedFromAsyncStorage) {
      return;
    }

    logger.info('Migrating from AsyncStorage -> MMKV...');
    const start = global.performance?.now() ?? Date.now();

    const keys = await AsyncStorage.getAllKeys();
    if (keys.length === 0) {
      // No data to migrate, mark as complete
      storage.set(MIGRATION_FLAG_KEY, true);
      return;
    }

    let migratedCount = 0;

    // Migrate all keys from AsyncStorage to MMKV
    for (const key of keys) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value != null) {
          // Handle boolean strings ('true'/'false') - convert to actual booleans
          if (['true', 'false'].includes(value)) {
            storage.set(key, value === 'true');
          } else {
            storage.set(key, value);
          }
          // Remove from AsyncStorage after successful migration
          await AsyncStorage.removeItem(key);
          migratedCount++;
        }
      } catch (error) {
        logger.error(`Failed to migrate key "${key}" from AsyncStorage to MMKV!`, error);
        // Continue with other keys even if one fails
      }
    }

    // Mark migration as complete
    storage.set(MIGRATION_FLAG_KEY, true);

    const end = global.performance?.now() ?? Date.now();
    const duration = end - start;
    logger.info(`Migrated ${migratedCount} keys from AsyncStorage -> MMKV in ${duration.toFixed(2)}ms`);
  } catch (error) {
    logger.error('Error during AsyncStorage migration', error);
    // Don't mark as complete if migration failed - allow retry on next app start
  }
}

/**
 * Storage adapter for Zustand persist middleware
 * Provides AsyncStorage-compatible interface
 */
export const storageAdapter = {
  getItem: (name: string): Promise<string | null> => {
    try {
      const value = storage.getString(name);
      return Promise.resolve(value ?? null);
    } catch (error) {
      logger.error(`Error getting item ${name}`, error);
      return Promise.resolve(null);
    }
  },
  setItem: (name: string, value: string): Promise<void> => {
    try {
      storage.set(name, value);
      return Promise.resolve();
    } catch (error) {
      logger.error(`Error setting item ${name}`, error);
      return Promise.reject(error);
    }
  },
  removeItem: (name: string): Promise<void> => {
    try {
      storage.delete(name);
      return Promise.resolve();
    } catch (error) {
      logger.error(`Error removing item ${name}`, error);
      return Promise.reject(error);
    }
  },
};

/**
 * Helper functions for direct storage operations
 * These match AsyncStorage API for easy migration
 */
export const storageHelpers = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = storage.getString(key);
      return value ?? null;
    } catch (error) {
      logger.error(`Error getting item ${key}`, error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      storage.set(key, value);
    } catch (error) {
      logger.error(`Error setting item ${key}`, error);
      throw error;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      storage.delete(key);
    } catch (error) {
      logger.error(`Error removing item ${key}`, error);
      throw error;
    }
  },
  getAllKeys: async (): Promise<string[]> => {
    try {
      return storage.getAllKeys();
    } catch (error) {
      logger.error('Error getting all keys', error);
      return [];
    }
  },
  clear: async (): Promise<void> => {
    try {
      storage.clearAll();
    } catch (error) {
      logger.error('Error clearing storage', error);
      throw error;
    }
  },
};

