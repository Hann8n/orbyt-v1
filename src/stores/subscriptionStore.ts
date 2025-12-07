/**
 * Activity Subscription Store
 * Manages activity subscription state for post notifications from users
 */
import { create } from 'zustand';
import AtprotoService from '../services/api/AtprotoService';
import { logger } from '../utils/logger';

interface SubscriptionState {
  // Map of DID -> subscription status
  subscriptions: Map<string, boolean>;
  
  // Initialize subscriptions from API
  initialize: () => Promise<void>;
  
  // Check if subscribed to a specific user
  isSubscribed: (did: string) => boolean;
  
  // Subscribe to a user's activity
  subscribe: (did: string) => Promise<boolean>;
  
  // Unsubscribe from a user's activity
  unsubscribe: (did: string) => Promise<boolean>;
  
  // Toggle subscription status
  toggleSubscription: (did: string) => Promise<boolean>;
  
  // Clear all subscriptions
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptions: new Map(),
  
  initialize: async () => {
    try {
      const { subscriptions } = await AtprotoService.listActivitySubscriptions();
      
      const subscriptionMap = new Map<string, boolean>();
      subscriptions.forEach((sub: any) => {
        if (sub.did) {
          subscriptionMap.set(sub.did, true);
        }
      });
      
      set({ subscriptions: subscriptionMap });
      logger.info('Initialized activity subscriptions', { count: subscriptionMap.size, component: 'subscriptionStore' });
    } catch (error) {
      logger.error('Failed to initialize activity subscriptions', error, { component: 'subscriptionStore' });
    }
  },
  
  isSubscribed: (did: string) => {
    return get().subscriptions.get(did) ?? false;
  },
  
  subscribe: async (did: string) => {
    const { subscriptions } = get();
    
    // Optimistic update - set subscription immediately
    const newSubscriptions = new Map(subscriptions);
    newSubscriptions.set(did, true);
    set({ subscriptions: newSubscriptions });
    
    // Update ProfileCache optimistically
    const ProfileCache = (await import('../services/cache/ProfileCache')).default;
    await ProfileCache.updateSubscriptionStatus(did, true);
    
    try {
      await AtprotoService.putActivitySubscription(did);
      logger.info('Subscribed to activity', { did, component: 'subscriptionStore' });
      return true;
    } catch (error) {
      logger.error('Failed to subscribe to activity', error, { component: 'subscriptionStore', did });
      
      // Revert optimistic update on error
      const revertedSubscriptions = new Map(get().subscriptions);
      revertedSubscriptions.set(did, false);
      set({ subscriptions: revertedSubscriptions });
      await ProfileCache.updateSubscriptionStatus(did, false);
      
      return false;
    }
  },
  
  unsubscribe: async (did: string) => {
    const { subscriptions } = get();
    
    // Optimistic update - remove subscription immediately
    const newSubscriptions = new Map(subscriptions);
    newSubscriptions.set(did, false);
    set({ subscriptions: newSubscriptions });
    
    // Update ProfileCache optimistically
    const ProfileCache = (await import('../services/cache/ProfileCache')).default;
    await ProfileCache.updateSubscriptionStatus(did, false);
    
    try {
      await AtprotoService.deleteActivitySubscription(did);
      logger.info('Unsubscribed from activity', { did, component: 'subscriptionStore' });
      return false;
    } catch (error) {
      logger.error('Failed to unsubscribe from activity', error, { component: 'subscriptionStore', did });
      
      // Revert optimistic update on error
      const revertedSubscriptions = new Map(get().subscriptions);
      revertedSubscriptions.set(did, true);
      set({ subscriptions: revertedSubscriptions });
      await ProfileCache.updateSubscriptionStatus(did, true);
      
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
