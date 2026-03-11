import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ListScreen from '../../src/components/ui/ListScreen';
import AtprotoService from '../../src/services/api/AtprotoService';
import { logger } from '../../src/utils/logger';

interface BlockedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const BlockedUsersScreen: React.FC = () => {
  const { t } = useTranslation();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [_unblockingUsers, setUnblockingUsers] = useState<Set<string>>(new Set());

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
        } catch (_error) {
          // If we can't get profile info, use basic info
          return {
            did,
            handle: did,
            displayName: t('profile.unknownUser'),
            avatar: undefined,
          };
        }
      });

      const users = await Promise.all(userPromises);
      setBlockedUsers(users);
    } catch (error) {
      logger.error('Error loading blocked users', error, { component: 'BlockedUsersScreen' });
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
      logger.error('Error unblocking user', error, { component: 'BlockedUsersScreen' });
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
      title={t('settings.blockedAccounts')}
      data={blockedUsers}
      isLoading={loading}
      error={null}
      emptyIcon="shield-shape-fill"
      emptyTitle={t('settings.noBlockedAccounts')}
      emptySubtitle={t('settings.blockedEmptySubtitle')}
      showFollowButton={true}
      followButtonAction="unblock"
      onActionPress={handleUnblockUser}
    />
  );
};

export default BlockedUsersScreen;
