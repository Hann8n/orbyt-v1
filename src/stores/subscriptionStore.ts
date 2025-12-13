/**
 * Activity Subscription Store
 * Manages activity subscription state for post notifications from users
 */
import { create } from 'zustand';
import AtprotoService from '../services/api/AtprotoService';
import { logger } from '../utils/logger';

interface SubscriptionPreferences {
  post: boolean;
  reply: boolean;
}

interface SubscriptionState {
  // Map of DID -> subscription preferences
  subscriptions: Map<string, SubscriptionPreferences>;
  
  // Initialize subscriptions from API
  initialize: () => Promise<void>;
  
  // Check if subscribed to a specific user
  isSubscribed: (did: string) => boolean;
  
  // Get preferences for a specific user
  getPreferences: (did: string) => SubscriptionPreferences | null;
  
  // Subscribe to a user's activity
  subscribe: (did: string, preferences?: SubscriptionPreferences) => Promise<boolean>;
  
  // Unsubscribe from a user's activity
  unsubscribe: (did: string) => Promise<boolean>;
  
  // Toggle subscription status
  toggleSubscription: (did: string) => Promise<boolean>;
  
  // Update subscription preferences
  updatePreferences: (did: string, preferences: SubscriptionPreferences) => Promise<boolean>;
  
  // Clear all subscriptions
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptions: new Map(),
  
  initialize: async () => {
    try {
      const { subscriptions } = await AtprotoService.listActivitySubscriptions();
      
      const subscriptionMap = new Map<string, SubscriptionPreferences>();
      subscriptions.forEach((sub: any) => {
        if (sub.did && sub.viewer?.activitySubscription) {
          const prefs = sub.viewer.activitySubscription;
          const post = typeof prefs.post === 'boolean' ? prefs.post : false;
          const reply = typeof prefs.reply === 'boolean' ? prefs.reply : false;
          
          if (post || reply) {
            subscriptionMap.set(sub.did, { post, reply });
          }
        }
      });
      
      set({ subscriptions: subscriptionMap });
    } catch (error) {
      logger.error('Failed to initialize activity subscriptions', error, { component: 'subscriptionStore' });
    }
  },
  
  isSubscribed: (did: string) => {
    const prefs = get().subscriptions.get(did);
    return prefs ? (prefs.post || prefs.reply) : false;
  },
  
  getPreferences: (did: string) => {
    return get().subscriptions.get(did) || null;
  },
  
  subscribe: async (did: string, preferences?: SubscriptionPreferences) => {
    const prefs = preferences || { post: true, reply: true };
    return await get().updatePreferences(did, prefs);
  },
  
  updatePreferences: async (did: string, preferences: SubscriptionPreferences) => {
    const { subscriptions } = get();
    
    if (!preferences.post && !preferences.reply) {
      return await get().unsubscribe(did);
    }
    
    const originalPrefs = subscriptions.get(did);
    const newSubscriptions = new Map(subscriptions);
    newSubscriptions.set(did, preferences);
    set({ subscriptions: newSubscriptions });
    
    const ProfileCache = (await import('../services/cache/ProfileCache')).default;
    await ProfileCache.updateSubscriptionStatus(did, true);
    
    try {
      await AtprotoService.putActivitySubscription(did);
      return true;
    } catch (error) {
      logger.error('Failed to update subscription preferences', error, { component: 'subscriptionStore', did });
      
      const revertedSubscriptions = new Map(get().subscriptions);
      if (originalPrefs) {
        revertedSubscriptions.set(did, originalPrefs);
      } else {
        revertedSubscriptions.delete(did);
        await ProfileCache.updateSubscriptionStatus(did, false);
      }
      set({ subscriptions: revertedSubscriptions });
      return false;
    }
  },
  
  unsubscribe: async (did: string) => {
    const { subscriptions } = get();
    const originalPrefs = subscriptions.get(did);
    
    const newSubscriptions = new Map(subscriptions);
    newSubscriptions.delete(did);
    set({ subscriptions: newSubscriptions });
    
    const ProfileCache = (await import('../services/cache/ProfileCache')).default;
    await ProfileCache.updateSubscriptionStatus(did, false);
    
    try {
      await AtprotoService.deleteActivitySubscription(did);
      return false;
    } catch (error) {
      logger.error('Failed to unsubscribe from activity', error, { component: 'subscriptionStore', did });
      
      if (originalPrefs) {
        const revertedSubscriptions = new Map(get().subscriptions);
        revertedSubscriptions.set(did, originalPrefs);
        set({ subscriptions: revertedSubscriptions });
        await ProfileCache.updateSubscriptionStatus(did, true);
      }
      return true;
    }
  },
  
  toggleSubscription: async (did: string) => {
    const isCurrentlySubscribed = get().isSubscribed(did);
    
    if (isCurrentlySubscribed) {
      return await get().unsubscribe(did);
    } else {
      return await get().subscribe(did);
    }
  },
  
  clear: () => {
    set({ subscriptions: new Map() });
  },
}));

// Convenience hook for a specific user's subscription
export const useUserSubscription = (did: string | null | undefined) => {
  const isSubscribed = useSubscriptionStore((state) => 
    did ? state.isSubscribed(did) : false
  );
  const toggleSubscription = useSubscriptionStore((state) => state.toggleSubscription);
  
  return {
    isSubscribed,
    toggleSubscription: did ? () => toggleSubscription(did) : async () => false,
  };
};
