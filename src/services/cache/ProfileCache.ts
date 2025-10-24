import AsyncStorage from '@react-native-async-storage/async-storage';
import AtprotoService from '../api/AtprotoService';
import { extractColorsFromImage, isColorDark } from '@/utils/formatting/colorUtils';
import { 
  useQuery, 
  useMutation,
  useQueryClient, 
  QueryKey,
  UseQueryResult,
  QueryFunction
} from '@tanstack/react-query';
import ImageColors from 'react-native-image-colors';
import { useCallback, useState, useEffect } from 'react';


export interface CachedProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  profileColors?: {
    backgroundColor: string;
    foregroundColor: string;
    statusBarStyle: 'light' | 'dark';
  };
  verification?: {
    isVerified: boolean;
    verifiedBy?: string; // DID of the verifier
    verifierHandle?: string; // Handle of the verifier
    verifiedAt?: string; // ISO date string
    isOfficial?: boolean; // Whether this is an official Bluesky verification
    status?: string; // Verification status (valid, etc.)
    trustedVerifierStatus?: string; // Trusted verifier status (active, none)
    verifications?: Array<{
      issuer: string; // DID of the verifier
      uri: string; // Verification URI
      isValid: boolean; // Whether the verification is valid
      createdAt: string; // ISO date string
    }>;
  };
  lastUpdated: number; // timestamp
}

// React Query keys as a const to ensure type safety
export const profileKeys = {
  all: ['profiles'] as const,
  lists: () => [...profileKeys.all, 'list'] as const,
  list: (filters: string) => [...profileKeys.lists(), { filters }] as const,
  details: () => [...profileKeys.all, 'detail'] as const,
  detail: (handle: string) => [...profileKeys.details(), handle] as const,
  refresh: (handle: string) => [...profileKeys.detail(handle), 'refresh', Date.now()] as const,
} as const;

// Type for profile colors returned by the hook
export interface ProfileColorScheme {
  backgroundColor: string;
  foregroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  statusBarStyle: 'light' | 'dark';
}

// Make cache expiry public but readonly
export const PROFILE_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

class ProfileCache {
  private static CACHE_KEY_PREFIX = 'profile_cache_';
  private static currentUserDid: string | null = null;
  private static currentUserHandle: string | null = null;
  private static memoryCache: Map<string, CachedProfile> = new Map();
  private static DEBUG = false;
  private static cacheUpdateCallbacks: Map<string, Set<() => void>> = new Map();
  private static isInitialized = false;

  private static initialize() {
    if (this.isInitialized) return;
    
    // Don't clear cache on initialization - preserve existing cache
    // Only initialize the flag and any necessary setup
    this.isInitialized = true;
    

  }

  // React Query integration
  static getQueryKey(handle: string): QueryKey {
    this.initialize();
    return profileKeys.detail(handle.toLowerCase());
  }

  // Make CACHE_EXPIRY accessible for React Query hooks
  static get cacheExpiry(): number {
    this.initialize();
    return PROFILE_CACHE_EXPIRY;
  }

  /**
   * Sets the current user's DID for following status checks
   */
  static setCurrentUserDid(did: string) {
    this.currentUserDid = did;
  }

  /**
   * Gets the current user's DID
   */
  static getCurrentUserDid(): string | null {
    return this.currentUserDid;
  }

  /**
   * Sets the current user's handle for following status checks
   */
  static setCurrentUserHandle(handle: string) {
    this.currentUserHandle = handle;
  }

  /**
   * Gets the current user's handle
   */
  static getCurrentUserHandle(): string | null {
    return this.currentUserHandle;
  }


  /**
   * Get a profile from memory cache by DID synchronously (for immediate access)
   * This prevents flashing by providing instant access to cached data
   */
  static getProfileFromCacheSyncByDid(did: string): CachedProfile | null {
    if (!did) return null;
    
    this.initialize();
    
    // Return from memory cache immediately
    const memoryCached = this.memoryCache.get(did);
    if (memoryCached && this.isCacheValid(memoryCached)) {
      return memoryCached;
    }
    
    return null;
  }

  /**
   * Get a profile from memory cache by handle synchronously (for immediate access) (legacy)
   * This prevents flashing by providing instant access to cached data
   */
  static getProfileFromCacheSync(handle: string): CachedProfile | null {
    if (!handle) return null;
    
    this.initialize();
    
    // Clean handle format
    let cleanHandle = handle.trim().toLowerCase();
    if (cleanHandle.includes('://') || cleanHandle.includes('/')) {
      const parts = cleanHandle.split('/');
      for (const part of parts) {
        if (part.includes('.')) {
          cleanHandle = part;
          break;
        }
      }
    }
    
    // Return from memory cache immediately
    const memoryCached = this.memoryCache.get(cleanHandle);
    if (memoryCached && this.isCacheValid(memoryCached)) {
      return memoryCached;
    }
    
    return null;
  }

