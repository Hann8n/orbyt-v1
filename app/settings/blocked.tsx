import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ListScreen from '@/components/ui/ListScreen';
import { GraphService } from '@/services/api/graph/GraphService';
import { ActorService } from '@/services/api/actor/ActorService';
import { logger } from '@/utils/logger';

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

  const loadBlockedUsers = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        setLoading(true);
        const blockedDids = await GraphService.getBlockedUsersFromAPI();
        if (isCancelled()) return;

        const userPromises = blockedDids.map(async (did: string) => {
          try {
            const profile = await ActorService.getProfileByDid(did);
            return {
              did,
              handle: profile?.handle || did,
              displayName: profile?.displayName,
              avatar: profile?.avatar,
            };
          } catch (_error) {
            return {
              did,
              handle: did,
              displayName: t('profile.unknownUser'),
              avatar: undefined,
            };
          }
        });

        const users = await Promise.all(userPromises);
        if (isCancelled()) return;
        setBlockedUsers(users);
      } catch (error) {
        if (isCancelled()) return;
        logger.error('Error loading blocked users', error, { component: 'BlockedUsersScreen' });
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    loadBlockedUsers(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadBlockedUsers]);

  const handleUnblockUser = async (user: BlockedUser) => {
    try {
      setUnblockingUsers(prev => new Set(prev).add(user.did));
      await GraphService.unblockUser(user.did);
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
