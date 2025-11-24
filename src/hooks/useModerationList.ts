import { useState, useEffect, useCallback } from 'react';
import AtprotoService from '../services/api/AtprotoService';

export interface ModeratedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

type ModerationType = 'blocked' | 'muted';

interface UseModerationListOptions {
  type: ModerationType;
}

export const useModerationList = ({ type }: UseModerationListOptions) => {
  const [users, setUsers] = useState<ModeratedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingUsers, setProcessingUsers] = useState<Set<string>>(new Set());

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const fetchFn = type === 'blocked' 
        ? AtprotoService.getBlockedUsersFromAPI 
        : AtprotoService.getMutedUsersFromAPI;
      
      const dids = await fetchFn();
      
      // Convert string[] to ModeratedUser objects
      const userPromises = dids.map(async (did: string) => {
        try {
          // Try to get profile info for each user
          const profile = await AtprotoService.getProfile(did);
          return {
            did,
            handle: profile?.handle || did,
            displayName: profile?.displayName,
            avatar: profile?.avatar,
          };
        } catch (error) {
          // If we can't get profile info, use basic info
          return {
            did,
            handle: did,
            displayName: 'Unknown User',
            avatar: undefined,
          };
        }
      });
      
      const loadedUsers = await Promise.all(userPromises);
      setUsers(loadedUsers);
    } catch (error) {
      console.error(`Error loading ${type} users:`, error);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAction = useCallback(async (user: ModeratedUser) => {
    try {
      setProcessingUsers(prev => new Set(prev).add(user.did));
      
      if (type === 'blocked') {
        await AtprotoService.unblockUser(user.did);
      } else {
        // TODO: Implement unmuteUser in AtprotoService
        // Note: unmuteUser is not implemented yet in AtprotoService
        console.log('Unmute functionality not implemented yet');
      }
      
      setUsers(prev => prev.filter(u => u.did !== user.did));
    } catch (error) {
      console.error(`Error performing action on ${type} user:`, error);
    } finally {
      setProcessingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(user.did);
        return newSet;
      });
    }
  }, [type]);

  return {
    users,
    loading,
    processingUsers,
    handleAction,
    refetch: loadUsers,
  };
};
