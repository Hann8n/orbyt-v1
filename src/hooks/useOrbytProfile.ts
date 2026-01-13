import { useUserStore } from '../stores/userStore';
import { useOrbytColors } from './useOrbytColors';

/**
 * Hook for accessing Orbyt profile data
 *
 * Note: Colors now come from the Orbyt API (api.getorbyt.com) via useOrbytColors
 * subscribedChannels are managed via userStore
 *
 * @deprecated For colors, use useOrbytColors directly
 */
export function useOrbytProfile(did?: string) {
  const currentUser = useUserStore(state => state.currentUser);
  const subscribedChannels = useUserStore(state => state.subscribedChannels);
  const targetDid = did ?? currentUser?.did ?? null;

  // Colors now come from Orbyt API
  const { data: orbytColors } = useOrbytColors(targetDid);

  return {
    // Legacy record shape - now null since colors come from API
    record: null,
    // Colors from Orbyt API
    colors: orbytColors
      ? { backgroundColor: orbytColors.backgroundColor, textColor: orbytColors.textColor }
      : null,
    // Subscribed channels from userStore (only for current user)
    subscribedChannels: targetDid === currentUser?.did ? subscribedChannels : [],
    // Join date from Orbyt API
    joinDate: orbytColors?.joinedAt,
    // No longer available from PDS
    updatedAt: undefined,
  };
}

export default useOrbytProfile;