  /**
   * Get a profile by DID, with caching and background refresh
   * This is the preferred method as DIDs are stable identifiers
   */
  static async getProfileByDid(did: string): Promise<CachedProfile | null> {
    if (!did) return null;
    
    this.initialize();
    
    try {
      // Check memory cache first (fastest)
      const memoryCached = this.memoryCache.get(did);
      if (memoryCached && this.isCacheValid(memoryCached)) {
        return memoryCached;
      }
      
      // Try to get from async storage
      const cachedProfile = await this.getProfileFromCacheByDid(did);
      
      // If found in cache and not expired, store in memory and return it
      if (cachedProfile && this.isCacheValid(cachedProfile)) {
        this.memoryCache.set(did, cachedProfile);
        return cachedProfile;
      }
      
      // Otherwise fetch fresh profile data
      const freshProfile = await this.fetchAndCacheProfileByDid(did);
      if (freshProfile) {
        this.memoryCache.set(did, freshProfile);
      }
      return freshProfile;
    } catch (error) {
      // If there's an error fetching fresh data but we have cached data, return that
      try {
        const cachedProfile = await this.getProfileFromCacheByDid(did);
        if (cachedProfile) {
          this.memoryCache.set(did, cachedProfile);
          return cachedProfile;
        }
      } catch (cacheError) {
        return null;
      }
      return null;
    }
  }


  static async getProfile(handle: string): Promise<CachedProfile | null> {
    if (!handle) return null;
    
    this.initialize();
    
    try {
      // Ensure handle is properly formatted
      let cleanHandle = handle.trim().toLowerCase();
      
      // If handle contains a URL or protocol, extract just the handle part
      if (cleanHandle.includes('://') || cleanHandle.includes('/')) {
        const parts = cleanHandle.split('/');
        for (const part of parts) {
          if (part.includes('.')) {
            cleanHandle = part;
            break;
          }
        }
      }
      
      // Special case for verifier handles which might not follow standard format
      if (cleanHandle !== 'verifier' && cleanHandle !== 'bsky.app') {
        // Check for valid handle format (should contain at least one dot)
        if (!cleanHandle.includes('.')) {
          return null;
        }
      }
      
      // Check memory cache first (fastest)
      const memoryCached = this.memoryCache.get(cleanHandle);
      if (memoryCached && this.isCacheValid(memoryCached)) {
        return memoryCached;
      }
      
      // Try to get from async storage
      const cachedProfile = await this.getProfileFromCache(cleanHandle);
      
      // If found in cache and not expired, store in memory and return it
      if (cachedProfile && this.isCacheValid(cachedProfile)) {
        this.memoryCache.set(cleanHandle, cachedProfile);
        return cachedProfile;
      }
      
      // Otherwise fetch fresh profile data
      const freshProfile = await this.fetchAndCacheProfile(cleanHandle);
      if (freshProfile) {
        this.memoryCache.set(cleanHandle, freshProfile);
      }
      return freshProfile;
    } catch (error) {
      // If there's an error fetching fresh data but we have cached data, return that
      try {
        const normalizedHandle = handle.trim().toLowerCase();
        const cachedProfile = await this.getProfileFromCache(normalizedHandle);
        if (cachedProfile) {
          this.memoryCache.set(normalizedHandle, cachedProfile);
          return cachedProfile;
        }
      } catch (cacheError) {
        return null;
      }
      return null;
    }
  }

