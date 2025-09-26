/**
 * Developer Access Test Utility
 * Simple test to verify developer gating functionality
 */

import { useUserStore } from '../stores/userStore';

export const testDeveloperAccess = () => {
  const { isDeveloper, developerListUri, developerMembersCache, refreshDeveloperAccess } = useUserStore.getState();
  
  console.log('=== Developer Access Test ===');
  console.log('isDeveloper:', isDeveloper);
  console.log('developerListUri:', developerListUri);
  console.log('cachedMembers count:', developerMembersCache.length);
  console.log('cachedMembers:', developerMembersCache);
  
  return {
    isDeveloper,
    developerListUri,
    memberCount: developerMembersCache.length,
    hasAccess: isDeveloper
  };
};

export const refreshDeveloperAccessTest = async () => {
  console.log('=== Refreshing Developer Access ===');
  try {
    await useUserStore.getState().refreshDeveloperAccess();
    const result = testDeveloperAccess();
    console.log('Refresh completed:', result);
    return result;
  } catch (error) {
    console.error('Error refreshing developer access:', error);
    return { error: error.message };
  }
};
