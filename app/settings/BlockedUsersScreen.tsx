import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import ListScreen from '../../src/components/ui/ListScreen';
import AtprotoService from '../../src/services/api/AtprotoService';

interface BlockedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const BlockedUsersScreen: React.FC = () => {
  const navigation = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingUsers, setUnblockingUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    try {
      setLoading(true);
      const blockedDids = await AtprotoService.getBlockedUsersFromAPI();
      
      // Convert string[] to BlockedUser objects
      const userPromises = blockedDids.map(async (did: string) => {
        try {
          // Try to get profile info for each blocked user
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
      
      const users = await Promise.all(userPromises);
      setBlockedUsers(users);
    } catch (error) {
      console.error('Error loading blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockUser = async (user: BlockedUser) => {
    try {
      setUnblockingUsers(prev => new Set(prev).add(user.did));
      await AtprotoService.unblockUser(user.did);
      setBlockedUsers(prev => prev.filter(blockedUser => blockedUser.did !== user.did));
    } catch (error) {
      console.error('Error unblocking user:', error);
    } finally {
      setUnblockingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(user.did);
        return newSet;
      });
    }
  };

  return (
    <ListScreen
      title="Blocked accounts"
      data={blockedUsers}
      isLoading={loading}
      error={null}
      emptyIcon="shield-shape-fill"
      emptyTitle="No blocked accounts"
      emptySubtitle="You haven't blocked any accounts yet. Blocked accounts won't be able to see your content or interact with you."
      showFollowButton={true}
      followButtonIcon="minus-fill"
      followButtonAction="unblock"
      onActionPress={handleUnblockUser}
    />
  );
};

export default BlockedUsersScreen; 