  /**
   * Force refresh a profile by DID, ignoring the cache
   * Useful for React Query's refetch operations
   */
  static async refreshProfileByDid(did: string): Promise<CachedProfile | null> {
    if (!did) return null;
    
    return new Promise((resolve) => {
      // Move refresh to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const freshProfile = await this.fetchAndCacheProfileByDid(did);
            this.notifyProfileUpdated(did);
            resolve(freshProfile);
          } catch (error) {
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Force refresh a profile by handle, ignoring the cache (legacy)
   * Useful for React Query's refetch operations
   */
  static async refreshProfile(handle: string): Promise<CachedProfile | null> {
    if (!handle) return null;
    
    return new Promise((resolve) => {
      // Move refresh to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {

            
            const normalizedHandle = handle.toLowerCase();
            const freshProfile = await this.fetchAndCacheProfile(normalizedHandle);
            this.notifyProfileUpdated(normalizedHandle);
            resolve(freshProfile);
          } catch (error) {
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Pre-cache a list of profiles
   * Optimized to avoid redundant network requests
   */
  static async cacheProfiles(profiles: any[]): Promise<void> {
    if (!profiles || profiles.length === 0) return;

    return new Promise((resolve) => {
      // Move batch operations to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            // Process profiles with controlled concurrency in smaller batches
            const batchSize = 3;
            for (let i = 0; i < profiles.length; i += batchSize) {
              const batch = profiles.slice(i, i + batchSize);
              
              await Promise.all(batch.map(async (profile) => {
                const handle = profile.handle;
                if (!handle) return;
                
                const normalizedHandle = handle.toLowerCase();

                // Skip if already in memory cache and valid
                const memoryCached = this.memoryCache.get(normalizedHandle);
                if (memoryCached && this.isCacheValid(memoryCached)) {
                  return;
                }
                
                // Skip if already in AsyncStorage cache and valid
                const cachedProfile = await this.getProfileFromCache(normalizedHandle);
                if (cachedProfile && this.isCacheValid(cachedProfile)) {
                  this.memoryCache.set(normalizedHandle, cachedProfile);
                  return;
                }

                // Extract profile colors
                let profileColors = undefined;
                try {
                  if (profile.avatar) {
                    profileColors = await extractColorsFromImage(profile.avatar);
                  }
                } catch (e) {
                }

                // Get following status from viewer relationship data
                const isFollowing = profile.viewer ? !!profile.viewer.following : undefined;
                const isFollowedBy = profile.viewer ? !!profile.viewer.followedBy : undefined;
                
                // Extract verification data from profile response (already included)
                let verification = undefined;
                if (profile.verification) {
                  const isVerified = 
                    profile.verification.verifiedStatus === 'valid' ||
                    profile.verification.trustedVerifierStatus === 'valid' ||
                    (profile.verification.verifications && 
                     profile.verification.verifications.length > 0 && 
                     profile.verification.verifications.some((v: any) => v.isValid));
                  
                  if (isVerified) {
                    verification = {
                      isVerified: true,
                      status: profile.verification.verifiedStatus || 'valid',
                      trustedVerifierStatus: profile.verification.trustedVerifierStatus || 'none',
                      verifications: profile.verification.verifications || [],
                      verifiedBy: profile.verification.verifications?.[0]?.issuer || 'bsky.app',
                      verifierHandle: profile.verification.trustedVerifierStatus === 'valid' ? 'Verifier' : 'bsky.app',
                      verifiedAt: profile.verification.verifications?.[0]?.createdAt || new Date().toISOString(),
                      isOfficial: profile.verification.trustedVerifierStatus !== 'valid'
                    };
                  } else {
                    verification = { isVerified: false };
                  }
                } else {
                  verification = { isVerified: false };
                }

                const cacheObject: CachedProfile = {
                  did: profile.did,
                  handle: profile.handle,
                  displayName: profile.displayName,
                  avatar: profile.avatar,
                  description: profile.description,
                  isFollowing,
                  isFollowedBy,
                  profileColors: profileColors ? {
                    backgroundColor: profileColors.backgroundColor,
                    foregroundColor: profileColors.foregroundColor,
                    statusBarStyle: profileColors.statusBarStyle,
                  } : undefined,
                  verification,
                  lastUpdated: Date.now()
                };

                // Save to both memory and persistent cache
                this.memoryCache.set(normalizedHandle, cacheObject);
                await AsyncStorage.setItem(this.getCacheKey(normalizedHandle), JSON.stringify(cacheObject));
                
                // Notify subscribers of a profile update
                this.notifyProfileUpdated(normalizedHandle);
              }));
            }
            resolve();
          } catch (error) {
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Update the following status for a profile
   * Supports optimistic updates for React Query
   */
  static async updateFollowingStatus(
    handle: string, 
    isFollowing: boolean, 
    isFollowedBy?: boolean
  ): Promise<void> {
    if (!handle) return;
    
    return new Promise((resolve) => {
      // Move updates to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const normalizedHandle = handle.toLowerCase();
            
            // Check memory cache first
            let cachedProfile = this.memoryCache.get(normalizedHandle);
            
            // If not in memory, check storage
            if (!cachedProfile) {
              cachedProfile = (await this.getProfileFromCache(normalizedHandle)) || undefined;
            }
            
            if (cachedProfile) {
              cachedProfile.isFollowing = isFollowing;
              
              // Only update isFollowedBy if provided
              if (isFollowedBy !== undefined) {
                cachedProfile.isFollowedBy = isFollowedBy;
              }
              
              cachedProfile.lastUpdated = Date.now();
              
              // Update both memory and storage
              this.memoryCache.set(normalizedHandle, cachedProfile);
              await AsyncStorage.setItem(this.getCacheKey(normalizedHandle), JSON.stringify(cachedProfile));
              
              // Notify subscribers of a profile update
              this.notifyProfileUpdated(normalizedHandle);
            }
            resolve();
          } catch (error) {
            resolve();
          }
        }, 0);
      });
    });
  }
  
  /**
   * Update the profile colors for a profile
   * @param handle - User handle
   * @param backgroundColor - Background color hex
   * @param foregroundColor - Foreground/text color hex
   */
  static async updateProfileColors(
    handle: string,
    backgroundColor: string,
    foregroundColor: string
  ): Promise<void> {
    if (!handle) return;
    
    
    return new Promise((resolve) => {
      // Move color updates to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const normalizedHandle = handle.toLowerCase();
            
            // Check memory cache first
            let cachedProfile = this.memoryCache.get(normalizedHandle);
            
            // If not in memory, check storage
            if (!cachedProfile) {
              cachedProfile = (await this.getProfileFromCache(normalizedHandle)) || undefined;
            }
            
            
            if (cachedProfile) {
              const oldColors = cachedProfile.profileColors;
              
              // Create a new colors object to avoid direct reference mutation
              cachedProfile.profileColors = {
                backgroundColor,
                foregroundColor,
                statusBarStyle: isColorDark(backgroundColor) ? 'light' : 'dark'
              };
              
              cachedProfile.lastUpdated = Date.now();
              
              
              // Update both memory and storage
              this.memoryCache.set(normalizedHandle, {...cachedProfile});
              await AsyncStorage.setItem(this.getCacheKey(normalizedHandle), JSON.stringify(cachedProfile));
              
              // Notify subscribers of a profile update
              this.notifyProfileUpdated(normalizedHandle);
              
            } else {
            }
            resolve();
          } catch (error) {
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Update the verification status for a profile
   * @param handle User handle
   * @param verification Verification data
   */
  static async updateVerification(
    handle: string,
    verification: {
      isVerified: boolean;
      verifiedBy?: string;
      verifierHandle?: string;
      verifiedAt?: string;
      isOfficial?: boolean;
      status?: string;
      trustedVerifierStatus?: string;
      verifications?: Array<{
        issuer: string;
        uri: string;
        isValid: boolean;
        createdAt: string;
      }>;
    }
  ): Promise<void> {
    if (!handle) return;
    
    return new Promise((resolve) => {
      // Move verification updates to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const normalizedHandle = handle.toLowerCase();
            
            // Check memory cache first
            let cachedProfile = this.memoryCache.get(normalizedHandle);
            
            // If not in memory, check storage
            if (!cachedProfile) {
              cachedProfile = (await this.getProfileFromCache(normalizedHandle)) || undefined;
            }
            
            if (cachedProfile) {
              cachedProfile.verification = verification;
              cachedProfile.lastUpdated = Date.now();
              
              // Update both memory and storage
              this.memoryCache.set(normalizedHandle, cachedProfile);
              await AsyncStorage.setItem(this.getCacheKey(normalizedHandle), JSON.stringify(cachedProfile));
              
              // Notify subscribers of a profile update
              this.notifyProfileUpdated(normalizedHandle);
            }
            resolve();
          } catch (error) {
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Apply a server-updated profile response into cache for a given handle
   * Ensures UI reflects the change immediately without waiting for refetch
   */
  static async applyServerProfile(handle: string, serverProfile: any): Promise<void> {
    if (!handle || !serverProfile) return;

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const normalizedHandle = (serverProfile.handle || handle).toLowerCase();

            // Start from existing cached profile to preserve derived fields like colors/verification if absent
            let cachedProfile = this.memoryCache.get(normalizedHandle) || await this.getProfileFromCache(normalizedHandle);

            const isFollowing = serverProfile.viewer ? !!serverProfile.viewer.following : cachedProfile?.isFollowing;
            const isFollowedBy = serverProfile.viewer ? !!serverProfile.viewer.followedBy : cachedProfile?.isFollowedBy;

            const merged: CachedProfile = {
              did: serverProfile.did || cachedProfile?.did || '',
              handle: serverProfile.handle || cachedProfile?.handle || normalizedHandle,
              displayName: serverProfile.displayName ?? cachedProfile?.displayName,
              avatar: serverProfile.avatar ?? cachedProfile?.avatar,
              description: serverProfile.description ?? cachedProfile?.description,
              isFollowing,
              isFollowedBy,
              profileColors: cachedProfile?.profileColors, // keep existing colors
              verification: cachedProfile?.verification,   // verification already extracted during fetch
              lastUpdated: Date.now(),
            };

            this.memoryCache.set(normalizedHandle, merged);
            await AsyncStorage.setItem(this.getCacheKey(normalizedHandle), JSON.stringify(merged));
            this.notifyProfileUpdated(normalizedHandle);
          } catch (error) {
          } finally {
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Check verification status for a profile
   * Uses cached profile data - verification data is already included in profile responses
   */
  static async checkVerification(handle: string): Promise<boolean> {
    if (!handle) return false;
    
    return new Promise((resolve) => {
      // Move verification check to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            // Get profile from cache or API
            const profile = await this.getProfile(handle);
            if (!profile) {
              resolve(false);
              return;
            }
            
            // Return verification status from cached profile data
            resolve(profile.verification?.isVerified || false);
          } catch (error) {
            resolve(false);
          }
        }, 0);
      });
    });
  }
  
  /**
   * Get verification details for a profile
   * Uses cached profile data - verification data is already included in profile responses
   */
  static async getVerificationDetails(handle: string): Promise<any | null> {
    if (!handle) return null;
    
    return new Promise((resolve) => {
      // Move verification details to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            // Get profile from cache
            const profile = await this.getProfile(handle);
            if (!profile) {
              resolve(null);
              return;
            }
            
            // Return verification data from cached profile
            resolve(profile.verification || null);
          } catch (error) {
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Subscribe to profile updates
   * Returns an unsubscribe function
   */
  static subscribeToProfileUpdates(handle: string, callback: () => void): () => void {
    if (!handle) return () => {};
    
    const normalizedHandle = handle.toLowerCase();
    
    if (!this.cacheUpdateCallbacks.has(normalizedHandle)) {
      this.cacheUpdateCallbacks.set(normalizedHandle, new Set());
    }
    
    const callbacks = this.cacheUpdateCallbacks.get(normalizedHandle)!;
    callbacks.add(callback);
    
    return () => {
      const callbackSet = this.cacheUpdateCallbacks.get(normalizedHandle);
      if (callbackSet) {
        callbackSet.delete(callback);
        if (callbackSet.size === 0) {
          this.cacheUpdateCallbacks.delete(normalizedHandle);
        }
      }
    };
  }

  /**
   * Notify subscribers that a profile has been updated
   */
  private static notifyProfileUpdated(handle: string): void {
    const normalizedHandle = handle.toLowerCase();
    const callbacks = this.cacheUpdateCallbacks.get(normalizedHandle);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback();
        } catch (e) {
        }
      });
    }
  }

  /**
   * Fetch a profile from the API by DID and cache it
   */
  private static async fetchAndCacheProfileByDid(did: string): Promise<CachedProfile | null> {
    if (!did) return null;
    
    return new Promise((resolve) => {
      // Move fetching to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const profile = await AtprotoService.getProfileByDid(did);
            if (!profile) {
              resolve(null);
              return;
            }

            let profileColors = undefined;
            if (profile.avatar) {
              try {
                profileColors = await extractColorsFromImage(profile.avatar);
              } catch (e) {
              }
            }

            // Get both sides of the follow relationship from viewer data
            const isFollowing = profile.viewer ? !!profile.viewer.following : undefined;
            const isFollowedBy = profile.viewer ? !!profile.viewer.followedBy : undefined;

            const cacheObject: CachedProfile = {
              did: profile.did,
              handle: profile.handle,
              displayName: profile.displayName,
              avatar: profile.avatar,
              description: profile.description,
              isFollowing,
              isFollowedBy,
              profileColors: profileColors ? {
                backgroundColor: profileColors.backgroundColor,
                foregroundColor: profileColors.foregroundColor,
                statusBarStyle: profileColors.statusBarStyle,
              } : undefined,
              lastUpdated: Date.now()
            };

            // Extract verification data from profile response (already included)
            if (profile.verification) {
              const isVerified = 
                profile.verification.verifiedStatus === 'valid' ||
                profile.verification.trustedVerifierStatus === 'valid' ||
                (profile.verification.verifications && 
                 profile.verification.verifications.length > 0 && 
                 profile.verification.verifications.some((v: any) => v.isValid));
              
              if (isVerified) {
                cacheObject.verification = {
                  isVerified: true,
                  status: profile.verification.verifiedStatus || 'valid',
                  trustedVerifierStatus: profile.verification.trustedVerifierStatus || 'none',
                  verifications: profile.verification.verifications || [],
                  verifiedBy: profile.verification.verifications?.[0]?.issuer || 'bsky.app',
                  verifierHandle: profile.verification.trustedVerifierStatus === 'valid' ? 'Verifier' : 'bsky.app',
                  verifiedAt: profile.verification.verifications?.[0]?.createdAt || new Date().toISOString(),
                  isOfficial: profile.verification.trustedVerifierStatus !== 'valid'
                };
              } else {
                cacheObject.verification = { isVerified: false };
              }
            } else {
              cacheObject.verification = { isVerified: false };
            }

            // Process avatar colors in background
            if (profile.avatar) {
              requestAnimationFrame(() => {
                setTimeout(async () => {
                  try {
                    const colors = await ImageColors.getColors(profile.avatar, {
                      fallback: '#000000',
                      cache: true,
                      key: profile.avatar
                    });
                    if (colors && 'average' in colors) {
                      const avgColor = colors.average;
                      cacheObject.profileColors = {
                        backgroundColor: avgColor,
                        foregroundColor: this.isDarkColor(avgColor) ? '#FFFFFF' : '#000000',
                        statusBarStyle: this.isDarkColor(avgColor) ? 'light' : 'dark'
                      };
                    }
                  } catch (error) {
                    // console.warn('Error extracting avatar colors:', error);
                  }
                }, 0);
              });
            }

            // Update caches in background
            this.memoryCache.set(did, cacheObject);
            
            requestAnimationFrame(() => {
              setTimeout(() => {
                AsyncStorage.setItem(
                  this.getCacheKeyByDid(did),
                  JSON.stringify(cacheObject)
                ).catch(error => {
                });
                
                this.notifyProfileUpdated(did);
              }, 0);
            });

            resolve(cacheObject);
          } catch (error) {
            // console.warn(`ProfileCache: Error fetching and caching profile for ${did}:`, error);
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Fetch a profile from the API and cache it (legacy)
   */
  private static async fetchAndCacheProfile(handle: string): Promise<CachedProfile | null> {
    if (!handle) return null;
    
    return new Promise((resolve) => {
      // Move fetching to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {

            
            const normalizedHandle = handle.toLowerCase();
            const profile = await AtprotoService.getProfile(handle);
            if (!profile) {
              resolve(null);
              return;
            }

            let profileColors = undefined;
            if (profile.avatar) {
              try {
                profileColors = await extractColorsFromImage(profile.avatar);
              } catch (e) {
              }
            }

            // Get both sides of the follow relationship from viewer data
            const isFollowing = profile.viewer ? !!profile.viewer.following : undefined;
            const isFollowedBy = profile.viewer ? !!profile.viewer.followedBy : undefined;

            const cacheObject: CachedProfile = {
              did: profile.did,
              handle: profile.handle,
              displayName: profile.displayName,
              avatar: profile.avatar,
              description: profile.description,
              isFollowing,
              isFollowedBy,
              profileColors: profileColors ? {
                backgroundColor: profileColors.backgroundColor,
                foregroundColor: profileColors.foregroundColor,
                statusBarStyle: profileColors.statusBarStyle,
              } : undefined,
              lastUpdated: Date.now()
            };

            // Extract verification data from profile response (already included)
            if (profile.verification) {
              const isVerified = 
                profile.verification.verifiedStatus === 'valid' ||
                profile.verification.trustedVerifierStatus === 'valid' ||
                (profile.verification.verifications && 
                 profile.verification.verifications.length > 0 && 
                 profile.verification.verifications.some((v: any) => v.isValid));
              
              if (isVerified) {
                cacheObject.verification = {
                  isVerified: true,
                  status: profile.verification.verifiedStatus || 'valid',
                  trustedVerifierStatus: profile.verification.trustedVerifierStatus || 'none',
                  verifications: profile.verification.verifications || [],
                  verifiedBy: profile.verification.verifications?.[0]?.issuer || 'bsky.app',
                  verifierHandle: profile.verification.trustedVerifierStatus === 'valid' ? 'Verifier' : 'bsky.app',
                  verifiedAt: profile.verification.verifications?.[0]?.createdAt || new Date().toISOString(),
                  isOfficial: profile.verification.trustedVerifierStatus !== 'valid'
                };
              } else {
                cacheObject.verification = { isVerified: false };
              }
            } else {
              cacheObject.verification = { isVerified: false };
            }

            // Process avatar colors in background
            if (profile.avatar) {
              requestAnimationFrame(() => {
                setTimeout(async () => {
                  try {
                    const colors = await ImageColors.getColors(profile.avatar, {
                      fallback: '#000000',
                      cache: true,
                      key: profile.avatar
                    });
                    if (colors && 'average' in colors) {
                      const avgColor = colors.average;
                      cacheObject.profileColors = {
                        backgroundColor: avgColor,
                        foregroundColor: this.isDarkColor(avgColor) ? '#FFFFFF' : '#000000',
                        statusBarStyle: this.isDarkColor(avgColor) ? 'light' : 'dark'
                      };
                    }
                  } catch (error) {
                    // console.warn('Error extracting avatar colors:', error);
                  }
                }, 0);
              });
            }

            // Update caches in background
            this.memoryCache.set(normalizedHandle, cacheObject);
            
            requestAnimationFrame(() => {
              setTimeout(() => {
                AsyncStorage.setItem(
                  this.getCacheKey(normalizedHandle),
                  JSON.stringify(cacheObject)
                ).catch(error => {
                });
                
                this.notifyProfileUpdated(normalizedHandle);
              }, 0);
            });

            resolve(cacheObject);
          } catch (error) {
            // console.warn(`ProfileCache: Error fetching and caching profile for ${handle}:`, error);
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Get a profile directly from the cache by DID
   */
  private static async getProfileFromCacheByDid(did: string): Promise<CachedProfile | null> {
    if (!did) return null;
    
    return new Promise((resolve) => {
      // Move cache retrieval to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const cached = await AsyncStorage.getItem(this.getCacheKeyByDid(did));
            if (cached) {
              const parsed = JSON.parse(cached) as CachedProfile;
              resolve(parsed);
            } else {
              resolve(null);
            }
          } catch (error) {
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Get a profile directly from the cache by handle (legacy)
   */
  private static async getProfileFromCache(handle: string): Promise<CachedProfile | null> {
    if (!handle) return null;
    
    return new Promise((resolve) => {
      // Move cache retrieval to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const normalizedHandle = handle.toLowerCase();
            const cached = await AsyncStorage.getItem(this.getCacheKey(normalizedHandle));
            if (cached) {
              const parsed = JSON.parse(cached) as CachedProfile;
              resolve(parsed);
            } else {
              resolve(null);
            }
          } catch (error) {
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Check if cached data is still valid (not expired)
   */
  private static isCacheValid(profile: CachedProfile): boolean {
    if (!profile) return false;
    const now = Date.now();
    return (now - profile.lastUpdated) < this.cacheExpiry;
  }

  /**
   * Generate a consistent cache key for a DID
   */
  private static getCacheKeyByDid(did: string): string {
    return `${this.CACHE_KEY_PREFIX}did_${did}`;
  }

  /**
   * Generate a consistent cache key for a handle (legacy)
   */
  private static getCacheKey(handle: string): string {
    return `${this.CACHE_KEY_PREFIX}${handle.toLowerCase()}`;
  }

  /**
   * Invalidate a specific profile in the cache
   * Useful for React Query's invalidateQueries
   */
  static async invalidateProfile(handle: string): Promise<void> {
    if (!handle) return;
    
    return new Promise((resolve) => {
      // Move invalidation to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const normalizedHandle = handle.toLowerCase();
            this.memoryCache.delete(normalizedHandle);
            await AsyncStorage.removeItem(this.getCacheKey(normalizedHandle));
            
            // Notify subscribers of a profile update
            this.notifyProfileUpdated(normalizedHandle);
            resolve();
          } catch (error) {
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Clear all cached profiles
   */
  static async clearCache(): Promise<void> {
    return new Promise((resolve) => {
      // Move cache clearing to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            // Clear memory cache
            this.memoryCache.clear();
            
            // Clear AsyncStorage cache
            const keys = await AsyncStorage.getAllKeys();
            const profileKeys = keys.filter(key => key.startsWith(this.CACHE_KEY_PREFIX));
            if (profileKeys.length > 0) {
              await AsyncStorage.multiRemove(profileKeys);
            }
            
            // Notify all subscribers
            for (const handle of this.cacheUpdateCallbacks.keys()) {
              this.notifyProfileUpdated(handle);
            }
            resolve();
          } catch (error) {
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Cleanup method for app lifecycle management
   * Called when the app goes to background to free up memory
   */
  static cleanup(): void {
    try {
      // Only clear memory cache to free RAM, but preserve AsyncStorage cache
      // This allows profiles to be restored from storage when app comes back to foreground
      this.memoryCache.clear();
      
      // Clear update callbacks to prevent memory leaks
      this.cacheUpdateCallbacks.clear();
      
      // Don't reset initialization flag - keep it initialized
      // Don't clear AsyncStorage cache - preserve it for app restart
    } catch (error) {
    }
  }

  private static isDarkColor(color: string): boolean {
    try {
      // Simple luminance calculation
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    } catch (error) {
      return false;
    }
  }

  /**
   * Batch prefetch profiles from feed data
   * This is the most efficient way to prefetch profiles - extracts all unique handles
   * from feed items and prefetches them in one operation
   * @param feedItems - Array of feed items containing author and repostedBy data
   */
  static async batchPrefetchFromFeed(feedItems: any[]): Promise<void> {
    if (!feedItems || feedItems.length === 0) return;

    return new Promise((resolve) => {
      // Move batch operations to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            // Extract all unique handles from feed items
            const uniqueHandles = new Set<string>();
            
            feedItems.forEach(item => {
              // Handle feed items with post structure
              if (item.post?.author?.handle) {
                uniqueHandles.add(item.post.author.handle.toLowerCase());
              }
              
              if (item.post?.repostedBy?.handle) {
                uniqueHandles.add(item.post.repostedBy.handle.toLowerCase());
              }
              
              // Handle direct author structure (for search results and notifications)
              if (item.author?.handle) {
                uniqueHandles.add(item.author.handle.toLowerCase());
              }
              
              // Handle notification structure
              if (item.reason?.by?.handle) {
                uniqueHandles.add(item.reason.by.handle.toLowerCase());
              }
            });

            // Convert to array and filter out empty handles
            const handlesToPrefetch = Array.from(uniqueHandles).filter(handle => handle && handle.trim() !== '');
            
            if (handlesToPrefetch.length === 0) {
              resolve();
              return;
            }

            // Check how many are already cached
            const alreadyCached = handlesToPrefetch.filter(handle => {
              const cached = this.getProfileFromCacheSync(handle);
              return cached && this.isCacheValid(cached);
            }).length;

            const needsFetching = handlesToPrefetch.length - alreadyCached;



            // Process handles in smaller batches to avoid overwhelming the API
            const batchSize = 5;
            for (let i = 0; i < handlesToPrefetch.length; i += batchSize) {
              const batch = handlesToPrefetch.slice(i, i + batchSize);
              
              await Promise.allSettled(batch.map(async (handle) => {
                try {
                  // Check if already cached first
                  const cached = this.getProfileFromCacheSync(handle);
                  if (cached && this.isCacheValid(cached)) {
                    return; // Already cached and valid
                  }
                  
                  // Fetch and cache the profile
                  await this.getProfile(handle);
                } catch (error) {
                }
              }));
            }
            
            resolve();
          } catch (error) {
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Precache the current user's profile on app launch
   * Uses existing ProfileCache methods for simplicity
   */
  static async precacheCurrentUserProfile(): Promise<void> {
    if (!this.currentUserDid) return;
    
    // Use existing getProfileByDid method - it handles caching automatically
    this.getProfileByDid(this.currentUserDid);
  }
}

// React Query Hooks for ProfileCache

/**
 * Hook to fetch and subscribe to profile data by DID (preferred method)
 */
export function useProfileByDid(did: string | null | undefined): UseQueryResult<CachedProfile | null, Error> {
  return useQuery<CachedProfile | null, Error>({
    queryKey: did ? profileKeys.detail(`did_${did}`) : ['profiles', 'detail', 'did_'],
    queryFn: async () => did ? ProfileCache.getProfileByDid(did) : null,
    enabled: !!did,
    staleTime: PROFILE_CACHE_EXPIRY, // cache valid for 24h
    gcTime: PROFILE_CACHE_EXPIRY * 2, // keep in garbage collection for 48h
    refetchOnWindowFocus: false,   // avoid unnecessary refetch
    refetchOnMount: false,         // don't refetch on mount if we have data
    refetchOnReconnect: false,     // don't refetch on reconnect
  });
}

/**
 * Hook to fetch and subscribe to profile data by handle (legacy)
 */
export function useProfile(handle: string | null | undefined): UseQueryResult<CachedProfile | null, Error> {
  return useQuery<CachedProfile | null, Error>({
    queryKey: handle ? profileKeys.detail(handle) : ['profiles', 'detail', ''],
    queryFn: async () => handle ? ProfileCache.getProfile(handle) : null,
    enabled: !!handle,
    staleTime: PROFILE_CACHE_EXPIRY, // cache valid for 24h
    gcTime: PROFILE_CACHE_EXPIRY * 2, // keep in garbage collection for 48h
    refetchOnWindowFocus: false,   // avoid unnecessary refetch
    refetchOnMount: false,         // don't refetch on mount if we have data
    refetchOnReconnect: false,     // don't refetch on reconnect
  });
}

/**
 * Hook to fetch just the profile colors by handle
 */
export function useProfileColors(handle: string | null | undefined) {
  const { data: profile } = useProfile(handle);

  

  
  // Use cached profile colors
  const colors: ProfileColorScheme = {
    backgroundColor: profile?.profileColors?.backgroundColor || '#000000',
    foregroundColor: profile?.profileColors?.foregroundColor || '#FFFFFF',
    textColor: profile?.profileColors?.foregroundColor || '#FFFFFF',
    primaryColor: profile?.profileColors?.backgroundColor || '#000000',
    secondaryColor: profile?.profileColors?.foregroundColor || '#FFFFFF',
    statusBarStyle: profile?.profileColors?.statusBarStyle || 'light',
  };
  
  return {
    colors,
    isLoading: !profile,
    getColorWithOpacity: (colorKey: keyof ProfileColorScheme, opacity: number): string => {
      const hex = colors[colorKey];
      if (hex.startsWith('#')) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      return hex;
    }
  };
}



/**
 * Hook to follow/unfollow a profile with optimistic updates
 */
export function useFollowMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      handle, 
      isFollowing, 
      isFollowedBy 
    }: { 
      handle: string, 
      isFollowing: boolean, 
      isFollowedBy?: boolean 
    }) => {
      // Get the profile to get the DID
      const profile = await ProfileCache.getProfile(handle);
      if (!profile?.did) {
        throw new Error('Profile not found or missing DID');
      }
      
      // Make the actual API call
      if (isFollowing) {
        await AtprotoService.follow(profile.did);
      } else {
        await AtprotoService.unfollow(profile.did);
      }
      
      // Update the cache with the new following status
      await ProfileCache.updateFollowingStatus(handle, isFollowing, isFollowedBy);
      
      return { handle, isFollowing, isFollowedBy };
    },
    // When mutate is called:
    onMutate: async ({ handle, isFollowing, isFollowedBy }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(handle) });
      
      // Snapshot the previous value
      const previousProfile = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));
      
      // Optimistically update to the new value
      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), {
          ...previousProfile,
          isFollowing,
          ...(isFollowedBy !== undefined ? { isFollowedBy } : {})
        });
      }
      
      return { previousProfile };
    },
    // If mutation fails, use context returned from onMutate to roll back
    onError: (err, { handle }, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), context.previousProfile);
      }
    },
    // Always refetch after error or success to ensure cache consistency
    onSettled: (_, __, { handle }) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
    },
  });
}

/**
 * Hook to update profile colors with React Query integration
 */
export function useProfileColorsMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      handle, 
      backgroundColor, 
      foregroundColor 
    }: { 
      handle: string, 
      backgroundColor: string, 
      foregroundColor: string 
    }) => {
      await ProfileCache.updateProfileColors(handle, backgroundColor, foregroundColor);
      return { handle, backgroundColor, foregroundColor };
    },
    onSuccess: (_, { handle }) => {
      // Invalidate the specific profile query to refetch with new colors
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
    },
  });
}

/**
 * Hook to update profile information with React Query integration
 */
export function useProfileUpdateMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      handle, 
      updates 
    }: { 
      handle: string, 
      updates: {
        displayName?: string;
        description?: string;
        avatar?: string;
        customColors?: {
          backgroundColor: string;
          textColor: string;
        };
      }
    }) => {
      
      const updatedProfile = await AtprotoService.updateProfile(updates);
      
      // Handle custom colors locally since they're not part of the Bluesky API
      if (updates.customColors) {
        await ProfileCache.updateProfileColors(handle, updates.customColors.backgroundColor, updates.customColors.textColor);
      }
      
      // Immediately apply to local cache for fast UI reflection
      try {
        await ProfileCache.applyServerProfile(handle, updatedProfile);
      } catch (error) {
      }
      return { handle, updatedProfile };
    },
    onMutate: async ({ handle, updates }) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(handle) });

