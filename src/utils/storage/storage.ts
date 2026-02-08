/**
 * Centralized Storage Utility
 * Uses MMKV for fast, synchronous storage operations
 */
import { MMKV } from 'react-native-mmkv';
import { logger } from '../logger';

// Create default MMKV storage instance
export const storage = new MMKV({
  id: 'mmkv.default',
});

/**
 * Storage adapter for Zustand persist middleware
 * Provides key-value interface (getItem, setItem, removeItem)
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
