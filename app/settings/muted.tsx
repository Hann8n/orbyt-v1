import React, { useState, useEffect } from 'react';
import ListScreen from '../../src/components/ui/ListScreen';
import AtprotoService from '../../src/services/api/AtprotoService';
import { logger } from '../../src/utils/logger';

interface MutedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const MutedUsersScreen: React.FC = () => {
  const [mutedUsers, setMutedUsers] = useState<MutedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [_unmutingUsers, setUnmutingUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMutedUsers();
  }, []);

  const loadMutedUsers = async () => {
    try {
      setLoading(true);
      const mutedDids = await AtprotoService.getMutedUsersFromAPI();

      // Convert string[] to MutedUser objects
      const userPromises = mutedDids.map(async (did: string) => {
        try {
          // Try to get profile info for each muted user
          const profile = await AtprotoService.getProfile(did);
          return {
            did,
            handle: profile?.handle || did,
            displayName: profile?.displayName,
            avatar: profile?.avatar,
          };
        } catch (_error) {
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
      setMutedUsers(users);
    } catch (error) {
      logger.error('Error loading muted users', error, {
        component: 'MutedUsersScreen',
        action: 'loadMutedUsers',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnmuteUser = async (user: MutedUser) => {
    try {
      setUnmutingUsers(prev => new Set(prev).add(user.did));
      await AtprotoService.unmuteUser(user.did);
      setMutedUsers(prev => prev.filter(mutedUser => mutedUser.did !== user.did));
    } catch (error) {
      logger.error('Error unmuting user', error, {
        component: 'MutedUsersScreen',
        action: 'handleUnmuteUser',
        userDid: user.did,
      });
    } finally {
      setUnmutingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(user.did);
        return newSet;
      });
    }
  };

  return (
    <ListScreen
      title="Muted accounts"
      data={mutedUsers}
      isLoading={loading}
      error={null}
      emptyIcon="volume-x"
      emptyTitle="No muted accounts"
      emptySubtitle="You haven't muted any accounts yet. Muted accounts' posts won't appear in your feed, but they can still see your content."
      showFollowButton={true}
      followButtonIcon="minus-fill"
      followButtonAction="unmute"
      onActionPress={handleUnmuteUser}
    />
  );
};

export default MutedUsersScreen;