      const previousProfile = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));

      // Optimistically update the query cache
      if (previousProfile) {
        const optimistic: CachedProfile = {
          ...previousProfile,
          ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.avatar !== undefined ? { avatar: updates.avatar } : {}),
          ...(updates.customColors ? {
            profileColors: {
              backgroundColor: updates.customColors.backgroundColor,
              foregroundColor: updates.customColors.textColor,
              statusBarStyle: updates.customColors.textColor === '#FFFFFF' ? 'light' : 'dark'
            }
          } : {}),
          lastUpdated: Date.now(),
        };
        queryClient.setQueryData(profileKeys.detail(handle), optimistic);
      }

      return { previousProfile };
    },
    onSuccess: ({ updatedProfile }, { handle }) => {
      // Merge server-updated fields into the query cache immediately
      const prev = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));
      const merged: CachedProfile | undefined = prev ? {
        ...prev,
        did: updatedProfile?.did ?? prev.did,
        handle: updatedProfile?.handle ?? prev.handle,
        displayName: updatedProfile?.displayName ?? prev.displayName,
        avatar: updatedProfile?.avatar ?? prev.avatar,
        description: updatedProfile?.description ?? prev.description,
        isFollowing: (updatedProfile?.viewer ? !!updatedProfile.viewer.following : prev.isFollowing),
        isFollowedBy: (updatedProfile?.viewer ? !!updatedProfile.viewer.followedBy : prev.isFollowedBy),
        lastUpdated: Date.now(),
      } : undefined;

      if (merged) {
        queryClient.setQueryData(profileKeys.detail(handle), merged);
      }

      // Still invalidate to ensure freshness against server
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
    },
    onError: (error, { handle }, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), context.previousProfile);
      }
    },
  });
}

/**
 * Hook to invalidate profile cache
 */
export function useProfileInvalidation() {
  const queryClient = useQueryClient();
  
  return useCallback(async (handle: string) => {
    await ProfileCache.invalidateProfile(handle);
    queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
  }, [queryClient]);
}

export default ProfileCache;