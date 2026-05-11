import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ListScreen from '@/components/ui/ListScreen';
import { GraphService } from '@/services/api/graph/GraphService';
import { ActorService } from '@/services/api/actor/ActorService';
import { logger } from '@/utils/logger';

interface MutedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const MutedUsersScreen: React.FC = () => {
  const { t } = useTranslation();
  const [mutedUsers, setMutedUsers] = useState<MutedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [_unmutingUsers, setUnmutingUsers] = useState<Set<string>>(new Set());

  const loadMutedUsers = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const mutedDids = await GraphService.getMutedUsersFromAPI();
        if (isCancelled()) return;

        const userPromises = mutedDids.map(async (did: string) => {
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
        setMutedUsers(users);
      } catch (error) {
        if (isCancelled()) return;
        logger.error('Error loading muted users', error, {
          component: 'MutedUsersScreen',
          action: 'loadMutedUsers',
        });
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    loadMutedUsers(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadMutedUsers]);

  const handleUnmuteUser = async (user: MutedUser) => {
    try {
      setUnmutingUsers(prev => new Set(prev).add(user.did));
      await GraphService.unmuteUser(user.did);
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
      title={t('settings.mutedAccounts')}
      data={mutedUsers}
      isLoading={loading}
      error={null}
      emptyIcon="volume-x"
      emptyTitle={t('settings.noMutedAccounts')}
      emptySubtitle={t('settings.mutedEmptySubtitle')}
      showFollowButton={true}
      followButtonAction="unmute"
      onActionPress={handleUnmuteUser}
    />
  );
};

export default MutedUsersScreen;
